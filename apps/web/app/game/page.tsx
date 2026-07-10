"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// --- Types ---
type VocabItem = {
  word: string;
  meaningTh: string;
  difficulty: string;
  category: string;
};

type GameBubble = {
  id: string;
  word: string;
  meaningTh: string;
  difficulty: string;
  x: number;
  y: number;
  spawnedAt: number;
  lifetime: number; // ms before auto-fade
  freqX: number;
  freqY: number;
  ampX: number;
  ampY: number;
  phase: number;
  popping: boolean;
  shaking: boolean;
  fading: boolean;
};

type ScorePopup = {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  createdAt: number;
};

type GameResult = {
  score: number;
  correct: number;
  wrong: number;
  missed: number;
  maxCombo: number;
  wordsWrong: { word: string; meaningTh: string }[];
};

// --- Constants ---
const GAME_DURATION = 60_000;
const BUBBLE_LIFETIME = 8_000;
const SPAWN_INTERVAL = 1_200;
const MAX_BUBBLES = 12;

const DIFF_CONFIG = {
  easy: { points: 10, penalty: -5, color: "#4ade80", bg: "#4ade8030", border: "#4ade80", label: "Easy", size: 76 },
  medium: { points: 25, penalty: -10, color: "#facc15", bg: "#facc1530", border: "#facc15", label: "Medium", size: 84 },
  hard: { points: 50, penalty: -20, color: "#f87171", bg: "#f8717130", border: "#f87171", label: "Hard", size: 94 },
};

// --- Fullscreen hook ---
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
export default function GamePage() {
  useFullscreen();

  const [phase, setPhase] = useState<"menu" | "playing" | "result">("menu");
  const [vocab, setVocab] = useState<VocabItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/vocab")
      .then((r) => r.json())
      .then((d) => {
        setVocab(d.words ?? []);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-950 text-gray-500">
        Loading vocab...
      </div>
    );
  }

  if (phase === "menu") return <MenuScreen onStart={() => setPhase("playing")} />;
  if (phase === "playing") return <PlayScreen vocab={vocab} onEnd={() => setPhase("result")} />;
  return null;
}

// --- Menu ---
function MenuScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-950 text-center px-6">
      <div className="space-y-6">
        <h1 className="text-5xl font-black tracking-tight">
          <span className="text-green-400">Bubble</span>{" "}
          <span className="text-yellow-400">Pop</span>{" "}
          <span className="text-red-400">!</span>
        </h1>
        <p className="text-gray-400 max-w-sm mx-auto">
          Bubbles float around with English words. Tap one, pick the Thai meaning.
          Harder bubbles = more points. Build combos for multiplied scores!
        </p>

        <div className="flex justify-center gap-6 text-sm">
          {(["easy", "medium", "hard"] as const).map((d) => {
            const cfg = DIFF_CONFIG[d];
            return (
              <div key={d} className="flex items-center gap-2">
                <span className="h-4 w-4 rounded-full" style={{ backgroundColor: cfg.color }} />
                <span style={{ color: cfg.color }}>{cfg.label}</span>
                <span className="text-gray-600">+{cfg.points}</span>
              </div>
            );
          })}
        </div>

        <div className="text-xs text-gray-600 space-y-1">
          <p>60 seconds | Combo multiplier | Wrong = penalty</p>
          <p>Bubbles fade after 8s — don&apos;t miss them!</p>
        </div>

        <button
          onClick={onStart}
          className="rounded-2xl bg-blue-600 px-12 py-4 text-xl font-bold hover:bg-blue-500 transition-colors"
        >
          START
        </button>

        <a href="/" className="block text-sm text-gray-600 hover:text-gray-400">
          &larr; Back
        </a>
      </div>
    </div>
  );
}

// --- Play ---
function PlayScreen({ vocab, onEnd }: { vocab: VocabItem[]; onEnd: () => void }) {
  const [bubbles, setBubbles] = useState<GameBubble[]>([]);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [missed, setMissed] = useState(0);
  const [wordsWrong, setWordsWrong] = useState<{ word: string; meaningTh: string }[]>([]);
  const [popups, setPopups] = useState<ScorePopup[]>([]);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [activeBubble, setActiveBubble] = useState<GameBubble | null>(null);
  const [choices, setChoices] = useState<string[]>([]);
  const [answered, setAnswered] = useState<string | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [result, setResult] = useState<GameResult | null>(null);

  const startTimeRef = useRef(Date.now());
  const spawnTimerRef = useRef<ReturnType<typeof setInterval>>();
  const bubbleIdRef = useRef(0);

  // Spawn a new bubble
  const spawnBubble = useCallback(() => {
    if (vocab.length < 4) return;
    const item = vocab[Math.floor(Math.random() * vocab.length)];
    const id = `b-${bubbleIdRef.current++}`;
    const now = Date.now();

    const newBubble: GameBubble = {
      id,
      word: item.word,
      meaningTh: item.meaningTh,
      difficulty: item.difficulty,
      x: 8 + Math.random() * 84,
      y: 10 + Math.random() * 75,
      spawnedAt: now,
      lifetime: BUBBLE_LIFETIME + Math.random() * 3000,
      freqX: 0.1 + Math.random() * 0.15,
      freqY: 0.08 + Math.random() * 0.12,
      ampX: 5 + Math.random() * 10,
      ampY: 4 + Math.random() * 8,
      phase: Math.random() * Math.PI * 2,
      popping: false,
      shaking: false,
      fading: false,
    };

    setBubbles((prev) => {
      if (prev.length >= MAX_BUBBLES) return prev;
      return [...prev, newBubble];
    });
  }, [vocab]);

  // Game timer
  useEffect(() => {
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const left = Math.max(0, GAME_DURATION - elapsed);
      setTimeLeft(left);
      if (left <= 0) {
        setGameOver(true);
        clearInterval(timer);
      }
    }, 50);
    return () => clearInterval(timer);
  }, []);

  // Spawn bubbles
  useEffect(() => {
    if (gameOver) return;
    // Initial burst
    for (let i = 0; i < 6; i++) setTimeout(() => spawnBubble(), i * 200);
    spawnTimerRef.current = setInterval(spawnBubble, SPAWN_INTERVAL);
    return () => clearInterval(spawnTimerRef.current);
  }, [spawnBubble, gameOver]);

  // Remove expired bubbles
  useEffect(() => {
    if (gameOver) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setBubbles((prev) => {
        const next: GameBubble[] = [];
        let missedCount = 0;
        for (const b of prev) {
          if (b.popping) continue; // already handled
          if (now - b.spawnedAt > b.lifetime && !b.fading) {
            missedCount++;
            continue;
          }
          // Mark as fading in last 2s
          if (now - b.spawnedAt > b.lifetime - 2000 && !b.fading) {
            next.push({ ...b, fading: true });
          } else {
            next.push(b);
          }
        }
        if (missedCount > 0) setMissed((m) => m + missedCount);
        return next;
      });
    }, 200);
    return () => clearInterval(timer);
  }, [gameOver]);

  // Clean up popups
  useEffect(() => {
    const timer = setInterval(() => {
      setPopups((prev) => prev.filter((p) => Date.now() - p.createdAt < 1500));
    }, 300);
    return () => clearInterval(timer);
  }, []);

  // Show result when game over
  useEffect(() => {
    if (!gameOver) return;
    setActiveBubble(null);
    setTimeout(() => {
      setResult({ score, correct, wrong, missed, maxCombo, wordsWrong });
    }, 500);
  }, [gameOver, score, correct, wrong, missed, maxCombo, wordsWrong]);

  // Click bubble
  function handleBubbleClick(bubble: GameBubble) {
    if (activeBubble || gameOver) return;

    // Generate 4 choices (1 correct + 3 wrong)
    const wrongChoices = vocab
      .filter((v) => v.meaningTh !== bubble.meaningTh)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map((v) => v.meaningTh);
    const shuffled = [...wrongChoices, bubble.meaningTh].sort(() => Math.random() - 0.5);

    setActiveBubble(bubble);
    setChoices(shuffled);
    setAnswered(null);
  }

  // Answer choice
  function handleAnswer(choice: string) {
    if (!activeBubble || answered) return;
    setAnswered(choice);

    const isCorrect = choice === activeBubble.meaningTh;
    const diff = activeBubble.difficulty as keyof typeof DIFF_CONFIG;
    const cfg = DIFF_CONFIG[diff] ?? DIFF_CONFIG.medium;

    if (isCorrect) {
      const newCombo = combo + 1;
      const multiplier = Math.min(newCombo, 5);
      const points = cfg.points * multiplier;

      setScore((s) => s + points);
      setCombo(newCombo);
      setMaxCombo((m) => Math.max(m, newCombo));
      setCorrect((c) => c + 1);

      // Pop animation
      setBubbles((prev) => prev.map((b) => b.id === activeBubble.id ? { ...b, popping: true } : b));

      // Score popup
      setPopups((prev) => [
        ...prev,
        {
          id: `p-${Date.now()}`,
          x: activeBubble.x,
          y: activeBubble.y,
          text: `+${points}${multiplier > 1 ? ` x${multiplier}` : ""}`,
          color: cfg.color,
          createdAt: Date.now(),
        },
      ]);

      // Remove bubble after pop animation
      setTimeout(() => {
        setBubbles((prev) => prev.filter((b) => b.id !== activeBubble.id));
      }, 400);
    } else {
      const penalty = cfg.penalty;
      setScore((s) => s + penalty);
      setCombo(0);
      setWrong((w) => w + 1);
      setWordsWrong((prev) => [...prev, { word: activeBubble.word, meaningTh: activeBubble.meaningTh }]);

      // Shake animation
      setBubbles((prev) => prev.map((b) => b.id === activeBubble.id ? { ...b, shaking: true } : b));

      // Penalty popup
      setPopups((prev) => [
        ...prev,
        {
          id: `p-${Date.now()}`,
          x: activeBubble.x,
          y: activeBubble.y,
          text: `${penalty}`,
          color: "#ef4444",
          createdAt: Date.now(),
        },
      ]);

      // Reset shake
      setTimeout(() => {
        setBubbles((prev) => prev.map((b) => b.id === activeBubble.id ? { ...b, shaking: false } : b));
      }, 500);
    }

    // Close choices after delay
    setTimeout(() => {
      setActiveBubble(null);
      setAnswered(null);
    }, isCorrect ? 300 : 800);
  }

  // Result screen
  if (result) {
    const accuracy = result.correct + result.wrong > 0
      ? Math.round((result.correct / (result.correct + result.wrong)) * 100)
      : 0;

    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-950 px-6">
        <div className="w-full max-w-md space-y-6 text-center">
          <h1 className="text-4xl font-black">
            {result.score >= 500 ? "Amazing!" : result.score >= 200 ? "Great job!" : result.score >= 50 ? "Nice try!" : "Keep practicing!"}
          </h1>

          <div className="text-6xl font-black text-blue-400">{result.score}</div>
          <p className="text-gray-500 -mt-4">points</p>

          <div className="grid grid-cols-4 gap-3">
            <StatBox label="Correct" value={result.correct} color="text-green-400" />
            <StatBox label="Wrong" value={result.wrong} color="text-red-400" />
            <StatBox label="Missed" value={result.missed} color="text-gray-500" />
            <StatBox label="Max Combo" value={`x${result.maxCombo}`} color="text-yellow-400" />
          </div>

          <div className="h-2 rounded-full bg-gray-800">
            <div
              className="h-2 rounded-full bg-blue-500 transition-all duration-1000"
              style={{ width: `${accuracy}%` }}
            />
          </div>
          <p className="text-sm text-gray-500">{accuracy}% accuracy</p>

          {result.wordsWrong.length > 0 && (
            <div className="text-left space-y-1">
              <p className="text-xs font-medium text-red-400">Words to review:</p>
              <div className="flex flex-wrap gap-1">
                {[...new Map(result.wordsWrong.map((w) => [w.word, w])).values()].map((w) => (
                  <span key={w.word} className="rounded bg-red-500/10 px-2 py-1 text-xs text-red-300">
                    {w.word} = {w.meaningTh}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => window.location.reload()}
              className="flex-1 rounded-xl bg-blue-600 py-3 font-bold hover:bg-blue-500"
            >
              Play Again
            </button>
            <a
              href="/dashboard"
              className="flex-1 rounded-xl border border-gray-700 py-3 text-center font-medium hover:border-gray-500"
            >
              Dashboard
            </a>
          </div>

          <a href="/" className="block text-sm text-gray-600 hover:text-gray-400">
            &larr; Home
          </a>
        </div>
      </div>
    );
  }

  // Game screen
  const timerPct = (timeLeft / GAME_DURATION) * 100;
  const timerColor = timeLeft > 20000 ? "#3b82f6" : timeLeft > 10000 ? "#eab308" : "#ef4444";
  const comboMultiplier = Math.min(combo, 5);

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0c1222] select-none">
      {/* HUD */}
      <div className="shrink-0 px-4 pt-3 pb-2 z-30">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-4">
            <div className="text-3xl font-black tabular-nums text-white">{score}</div>
            {combo > 1 && (
              <div
                className="rounded-full px-3 py-1 text-sm font-black"
                style={{ backgroundColor: "#facc1540", color: "#facc15" }}
              >
                COMBO x{comboMultiplier}
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-lg font-mono font-bold tabular-nums" style={{ color: timerColor }}>
              {Math.ceil(timeLeft / 1000)}s
            </div>
          </div>
        </div>
        {/* Timer bar */}
        <div className="h-2 rounded-full bg-gray-800">
          <div
            className="h-2 rounded-full transition-all duration-100 ease-linear"
            style={{ width: `${timerPct}%`, backgroundColor: timerColor }}
          />
        </div>
      </div>

      {/* Bubble area */}
      <div className="relative flex-1 overflow-hidden" data-canvas="true">
        {bubbles.map((b) => (
          <FloatingGameBubble
            key={b.id}
            bubble={b}
            disabled={!!activeBubble || gameOver}
            onClick={() => handleBubbleClick(b)}
          />
        ))}

        {/* Score popups */}
        {popups.map((p) => (
          <div
            key={p.id}
            className="absolute pointer-events-none font-black text-2xl animate-float-up"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              color: p.color,
            }}
          >
            {p.text}
          </div>
        ))}

        {/* Choice overlay */}
        {activeBubble && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50">
            <div className="mx-4 w-full max-w-sm rounded-2xl border border-gray-600 bg-gray-900 p-5 space-y-4 shadow-2xl">
              <div className="text-center">
                <p
                  className="text-2xl font-bold"
                  style={{ color: DIFF_CONFIG[activeBubble.difficulty as keyof typeof DIFF_CONFIG]?.color }}
                >
                  {activeBubble.word}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {DIFF_CONFIG[activeBubble.difficulty as keyof typeof DIFF_CONFIG]?.label} ·{" "}
                  +{DIFF_CONFIG[activeBubble.difficulty as keyof typeof DIFF_CONFIG]?.points}
                  {comboMultiplier > 1 ? ` × ${comboMultiplier}` : ""} pts
                </p>
              </div>

              <div className="grid gap-2">
                {choices.map((c, idx) => {
                  let cls = "rounded-xl border-2 px-4 py-3 text-left text-sm transition-all duration-200";
                  if (answered) {
                    if (c === activeBubble.meaningTh) {
                      cls += " border-green-500 bg-green-500/10 text-green-300";
                    } else if (c === answered) {
                      cls += " border-red-500 bg-red-500/10 text-red-300";
                    } else {
                      cls += " border-gray-800 text-gray-600";
                    }
                  } else {
                    cls += " border-gray-700 text-gray-200 hover:border-blue-500/50 hover:bg-gray-800/50 cursor-pointer active:scale-[0.98]";
                  }
                  return (
                    <button key={idx} className={cls} onClick={() => handleAnswer(c)}>
                      <span className="mr-2 text-xs text-gray-500">{String.fromCharCode(65 + idx)}</span>
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
        .animate-float-up {
          animation: float-up 1.2s ease-out forwards;
        }
        @keyframes pop {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
          100% { transform: scale(2); opacity: 0; }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-5px); }
          80% { transform: translateX(5px); }
        }
      `}</style>
    </div>
  );
}

// --- Floating Game Bubble (JS animation) ---
function FloatingGameBubble({
  bubble,
  disabled,
  onClick,
}: {
  bubble: GameBubble;
  disabled: boolean;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const animRef = useRef(0);

  const diff = bubble.difficulty as keyof typeof DIFF_CONFIG;
  const cfg = DIFF_CONFIG[diff] ?? DIFF_CONFIG.medium;
  const size = cfg.size;

  useEffect(() => {
    const el = ref.current;
    if (!el || bubble.popping) return;

    const startTime = performance.now();

    function tick(now: number) {
      if (!el) return;
      const t = (now - startTime) / 1000;
      const dx =
        Math.sin(t * bubble.freqX + bubble.phase) * bubble.ampX +
        Math.sin(t * bubble.freqX * 0.6 + bubble.phase * 1.7) * bubble.ampX * 0.3;
      const dy =
        Math.cos(t * bubble.freqY + bubble.phase * 0.8) * bubble.ampY +
        Math.cos(t * bubble.freqY * 0.5 + bubble.phase * 2.1) * bubble.ampY * 0.4;
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      animRef.current = requestAnimationFrame(tick);
    }

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [bubble.freqX, bubble.freqY, bubble.ampX, bubble.ampY, bubble.phase, bubble.popping]);

  const age = Date.now() - bubble.spawnedAt;
  const lifeRatio = Math.max(0, 1 - age / bubble.lifetime);

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
        opacity: bubble.popping ? 0 : bubble.fading ? 0.4 : 1,
        cursor: disabled ? "default" : "pointer",
        animation: bubble.popping
          ? "pop 0.4s ease-out forwards"
          : bubble.shaking
            ? "shake 0.4s ease-out"
            : undefined,
        transition: "opacity 1s ease",
        zIndex: bubble.popping ? 10 : 1,
      }}
    >
      <span
        className="text-center leading-tight font-bold px-1 select-none pointer-events-none"
        style={{
          fontSize: size < 80 ? "11px" : size < 90 ? "12px" : "13px",
          color: "white",
        }}
      >
        {bubble.word}
      </span>
    </button>
  );
}

// --- Stat box ---
function StatBox({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-3 text-center">
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
