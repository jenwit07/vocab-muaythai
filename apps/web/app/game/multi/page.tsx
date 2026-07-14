"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// --- Types ---
type PlayerInfo = {
  id: string;
  name: string;
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

type GamePhase = "connect" | "lobby" | "countdown" | "playing" | "result";

const WS_URL = typeof window !== "undefined"
  ? (window.location.hostname === "localhost" ? "ws://localhost:3333" : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`)
  : "ws://localhost:3333";

const DIFF_CONFIG: Record<string, { points: number; color: string; bg: string; border: string; size: number }> = {
  easy: { points: 10, color: "#4ade80", bg: "#4ade8030", border: "#4ade80", size: 76 },
  medium: { points: 25, color: "#facc15", bg: "#facc1530", border: "#facc15", size: 84 },
  hard: { points: 50, color: "#f87171", bg: "#f8717130", border: "#f87171", size: 94 },
};

// --- Fullscreen ---
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

// --- Main ---
export default function MultiPlayerGame() {
  useFullscreen();

  const wsRef = useRef<WebSocket | null>(null);
  const [phase, setPhase] = useState<GamePhase>("connect");
  const [playerName, setPlayerName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [myId, setMyId] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [bubbles, setBubbles] = useState<Map<string, BubbleData>>(new Map());
  const [activeBubble, setActiveBubble] = useState<BubbleData | null>(null);
  const activeBubbleRef = useRef<BubbleData | null>(null);
  const [answered, setAnswered] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(60000);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState("");
  const [popups, setPopups] = useState<{ id: string; x: number; y: number; text: string; color: string; at: number }[]>([]);
  const [result, setResult] = useState<{ players: PlayerInfo[]; winnerId: string; winnerName: string } | null>(null);

  // Cleanup popups
  useEffect(() => {
    const t = setInterval(() => {
      setPopups((p) => p.filter((pp) => Date.now() - pp.at < 1500));
    }, 300);
    return () => clearInterval(t);
  }, []);

  const connect = useCallback(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setError("");

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);

      switch (msg.type) {
        case "room_created":
          setRoomId(msg.roomId);
          setMyId(msg.playerId);
          setPlayers(msg.players);
          setPhase("lobby");
          break;

        case "room_joined":
          setRoomId(msg.roomId);
          setMyId(msg.playerId);
          setPlayers(msg.players);
          setPhase("lobby");
          break;

        case "player_joined":
        case "player_left":
        case "score_update":
          setPlayers(msg.players);
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
            next.set(msg.bubble.id, {
              ...msg.bubble,
              spawnedAt: Date.now(),
              popping: false,
              poppedBy: null,
              shaking: false,
            });
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
              setTimeout(() => {
                setBubbles((p) => { const n = new Map(p); n.delete(msg.bubbleId); return n; });
              }, 500);
            }
            return next;
          });
          // Score popup
          setPopups((p) => {
            const b = bubbles.get(msg.bubbleId);
            return [...p, {
              id: `p-${Date.now()}`,
              x: b?.x ?? 50,
              y: b?.y ?? 50,
              text: `${msg.playerName} +${msg.points}${msg.multiplier > 1 ? ` x${msg.multiplier}` : ""}`,
              color: msg.playerId === myId ? "#4ade80" : "#60a5fa",
              at: Date.now(),
            }];
          });
          // Close choice overlay if this was our active bubble
          if (activeBubbleRef.current?.id === msg.bubbleId) {
            closeModal();
          }
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
          setAnswered(msg.correctAnswer);
          // Shake then remove bubble
          setBubbles((prev) => {
            const next = new Map(prev);
            const b = next.get(msg.bubbleId);
            if (b) next.set(msg.bubbleId, { ...b, shaking: true });
            setTimeout(() => {
              setBubbles((p) => {
                const n = new Map(p);
                const bb = n.get(msg.bubbleId);
                if (bb) n.set(msg.bubbleId, { ...bb, shaking: false, popping: true });
                setTimeout(() => setBubbles((pp) => { const nn = new Map(pp); nn.delete(msg.bubbleId); return nn; }), 400);
                return n;
              });
            }, 400);
            return next;
          });
          setPopups((p) => [...p, {
            id: `p-${Date.now()}`, x: bubbles.get(msg.bubbleId)?.x ?? 50, y: bubbles.get(msg.bubbleId)?.y ?? 50,
            text: `${msg.playerName} ${msg.penalty}`, color: "#ef4444", at: Date.now(),
          }]);
          setTimeout(() => closeModal(), 800);
          break;

        case "tick":
          setTimeLeft(msg.timeLeft);
          break;

        case "game_over":
          setPhase("result");
          setResult({ players: msg.players, winnerId: msg.winnerId, winnerName: msg.winnerName });
          break;

        case "error":
          setError(msg.message);
          break;
      }
    };

    ws.onclose = () => {
      if (phase === "playing") setError("Connection lost");
    };

    ws.onerror = () => setError("Cannot connect to game server. Make sure it's running.");
  }, [phase, myId]);

  function sendMsg(msg: Record<string, unknown>) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
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
    setAnswered(choice); // Lock immediately — prevent double tap
    sendMsg({ type: "answer", bubbleId: activeBubbleRef.current.id, choice });
    // Server will respond with bubble_popped or answer_wrong_remove
    // Fallback: close modal after 3s if server doesn't respond
    setTimeout(() => { closeModal(); }, 3000);
  }

  // --- Connect Screen ---
  if (phase === "connect") {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-white px-6">
        <div className="w-full max-w-sm space-y-6 text-center">
          <h1 className="text-4xl font-black">
            <span className="text-green-500">Bubble</span>{" "}
            <span className="text-yellow-500">Pop</span>{" "}
            <span className="text-red-500">VS</span>
          </h1>
          <p className="text-gray-500 text-sm">Play with friends — same board, race to answer!</p>

          <input
            type="text"
            placeholder="Your name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            className="w-full rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-center text-lg focus:border-blue-500 focus:outline-none"
            maxLength={12}
          />

          <div className="grid gap-3">
            <button
              onClick={() => {
                if (!playerName.trim()) return setError("Enter your name");
                connect();
                setTimeout(() => sendMsg({ type: "create_room", name: playerName.trim() }), 500);
              }}
              className="rounded-xl bg-blue-600 py-4 text-lg font-bold text-white hover:bg-blue-500"
            >
              Create Room
            </button>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Room code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="flex-1 rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-center text-lg tracking-widest uppercase focus:border-blue-500 focus:outline-none"
                maxLength={4}
              />
              <button
                onClick={() => {
                  if (!playerName.trim()) return setError("Enter your name");
                  if (!joinCode.trim()) return setError("Enter room code");
                  connect();
                  setTimeout(() => sendMsg({ type: "join_room", roomId: joinCode.trim(), name: playerName.trim() }), 500);
                }}
                className="rounded-xl bg-green-600 px-6 py-3 font-bold text-white hover:bg-green-500"
              >
                Join
              </button>
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <a href="/game" className="block text-sm text-gray-400 hover:text-gray-600">
            &larr; Solo mode
          </a>
        </div>
      </div>
    );
  }

  // --- Lobby ---
  if (phase === "lobby") {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-white px-6">
        <div className="w-full max-w-sm space-y-6 text-center">
          <h2 className="text-2xl font-bold">Room</h2>
          <div className="text-5xl font-black tracking-[0.3em] text-blue-600">{roomId}</div>
          <p className="text-sm text-gray-400">Share this code with your friend</p>

          <div className="space-y-2">
            <p className="text-xs text-gray-400">Players ({players.length}/4)</p>
            {players.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-center gap-2 rounded-xl bg-gray-100 px-4 py-3"
              >
                <span className="h-2 w-2 rounded-full bg-green-400" />
                <span className="font-medium">{p.name}</span>
                {p.id === myId && <span className="text-xs text-gray-400">(you)</span>}
              </div>
            ))}
          </div>

          {players.length >= 2 ? (
            <button
              onClick={() => sendMsg({ type: "start_game" })}
              className="w-full rounded-xl bg-green-600 py-4 text-lg font-bold text-white hover:bg-green-500"
            >
              Start Game!
            </button>
          ) : (
            <p className="text-gray-400 text-sm">Waiting for players...</p>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>
      </div>
    );
  }

  // --- Countdown ---
  if (phase === "countdown") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="text-8xl font-black text-blue-600 animate-ping">{countdown}</div>
        </div>
      </div>
    );
  }

  // --- Result ---
  if (phase === "result" && result) {
    const me = result.players.find((p) => p.id === myId);
    const isWinner = result.winnerId === myId;
    const sorted = [...result.players].sort((a, b) => b.score - a.score);

    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-white px-6">
        <div className="w-full max-w-md space-y-6 text-center">
          <h1 className="text-4xl font-black">
            {isWinner ? "You Win!" : "Game Over"}
          </h1>

          {/* Scoreboard */}
          <div className="space-y-2">
            {sorted.map((p, i) => (
              <div
                key={p.id}
                className={`flex items-center justify-between rounded-xl px-5 py-4 ${
                  i === 0 ? "bg-yellow-500/10 border border-yellow-500/30" : "bg-gray-100"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-black text-gray-300">#{i + 1}</span>
                  <div className="text-left">
                    <p className="font-bold">
                      {p.name}
                      {p.id === myId && <span className="text-xs text-gray-400 ml-1">(you)</span>}
                    </p>
                    <p className="text-xs text-gray-400">
                      {p.correct} correct · {p.wrong} wrong
                    </p>
                  </div>
                </div>
                <div className="text-2xl font-black" style={{ color: i === 0 ? "#facc15" : "#9ca3af" }}>
                  {p.score}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => window.location.reload()}
              className="flex-1 rounded-xl bg-blue-600 py-3 font-bold text-white hover:bg-blue-500"
            >
              Play Again
            </button>
            <a
              href="/game"
              className="flex-1 rounded-xl border border-gray-200 py-3 text-center font-medium hover:border-gray-400"
            >
              Solo Mode
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
  const opponent = players.find((p) => p.id !== myId);

  return (
    <div className="fixed inset-0 flex flex-col bg-white select-none">
      {/* HUD — both scores */}
      <div className="shrink-0 px-4 pt-3 pb-2 z-30">
        <div className="flex items-center justify-between mb-2">
          {/* My score (left) */}
          <div className="flex items-center gap-3">
            <div>
              <p className="text-xs text-green-600 font-medium">{me?.name ?? "You"}</p>
              <p className="text-3xl font-black text-gray-900 tabular-nums">{me?.score ?? 0}</p>
            </div>
            {(me?.combo ?? 0) > 1 && (
              <div className="rounded-full px-2 py-0.5 text-xs font-black bg-yellow-500/20 text-yellow-600">
                x{Math.min(me?.combo ?? 0, 5)}
              </div>
            )}
          </div>

          {/* Timer (center) */}
          <div className="text-center">
            <div className="text-2xl font-mono font-black tabular-nums" style={{ color: timerColor }}>
              {Math.ceil(timeLeft / 1000)}
            </div>
          </div>

          {/* Opponent score (right) */}
          <div className="text-right">
            <p className="text-xs text-blue-600 font-medium">{opponent?.name ?? "Opponent"}</p>
            <p className="text-3xl font-black text-gray-900 tabular-nums">{opponent?.score ?? 0}</p>
          </div>
        </div>

        <div className="h-2 rounded-full bg-gray-100">
          <div
            className="h-2 rounded-full transition-all duration-200 ease-linear"
            style={{ width: `${timerPct}%`, backgroundColor: timerColor }}
          />
        </div>
      </div>

      {/* Bubble area */}
      <div className="relative flex-1 overflow-hidden" data-canvas="true">
        {[...bubbles.values()].map((b) => (
          <MultiBubble
            key={b.id}
            bubble={b}
            disabled={!!activeBubble}
            onClick={() => handleBubbleClick(b)}
          />
        ))}

        {/* Popups */}
        {popups.map((p) => (
          <div
            key={p.id}
            className="absolute pointer-events-none font-black text-xl animate-float-up"
            style={{ left: `${p.x}%`, top: `${p.y}%`, color: p.color }}
          >
            {p.text}
          </div>
        ))}

        {/* Choice overlay */}
        {activeBubble && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 p-4">
            <div className="w-full max-w-sm max-h-[90%] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 space-y-3 shadow-2xl">
              <div className="text-center">
                <p
                  className="text-2xl font-bold"
                  style={{ color: DIFF_CONFIG[activeBubble.difficulty]?.color ?? "white" }}
                >
                  {activeBubble.word}
                </p>
                <p className="text-xs text-gray-400 mt-1">Answer fast — others can steal it!</p>
              </div>

              <div className="grid gap-2">
                {activeBubble.choices.map((c, idx) => {
                  let cls = "rounded-xl border-2 px-4 py-3 text-left text-sm transition-all duration-200";
                  if (answered) {
                    // Show correct answer (from server response)
                    if (c === answered) cls += " border-green-500 bg-green-500/10 text-green-700";
                    else cls += " border-gray-200 text-gray-400";
                  } else {
                    cls += " border-gray-200 text-gray-700 hover:border-blue-500/50 hover:bg-gray-50 cursor-pointer active:scale-[0.98]";
                  }
                  return (
                    <button key={idx} className={cls} onClick={() => handleAnswer(c)} disabled={!!answered}>
                      <span className="mr-2 text-xs text-gray-400">{String.fromCharCode(65 + idx)}</span>
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes float-up {
          0% { transform: translateY(0); opacity: 1; }
          100% { transform: translateY(-60px); opacity: 0; }
        }
        .animate-float-up { animation: float-up 1.2s ease-out forwards; }
        @keyframes pop { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.5); opacity: 0.5; } 100% { transform: scale(2); opacity: 0; } }
        @keyframes shake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-8px); } 40% { transform: translateX(8px); } 60% { transform: translateX(-5px); } 80% { transform: translateX(5px); } }
      `}</style>
    </div>
  );
}

// --- Multiplayer Bubble ---
function MultiBubble({ bubble, disabled, onClick }: { bubble: BubbleData; disabled: boolean; onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const animRef = useRef(0);

  const cfg = DIFF_CONFIG[bubble.difficulty] ?? DIFF_CONFIG.medium;
  const size = cfg.size;

  // Deterministic drift from bubble id
  const seed = bubble.id.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  const freqX = 0.1 + (seed % 7) * 0.03;
  const freqY = 0.08 + (seed % 5) * 0.025;
  const ampX = 5 + (seed % 8) * 2;
  const ampY = 4 + (seed % 6) * 2;
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

  // Fade as lifetime runs out
  const age = Date.now() - bubble.spawnedAt;
  const fadeStart = bubble.lifetime - 2000;
  const opacity = bubble.popping ? 0 : age > fadeStart ? Math.max(0.3, 1 - (age - fadeStart) / 2000) : 1;

  return (
    <button
      ref={ref}
      onClick={disabled ? undefined : onClick}
      className="absolute rounded-full flex items-center justify-center will-change-transform"
      style={{
        width: size,
        height: size,
        left: `calc(${bubble.x}% - ${size / 2}px)`,
        top: `calc(${bubble.y}% - ${size / 2}px)`,
        backgroundColor: cfg.bg,
        border: `3px solid ${cfg.border}`,
        opacity,
        cursor: disabled ? "default" : "pointer",
        animation: bubble.popping ? "pop 0.4s ease-out forwards" : bubble.shaking ? "shake 0.4s ease-out" : undefined,
        transition: "opacity 1s ease",
        zIndex: bubble.popping ? 10 : 1,
      }}
    >
      <span className="text-center leading-tight font-bold select-none pointer-events-none break-all"
        style={{ fontSize: `${Math.max(7, Math.min(13, (size - 18) / (bubble.word.length * 0.55)))}px`, width: size - 16, color: cfg.color }}
      >
        {bubble.word}
      </span>
      {bubble.poppedBy && bubble.popping && (
        <span className="absolute -bottom-5 text-xs font-bold text-blue-600 whitespace-nowrap">
          {bubble.poppedBy}
        </span>
      )}
    </button>
  );
}
