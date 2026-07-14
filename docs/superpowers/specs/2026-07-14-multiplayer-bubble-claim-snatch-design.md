# Multiplayer: Claim-on-Tap + Snatch Reaction

**Date:** 2026-07-14
**Scope:** `/game/online` (ranked) and `/game/multi` (VS Friend)
**Status:** Approved, ready for implementation plan

## Problem

In multiplayer, tapping a bubble opens a choice modal. Two issues:

1. **The bubble can expire out from under you.** The WebSocket server expires
   each bubble after its `lifetime` and broadcasts `bubble_expired`; the client
   then closes the open modal. A player who tapped in time — and is mid-answer —
   loses the bubble. Players report this as the modal "fading away."

2. **A client-only fix is not enough.** Even if the client kept the modal open,
   the server has already deleted the bubble, so the late answer is rejected with
   `bubble_gone` and scores nothing.

## Goal

Tapping a bubble should **claim** it: it stops expiring and the player can answer
for score at any time. The **only** way a claimed bubble is taken away is the
opponent answering it first (a "snatch"). A snatch triggers a short, playful
"you got snatched" reaction with a random cheeky emoji + Thai taunt.

## Non-goals

- No cancel/close button on the modal (out of scope; the competitive "commit to
  your tap" feel is intentional). May revisit later.
- No "opponent is eyeing this bubble" indicator.
- No changes to solo mode (`/game`) — it has its own separate lifetime logic.
- No server-side rating/persistence changes (unrelated).

## Design

Two parts: **A. server-side claim lock** (the mechanic) and **B. snatch reaction**
(the fun). Both modes share one client component.

### Part A — Server-side claim lock

**New client→server message:** `claim_bubble { bubbleId }`

**Server changes (`packages/ws/src/server.ts`):**

1. Add `claimed: boolean` to the `GameBubble` type; initialize `false` in
   `spawnBubble`.
2. Handle `claim_bubble`: resolve the room the same way the `answer` handler does
   (`currentRoomId ?? playerRoomMap.get(playerId)`); require `gameState === "playing"`;
   look up the bubble; if found, set `bubble.claimed = true` and `broadcast` a
   `bubble_claimed { bubbleId }` to the room. If the bubble is already gone, do
   nothing (the client will resolve via `bubble_gone` when it answers).
3. In the expire loop (`expireTimer`), skip claimed bubbles:
   `if (bubble.claimed) continue;` before the lifetime check.

The existing `answer` handler is unchanged: answering a claimed bubble pops it
(correct) or removes it (wrong) exactly as today.

**Bound on lingering bubbles:** a player can have only one open modal at a time
(the client disables other bubbles while a modal is open) and the modal has no way
to close without answering, so a claimed bubble is always resolved by an answer or
a snatch. With two players, at most two claimed-unanswered bubbles exist at once —
well under `MAX_BUBBLES` (10). No cleanup timer needed.

**Client changes (both `online/page.tsx` and `multi/page.tsx`):**

1. On bubble tap (`handleBubbleClick`), after opening the modal, send
   `{ type: "claim_bubble", bubbleId: bubble.id }`.
2. Add `claimed?: boolean` to the client `BubbleData` type.
3. Handle `bubble_claimed`: set `claimed = true` on that bubble in the `bubbles`
   map.
4. In the bubble component (`MultiBubble` / its online equivalent), when
   `bubble.claimed` is true, force `opacity = 1` (skip the lifetime fade) so a
   claimed bubble no longer visually fades on the opponent's board.
5. In the `bubble_expired` handler, **remove** the "close my active modal" line.
   Only delete the bubble from the map. (A claimed bubble should not receive
   `bubble_expired`; if a rare pre-claim race deletes it server-side, the player's
   answer will bounce with `bubble_gone`, which still closes the modal.)

### Part B — Snatch reaction

A "snatch" is when the player's **currently open** bubble is answered first by the
opponent:

- `bubble_popped` with `playerId !== myId` and `bubbleId === activeBubbleRef.current?.id`
  → opponent answered correctly. Variant: **stolen**.
- `answer_wrong_remove` with `playerId !== myId` and `bubbleId === activeBubbleRef.current?.id`
  → opponent grabbed it but answered wrong. Variant: **fumbled** (schadenfreude).

Today both cases silently `closeModal`. New behavior: set a `snatch` state that
renders `SnatchOverlay` on top of the choice modal, then after ~1300ms clear it and
`closeModal`. The player's own wrong answer (`playerId === myId`) is unchanged.

**Shared component:** `apps/web/app/game/_components/SnatchOverlay.tsx`

- Presentational. Props: `{ emoji: string; text: string }` (already-picked). Renders
  a centered overlay (z-index above the modal, e.g. z-30) with a large spinning +
  bouncing emoji and the taunt text with a wobble-in animation, plus a subtle screen
  shake. Self-contained CSS (scoped `<style>` with unique keyframe names) so it does
  not depend on either page's global styles.
- Export a helper `pickSnatchTaunt(variant: "stolen" | "fumbled", snatcher: string):
  { emoji: string; text: string }` that randomly selects an emoji and a taunt line,
  interpolating the snatcher's name. Keeping the pools here avoids duplicating copy
  across the two pages.

**Taunt copy (Thai):**

_stolen_ — emoji pool `😜 🤪 😏 😎 🫵 🤣`; lines:
- `โดนแย่งไปแล้วจ้า~`
- `ช้าไป 0.1 วิ!`
- `{snatcher} เอาไปกิน 😏`
- `มือไวกว่า...อดเลย 🫵`
- `อดจ้า 555`

_fumbled_ — emoji pool `🤡 🤣 😹`; lines:
- `{snatcher} แย่งไปแต่ตอบผิด! 🤡`
- `แย่งแล้วพลาดเอง 5555`
- `เสียมารยาทแถมตอบผิด 😹`

### Message protocol summary

| Message | Direction | Payload | Effect |
|---------|-----------|---------|--------|
| `claim_bubble` | client → server | `{ bubbleId }` | Mark bubble claimed; stop its expiry |
| `bubble_claimed` | server → clients | `{ bubbleId }` | Clients stop fading that bubble |

Existing `bubble_popped`, `answer_wrong_remove`, `bubble_expired`, `bubble_gone`
are reused unchanged on the wire; only client handling changes.

## Files touched

- `packages/ws/src/server.ts` — `GameBubble.claimed`, `claim_bubble` handler,
  `bubble_claimed` broadcast, expire-loop skip.
- `apps/web/app/game/online/page.tsx` — claim on tap, `bubble_claimed`/snatch
  handling, `bubble_expired` change, no-fade-when-claimed.
- `apps/web/app/game/multi/page.tsx` — same client changes as online.
- `apps/web/app/game/_components/SnatchOverlay.tsx` — new shared component + taunt
  helper.

## Edge cases

- **Tap in the last moment before claim arrives:** server may expire the bubble in
  the tiny window before `claim_bubble` is processed. The modal stays open (it uses
  a state snapshot); on answer the server returns `bubble_gone` and the modal
  closes. Acceptable given the ~13–15s lifetime vs. sub-100ms RTT.
- **Both players claim the same bubble:** `claimed = true` is idempotent; both
  modals open; first to answer wins, the other sees the snatch reaction.
- **Opponent disconnects mid-game:** unchanged — `endGame` runs when players drop
  below two.
- **Player claims and never answers:** self-punishing (can't tap other bubbles),
  bubble resolved only by their eventual answer; harmless and bounded.

## Testing

- **Server unit-level:** claiming a bubble sets `claimed` and it survives past its
  lifetime in the expire loop; answering a claimed bubble still pops/removes it.
- **Manual multiplayer (both modes), via two browser windows:**
  1. Tap a bubble, wait past the old ~13–15s lifetime without answering → modal
     stays open, answer still scores.
  2. Tap a bubble; have the opponent answer it first → snatch overlay appears with a
     random taunt, then the modal closes.
  3. Opponent answers the shared bubble wrong while you have it open → "fumbled"
     variant appears.
  4. Solo mode unaffected.
