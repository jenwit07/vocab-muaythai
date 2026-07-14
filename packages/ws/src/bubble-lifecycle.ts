// Pure bubble-lifetime logic, kept out of server.ts so it can be reasoned about
// (and unit-tested) without opening a WebSocket.

export type ExpiryBubble = {
  id: string;
  spawnedAt: number;
  lifetime: number;
  claimed: boolean;
};

// Returns the ids of bubbles that have outlived their lifetime AND have not been
// claimed by a player. A claimed bubble never expires — a player who tapped it
// keeps their answer window open until they answer or an opponent snatches it.
export function getExpiredBubbleIds(
  bubbles: Iterable<ExpiryBubble>,
  now: number
): string[] {
  const expired: string[] = [];
  for (const b of bubbles) {
    if (b.claimed) continue;
    if (now - b.spawnedAt > b.lifetime) expired.push(b.id);
  }
  return expired;
}
