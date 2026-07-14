"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// --- Types ---
type PlayerInfo = {
  id: string;
  name: string;
  rating: number;
  rank: { name: string; badge: string };
  score: number;
  combo: number;
  correct: number;
  wrong: number;
};

type BubbleData = {
  id: string;
  word: string;
  difficulty: string;
  x: number;
  y: number;
  choices: string[];
  lifetime: number;
  spawnedAt: number;
  popping: boolean;
  poppedBy: string | null;
  shaking: boolean;
};

type GamePhase = "menu" | "searching" | "match_found" | "countdown" | "playing" | "result";

const WS_URL = typeof window !== "undefined"
  ? (window.location.hostname === "localhost" ? "ws://localhost:3333" : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`)
  : "ws://localhost:3333";

const DIFF_CONFIG: Record<string, { points: number; color: string; bg: string; border: string }> = {
  easy: { points: 10, color: "#16a34a", bg: "#dcfce7", border: "#16a34a" },
  medium: { points: 25, color: "#ca8a04", bg: "#fef9c3", border: "#ca8a04" },
  hard: { points: 50, color: "#dc2626", bg: "#fee2e2", border: "#dc2626" },
};

function getRank(rating: number): { name: string; badge: string } {
  if (rating >= 1800) return { name: "Diamond", badge: "👑" };
  if (rating >= 1400) return { name: "Platinum", badge: "💎" };
  if (rating >= 1000) return { name: "Gold", badge: "🥇" };
  if (rating >= 600) return { name: "Silver", badge: "🥈" };
  return { name: "Bronze", badge: "🥉" };
}

function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => { const c = () => setM(window.innerWidth < 640); c(); window.addEventListener("resize", c); return () => window.removeEventListener("resize", c); }, []);
  return m;
}

function getBubbleSize(difficulty: string, mobile: boolean): number {
  const s = mobile ? { easy: 58, medium: 64, hard: 72 } : { easy: 76, medium: 84, hard: 94 };
  return s[difficulty as keyof typeof s] ?? s.medium;
}

function useFullscreen() {
  useEffect(() => {
    const nav = document.getElementById("main-nav");
    const main = document.getElementById("main-content");
    if (nav) nav.style.display = "none";
    if (main) { main.style.maxWidth = "none"; main.style.padding = "0"; main.style.margin = "0"; }
    return () => {
      if (nav) nav.style.display = "";
      if (main) { main.style.maxWidth = ""; main.style.padding = ""; main.style.margin = ""; }
    };
  }, []);
}

// --- Load/Save rating from localStorage ---
function loadProfile(): { name: string; rating: number; wins: number; losses: number } {
  if (typeof window === "undefined") return { name: "", rating: 1000, wins: 0, losses: 0 };
  try {
    const raw = localStorage.getItem("vocab-rank-profile");
    if (raw) return JSON.parse(raw);
  } catch {}
  return { name: "", rating: 1000, wins: 0, losses: 0 };
}

function saveProfile(p: { name: string; rating: number; wins: number; losses: number }) {
  localStorage.setItem("vocab-rank-profile", JSON.stringify(p));
}

// --- Main ---
export default function OnlineGamePage() {
  useFullscreen();
  const isMobile = useIsMobile();

  const wsRef = useRef<WebSocket | null>(null);
  const [phase, setPhase] = useState<GamePhase>("menu");
  const [profile, setProfile] = useState(loadProfile);
  const [nameInput, setNameInput] = useState(profile.name);
  const [myId, setMyId] = useState("");
  const [opponent, setOpponent] = useState<PlayerInfo | null>(null);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [searchRange, setSearchRange] = useState(100);
  const [searchTime, setSearchTime] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [bubbles, setBubbles] = useState<Map<string, BubbleData>>(new Map());
  const [activeBubble, setActiveBubble] = useState<BubbleData | null>(null);
  const activeBubbleRef = useRef<BubbleData | null>(null);
  const [answered, setAnswered] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(60000);
  const [popups, setPopups] = useState<{ id: string; x: number; y: number; text: string; color: string; at: number }[]>([]);
  const [flashMsg, setFlashMsg] = useState<{ word: string; meaningTh: string } | null>(null);
  const [result, setResult] = useState<{ players: PlayerInfo[]; winnerId: string; ratingChanges: Record<string, number> } | null>(null);
  const [error, setError] = useState("");

  // Cleanup popups
  useEffect(() => {
    const t = setInterval(() => setPopups((p) => p.filter((pp) => Date.now() - pp.at < 1500)), 300);
    return () => clearInterval(t);
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setError("");
      // Auto-join queue
      ws.send(JSON.stringify({ type: "find_match", name: nameInput.trim() || "Player", rating: profile.rating }));
      setPhase("searching");
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);

      switch (msg.type) {
        case "match_searching":
          setSearchRange(msg.range);
          setSearchTime(msg.waitTime);
          break;

        case "match_found":
          setMyId(msg.playerId);
          setOpponent(msg.opponent);
          setPlayers(msg.players);
          setPhase("match_found");
          break;

        case "countdown":
          setPhase("countdown");
          setCountdown(msg.count);
          break;

        case "game_start":
          setPhase("playing");
          setPlayers(msg.players);
          setBubbles(new Map());
          setTimeLeft(msg.duration);
          break;

        case "bubble_spawn":
          setBubbles((prev) => {
            const next = new Map(prev);
            next.set(msg.bubble.id, { ...msg.bubble, spawnedAt: Date.now(), popping: false, poppedBy: null, shaking: false });
            return next;
          });
          break;

        case "bubble_popped":
          setPlayers(msg.players);
          setBubbles((prev) => {
            const next = new Map(prev);
            const b = next.get(msg.bubbleId);
            if (b) {
              next.set(msg.bubbleId, { ...b, popping: true, poppedBy: msg.playerName });
              setTimeout(() => setBubbles((p) => { const n = new Map(p); n.delete(msg.bubbleId); return n; }), 500);
            }
            return next;
          });
          setPopups((p) => [...p, {
            id: `p-${Date.now()}`, x: bubbles.get(msg.bubbleId)?.x ?? 50, y: bubbles.get(msg.bubbleId)?.y ?? 50,
            text: `${msg.playerName} +${msg.points}${msg.multiplier > 1 ? ` x${msg.multiplier}` : ""}`,
            color: msg.playerId === myId ? "#16a34a" : "#3b82f6", at: Date.now(),
          }]);
          if (activeBubbleRef.current?.id === msg.bubbleId) closeModal();
          break;

        case "bubble_expired":
          setBubbles((prev) => { const n = new Map(prev); n.delete(msg.bubbleId); return n; });
          if (activeBubbleRef.current?.id === msg.bubbleId) closeModal();
          break;

        case "bubble_gone":
          closeModal();
          break;

        case "answer_wrong_remove":
          setPlayers(msg.players);
          if (msg.playerId === myId) {
            setFlashMsg({ word: msg.correctAnswer, meaningTh: msg.correctAnswer });
            setTimeout(() => setFlashMsg(null), 2000);
          }
          setBubbles((prev) => {
            const n = new Map(prev);
            const b = n.get(msg.bubbleId);
            if (b) n.set(msg.bubbleId, { ...b, shaking: true });
            setTimeout(() => {
              setBubbles((p) => {
                const nn = new Map(p);
                const bb = nn.get(msg.bubbleId);
                if (bb) nn.set(msg.bubbleId, { ...bb, shaking: false, popping: true });
                setTimeout(() => setBubbles((pp) => { const nnn = new Map(pp); nnn.delete(msg.bubbleId); return nnn; }), 400);
                return nn;
              });
            }, 400);
            return n;
          });
          setPopups((p) => [...p, {
            id: `p-${Date.now()}`, x: 50, y: 50,
            text: `${msg.playerName} ${msg.penalty}`, color: "#ef4444", at: Date.now(),
          }]);
          setTimeout(() => closeModal(), 600);
          break;

        case "score_update":
        case "player_joined":
        case "player_left":
          setPlayers(msg.players);
          break;

        case "tick":
          setTimeLeft(msg.timeLeft);
          break;

        case "game_over":
          setPhase("result");
          setResult({ players: msg.players, winnerId: msg.winnerId, ratingChanges: msg.ratingChanges ?? {} });
          // Update local profile
          const myResult = msg.players.find((p: PlayerInfo) => p.id === myId);
          if (myResult && msg.ratingChanges) {
            const change = msg.ratingChanges[myId] ?? 0;
            const won = msg.winnerId === myId;
            const updated = {
              name: nameInput.trim() || "Player",
              rating: Math.max(0, profile.rating + change),
              wins: profile.wins + (won ? 1 : 0),
              losses: profile.losses + (won ? 0 : 1),
            };
            setProfile(updated);
            saveProfile(updated);
          }
          break;

        case "match_cancelled":
          setPhase("menu");
          break;

        case "error":
          setError(msg.message);
          break;
      }
    };

    ws.onclose = () => {
      if (phase === "playing") setError("Connection lost");
    };

    ws.onerror = () => setError("Cannot connect to game server");
  }, [nameInput, profile, phase, myId]);

  function sendMsg(msg: Record<string, unknown>) {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(msg));
  }

  function closeModal() {
    setActiveBubble(null);
    activeBubbleRef.current = null;
    setAnswered(null);
  }

  function handleBubbleClick(bubble: BubbleData) {
    if (activeBubbleRef.current || phase !== "playing") return;
    setActiveBubble(bubble);
    activeBubbleRef.current = bubble;
    setAnswered(null);
  }

  function handleAnswer(choice: string) {
    if (!activeBubbleRef.current || answered) return;
    setAnswered(choice); // Lock immediately
    sendMsg({ type: "answer", bubbleId: activeBubbleRef.current.id, choice });
    // Fallback: close modal after 3s if server doesn't respond
    setTimeout(() => closeModal(), 3000);
  }

  const rank = getRank(profile.rating);
  const winRate = profile.wins + profile.losses > 0 ? Math.round((profile.wins / (profile.wins + profile.losses)) * 100) : 0;

  // --- Menu ---
  if (phase === "menu") {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-white px-6 safe-area-pad">
        <div className="w-full max-w-sm space-y-6 text-center">
          <h1 className="text-3xl sm:text-4xl font-black">Play Online</h1>

          {/* Rating card */}
          <div className="rounded-2xl border border-gray-200 p-5 space-y-3">
            <div className="text-4xl">{rank.badge}</div>
            <div className="text-2xl font-black">{profile.rating}</div>
            <div className="text-sm font-medium" style={{ color: profile.rating >= 1400 ? "#8b5cf6" : profile.rating >= 1000 ? "#ca8a04" : "#6b7280" }}>
              {rank.name}
            </div>
            <div className="flex justify-center gap-4 text-xs text-gray-400">
              <span>W: {profile.wins}</span>
              <span>L: {profile.losses}</span>
              <span>Win: {winRate}%</span>
            </div>
          </div>

          <input
            type="text"
            placeholder="Your name"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            className="w-full rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-center text-lg focus:border-blue-500 focus:outline-none"
            maxLength={12}
          />

          <button
            onClick={() => {
              if (!nameInput.trim()) { setError("Enter your name"); return; }
              const updated = { ...profile, name: nameInput.trim() };
              setProfile(updated);
              saveProfile(updated);
              connect();
            }}
            className="w-full rounded-2xl bg-blue-600 text-white py-4 text-lg font-bold hover:bg-blue-500 active:scale-[0.97] transition-all"
          >
            Find Match
          </button>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <a href="/game" className="block text-sm text-gray-400 hover:text-gray-600">&larr; Back</a>
        </div>
      </div>
    );
  }

  // --- Searching ---
  if (phase === "searching") {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-white px-6">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="text-5xl animate-pulse">{rank.badge}</div>
          <h2 className="text-xl font-bold">Finding match...</h2>

          {/* Animated dots */}
          <div className="flex justify-center gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-3 w-3 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>

          <div className="text-sm text-gray-400 space-y-1">
            <p>Rating range: {Math.max(0, profile.rating - searchRange)} — {profile.rating + searchRange}</p>
            <p>Searching for {searchTime}s</p>
            {searchRange > 200 && <p className="text-yellow-500">Widening search...</p>}
          </div>

          <button
            onClick={() => { sendMsg({ type: "cancel_match" }); setPhase("menu"); wsRef.current?.close(); }}
            className="rounded-xl border border-gray-200 px-8 py-3 text-sm font-medium hover:border-gray-400 active:scale-[0.97]"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // --- Match Found ---
  if (phase === "match_found" && opponent) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-white px-6">
        <div className="w-full max-w-md space-y-6 text-center">
          <h2 className="text-2xl font-black">Match Found!</h2>

          <div className="flex items-center justify-center gap-6">
            {/* Me */}
            <div className="text-center space-y-1">
              <div className="text-3xl">{rank.badge}</div>
              <p className="font-bold">{nameInput}</p>
              <p className="text-sm text-gray-400">{profile.rating}</p>
            </div>

            <div className="text-2xl font-black text-gray-300">VS</div>

            {/* Opponent */}
            <div className="text-center space-y-1">
              <div className="text-3xl">{opponent.rank.badge}</div>
              <p className="font-bold">{opponent.name}</p>
              <p className="text-sm text-gray-400">{opponent.rating}</p>
            </div>
          </div>

          <p className="text-sm text-gray-400">Starting soon...</p>
        </div>
      </div>
    );
  }

  // --- Countdown ---
  if (phase === "countdown") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="text-8xl font-black text-blue-600 animate-ping">{countdown}</div>
      </div>
    );
  }

  // --- Result ---
  if (phase === "result" && result) {
    const me = result.players.find((p) => p.id === myId);
    const opp = result.players.find((p) => p.id !== myId);
    const isWinner = result.winnerId === myId;
    const myChange = result.ratingChanges[myId] ?? 0;

    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-white px-6 safe-area-pad">
        <div className="w-full max-w-md space-y-5 text-center">
          <h1 className="text-3xl sm:text-4xl font-black">{isWinner ? "You Win!" : "You Lose"}</h1>

          {/* Score comparison */}
          <div className="flex items-center justify-center gap-6">
            <div className="text-center">
              <p className="text-xs text-gray-400">{me?.name}</p>
              <p className="text-4xl font-black" style={{ color: isWinner ? "#16a34a" : "#dc2626" }}>{me?.score ?? 0}</p>
            </div>
            <div className="text-gray-300 text-lg">vs</div>
            <div className="text-center">
              <p className="text-xs text-gray-400">{opp?.name}</p>
              <p className="text-4xl font-black text-gray-400">{opp?.score ?? 0}</p>
            </div>
          </div>

          {/* Rating change */}
          <div className="rounded-2xl border border-gray-200 p-4 space-y-2">
            <p className="text-sm text-gray-400">Rating</p>
            <div className="flex items-center justify-center gap-3">
              <span className="text-lg text-gray-400">{profile.rating - myChange}</span>
              <span className="text-xl font-bold" style={{ color: myChange >= 0 ? "#16a34a" : "#dc2626" }}>
                → {profile.rating}
              </span>
              <span className="text-sm font-bold" style={{ color: myChange >= 0 ? "#16a34a" : "#dc2626" }}>
                ({myChange >= 0 ? "+" : ""}{myChange})
              </span>
            </div>
            <div className="text-2xl">{getRank(profile.rating).badge} {getRank(profile.rating).name}</div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-2 text-center">
              <div className="text-lg font-bold text-green-600">{me?.correct ?? 0}</div>
              <div className="text-[10px] text-gray-400">Correct</div>
            </div>
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-2 text-center">
              <div className="text-lg font-bold text-red-600">{me?.wrong ?? 0}</div>
              <div className="text-[10px] text-gray-400">Wrong</div>
            </div>
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-2 text-center">
              <div className="text-lg font-bold text-yellow-600">x{me?.combo ?? 0}</div>
              <div className="text-[10px] text-gray-400">Max Combo</div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => { wsRef.current?.close(); setPhase("menu"); setBubbles(new Map()); setResult(null); }}
              className="flex-1 rounded-xl bg-blue-600 text-white py-3 font-bold hover:bg-blue-500 active:scale-[0.97]"
            >
              Play Again
            </button>
            <a href="/game" className="flex-1 rounded-xl border border-gray-200 py-3 text-center font-medium hover:border-gray-400">
              Menu
            </a>
          </div>
        </div>
      </div>
    );
  }

  // --- Playing ---
  const timerPct = (timeLeft / 60000) * 100;
  const timerColor = timeLeft > 20000 ? "#3b82f6" : timeLeft > 10000 ? "#eab308" : "#ef4444";
  const me = players.find((p) => p.id === myId);
  const opp = players.find((p) => p.id !== myId);

  return (
    <div className="fixed inset-0 flex flex-col bg-white select-none touch-manipulation">
      {/* HUD */}
      <div className="shrink-0 px-3 sm:px-4 pt-2 sm:pt-3 pb-1 sm:pb-2 z-30 safe-top">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-base sm:text-lg">{getRank(me?.rating ?? 1000).badge}</span>
            <div>
              <p className="text-[10px] text-green-600 font-medium leading-none">{me?.name}</p>
              <p className="text-2xl sm:text-3xl font-black text-gray-900 tabular-nums leading-none">{me?.score ?? 0}</p>
            </div>
            {(me?.combo ?? 0) > 1 && (
              <div className="rounded-full px-2 py-0.5 text-xs font-black bg-yellow-100 text-yellow-600">
                x{Math.min(me?.combo ?? 0, 5)}
              </div>
            )}
          </div>

          <div className="text-lg sm:text-xl font-mono font-black tabular-nums" style={{ color: timerColor }}>
            {Math.ceil(timeLeft / 1000)}
          </div>

          <div className="flex items-center gap-2">
            <div className="text-right">
              <p className="text-[10px] text-blue-600 font-medium leading-none">{opp?.name}</p>
              <p className="text-2xl sm:text-3xl font-black text-gray-900 tabular-nums leading-none">{opp?.score ?? 0}</p>
            </div>
            <span className="text-base sm:text-lg">{getRank(opp?.rating ?? 1000).badge}</span>
          </div>
        </div>
        <div className="h-1.5 sm:h-2 rounded-full bg-gray-100">
          <div className="h-1.5 sm:h-2 rounded-full transition-all duration-200 ease-linear" style={{ width: `${timerPct}%`, backgroundColor: timerColor }} />
        </div>
      </div>

      {/* Bubbles */}
      <div className="relative flex-1 overflow-hidden">
        {[...bubbles.values()].map((b) => (
          <OnlineBubble key={b.id} bubble={b} disabled={!!activeBubble} onClick={() => handleBubbleClick(b)} isMobile={isMobile} />
        ))}

        {popups.map((p) => (
          <div key={p.id} className="absolute pointer-events-none font-black text-lg sm:text-xl animate-float-up" style={{ left: `${p.x}%`, top: `${p.y}%`, color: p.color }}>
            {p.text}
          </div>
        ))}

        {/* Flash explanation on wrong answer */}
        {flashMsg && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none animate-flash-in">
            <div className="rounded-xl bg-gray-900 text-white px-5 py-3 shadow-lg text-center max-w-xs">
              <p className="text-sm text-gray-300">{flashMsg.meaningTh}</p>
            </div>
          </div>
        )}

        {activeBubble && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 p-4">
            <div className="w-full max-w-sm max-h-[90%] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 space-y-3 shadow-2xl">
              <div className="text-center">
                <p className="text-xl sm:text-2xl font-bold" style={{ color: DIFF_CONFIG[activeBubble.difficulty]?.color }}>
                  {activeBubble.word}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Answer fast!</p>
              </div>
              <div className="grid gap-2">
                {activeBubble.choices.map((c, idx) => {
                  let cls = "rounded-xl border-2 px-3 py-2.5 text-left text-sm transition-all duration-150";
                  if (answered) {
                    if (c === answered) cls += " border-green-500 bg-green-50 text-green-700";
                    else cls += " border-gray-100 text-gray-300";
                  } else {
                    cls += " border-gray-200 text-gray-700 active:bg-gray-50 active:border-blue-400 cursor-pointer";
                  }
                  return (
                    <button key={idx} className={cls} onClick={() => handleAnswer(c)} disabled={!!answered}>
                      <span className="mr-2 text-xs text-gray-400">{String.fromCharCode(65 + idx)}</span>{c}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        .touch-manipulation { touch-action: manipulation; }
        .safe-area-pad { padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }
        .safe-top { padding-top: max(8px, env(safe-area-inset-top)); }
        .safe-bottom { padding-bottom: max(16px, env(safe-area-inset-bottom)); }
        @keyframes float-up { 0% { transform: translateY(0); opacity: 1; } 100% { transform: translateY(-50px); opacity: 0; } }
        .animate-float-up { animation: float-up 1.2s ease-out forwards; }
        @keyframes flash-in { 0% { opacity: 0; transform: translateY(-10px); } 10% { opacity: 1; transform: translateY(0); } 80% { opacity: 1; } 100% { opacity: 0; } }
        .animate-flash-in { animation: flash-in 2s ease-out forwards; }
        @keyframes pop { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.4); opacity: 0.5; } 100% { transform: scale(1.8); opacity: 0; } }
        @keyframes shake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-6px); } 40% { transform: translateX(6px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(4px); } }
      `}</style>
    </div>
  );
}

// --- Bubble component ---
function OnlineBubble({ bubble, disabled, onClick, isMobile }: { bubble: BubbleData; disabled: boolean; onClick: () => void; isMobile: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const animRef = useRef(0);
  const cfg = DIFF_CONFIG[bubble.difficulty] ?? DIFF_CONFIG.medium;
  const size = getBubbleSize(bubble.difficulty, isMobile);

  const seed = bubble.id.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  const freqX = 0.1 + (seed % 7) * 0.03;
  const freqY = 0.08 + (seed % 5) * 0.025;
  const ampX = isMobile ? 3 + (seed % 6) * 1.5 : 5 + (seed % 8) * 2;
  const ampY = isMobile ? 2 + (seed % 5) * 1.5 : 4 + (seed % 6) * 2;
  const phase = (seed * 2.3) % (Math.PI * 2);

  useEffect(() => {
    const el = ref.current;
    if (!el || bubble.popping) return;
    const start = performance.now();
    function tick(now: number) {
      if (!el) return;
      const t = (now - start) / 1000;
      const dx = Math.sin(t * freqX + phase) * ampX + Math.sin(t * freqX * 0.6 + phase * 1.7) * ampX * 0.3;
      const dy = Math.cos(t * freqY + phase * 0.8) * ampY + Math.cos(t * freqY * 0.5 + phase * 2.1) * ampY * 0.4;
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      animRef.current = requestAnimationFrame(tick);
    }
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [freqX, freqY, ampX, ampY, phase, bubble.popping]);

  const age = Date.now() - bubble.spawnedAt;
  const fadeStart = bubble.lifetime - 2000;
  const opacity = bubble.popping ? 0 : age > fadeStart ? Math.max(0.3, 1 - (age - fadeStart) / 2000) : 1;
  const fontSize = Math.max(7, Math.min(13, (size - 18) / (bubble.word.length * 0.55)));

  return (
    <button ref={ref} onClick={disabled ? undefined : onClick}
      className="absolute rounded-full flex items-center justify-center will-change-transform"
      style={{
        width: size, height: size,
        left: `calc(${bubble.x}% - ${size / 2}px)`, top: `calc(${bubble.y}% - ${size / 2}px)`,
        backgroundColor: cfg.bg, border: `2.5px solid ${cfg.border}`,
        opacity, cursor: disabled ? "default" : "pointer",
        animation: bubble.popping ? "pop 0.4s ease-out forwards" : bubble.shaking ? "shake 0.4s ease-out" : undefined,
        transition: "opacity 1s ease", zIndex: bubble.popping ? 10 : 1,
      }}
    >
      <span className="text-center leading-tight font-bold select-none pointer-events-none break-all"
        style={{ fontSize: `${fontSize}px`, width: size - 16, color: cfg.color }}>
        {bubble.word}
      </span>
      {bubble.poppedBy && bubble.popping && (
        <span className="absolute -bottom-5 text-xs font-bold text-blue-600 whitespace-nowrap">{bubble.poppedBy}</span>
      )}
    </button>
  );
}
