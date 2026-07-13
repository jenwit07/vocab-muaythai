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
  lifetime: number;
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

// Responsive: detect mobile
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

const DIFF_CONFIG = {
  easy: { points: 10, penalty: -5, color: "#16a34a", bg: "#dcfce7", border: "#16a34a", label: "Easy" },
  medium: { points: 25, penalty: -10, color: "#ca8a04", bg: "#fef9c3", border: "#ca8a04", label: "Medium" },
  hard: { points: 50, penalty: -20, color: "#dc2626", bg: "#fee2e2", border: "#dc2626", label: "Hard" },
};

function getBubbleSize(difficulty: string, mobile: boolean): number {
  const sizes = mobile
    ? { easy: 58, medium: 64, hard: 72 }
    : { easy: 76, medium: 84, hard: 94 };
  return sizes[difficulty as keyof typeof sizes] ?? sizes.medium;
}

// --- Fit font size to bubble ---
function fitFontSize(word: string, bubbleSize: number): number {
  // Approximate: each char ~0.6em wide at a given font size
  // We want total text width < bubbleSize - padding
  const available = bubbleSize - 18;
  const maxFontByWidth = available / (word.length * 0.55);
  const maxFont = Math.min(13, maxFontByWidth);
  return Math.max(7, Math.round(maxFont * 10) / 10);
}

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
  const isMobile = useIsMobile();

  const [phase, setPhase] = useState<"menu" | "playing" | "result">("playing");
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
      <div className="fixed inset-0 flex items-center justify-center bg-white text-gray-400">
        Loading vocab...
      </div>
    );
  }

  if (phase === "menu") return <MenuScreen onStart={() => setPhase("playing")} />;
  if (phase === "playing") return <PlayScreen vocab={vocab} onEnd={() => setPhase("result")} isMobile={isMobile} />;
  return null;
}

// --- Menu ---
function MenuScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-white text-center px-6 safe-area-pad">
      <div className="space-y-6 w-full max-w-xs">
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight">
          <span className="text-green-600">Bubble</span>{" "}
          <span className="text-yellow-500">Pop</span>{" "}
          <span className="text-red-500">!</span>
        </h1>
        <p className="text-gray-500 text-sm">
          Tap a bubble, pick the Thai meaning.
          Harder = more points. Build combos!
        </p>

        <div className="flex justify-center gap-4 text-xs sm:text-sm">
          {(["easy", "medium", "hard"] as const).map((d) => {
            const cfg = DIFF_CONFIG[d];
            return (
              <div key={d} className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: cfg.color }} />
                <span style={{ color: cfg.color }}>{cfg.label}</span>
                <span className="text-gray-400">+{cfg.points}</span>
              </div>
            );
          })}
        </div>

        <div className="grid gap-3">
          <button
            onClick={onStart}
            className="rounded-2xl bg-blue-600 text-white px-8 py-4 text-lg font-bold hover:bg-blue-500 active:scale-[0.97] transition-all"
          >
            Solo Mode
          </button>
          <a
            href="/game/online"
            className="rounded-2xl bg-green-600 text-white px-8 py-4 text-lg font-bold hover:bg-green-500 active:scale-[0.97] transition-all text-center"
          >
            Play Online
          </a>
          <a
            href="/game/multi"
            className="rounded-2xl border-2 border-purple-500 px-8 py-4 text-lg font-bold text-purple-500 hover:bg-purple-500/10 active:scale-[0.97] transition-all text-center"
          >
            VS Friend
          </a>
        </div>

        <a href="/" className="block text-sm text-gray-400 hover:text-gray-600">
          &larr; Back
        </a>
      </div>
    </div>
  );
}

// --- Play ---
function PlayScreen({ vocab, onEnd, isMobile }: { vocab: VocabItem[]; onEnd: () => void; isMobile: boolean }) {
  const MAX_BUBBLES = isMobile ? 7 : 12;

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
  const [flashMsg, setFlashMsg] = useState<{ word: string; meaningTh: string } | null>(null);
  const [ragLesson, setRagLesson] = useState<string | null>(null);
  const [ragRelated, setRagRelated] = useState<{ word: string; meaningTh: string; category: string }[]>([]);
  const [ragLoading, setRagLoading] = useState(false);

  const startTimeRef = useRef(Date.now());
  const spawnTimerRef = useRef<ReturnType<typeof setInterval>>();
  const bubbleIdRef = useRef(0);
  const wrongWordsRef = useRef<Set<string>>(new Set());

  const spawnBubble = useCallback(() => {
    if (vocab.length < 4) return;
    // Filter out words already wrong in this round + already on screen
    const available = vocab.filter((v) => !wrongWordsRef.current.has(v.word));
    if (available.length < 4) return; // fallback: not enough words left
    const item = available[Math.floor(Math.random() * available.length)];
    const id = `b-${bubbleIdRef.current++}`;

    const newBubble: GameBubble = {
      id,
      word: item.word,
      meaningTh: item.meaningTh,
      difficulty: item.difficulty,
      x: 8 + Math.random() * 84,
      y: 8 + Math.random() * (isMobile ? 70 : 78),
      spawnedAt: Date.now(),
      lifetime: BUBBLE_LIFETIME + Math.random() * 3000,
      freqX: 0.1 + Math.random() * 0.15,
      freqY: 0.08 + Math.random() * 0.12,
      ampX: isMobile ? 3 + Math.random() * 6 : 5 + Math.random() * 10,
      ampY: isMobile ? 2 + Math.random() * 5 : 4 + Math.random() * 8,
      phase: Math.random() * Math.PI * 2,
      popping: false,
      shaking: false,
      fading: false,
    };

    setBubbles((prev) => {
      if (prev.length >= MAX_BUBBLES) return prev;
      return [...prev, newBubble];
    });
  }, [vocab, isMobile, MAX_BUBBLES]);

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
    const initialCount = isMobile ? 4 : 6;
    for (let i = 0; i < initialCount; i++) setTimeout(() => spawnBubble(), i * 200);
    spawnTimerRef.current = setInterval(spawnBubble, isMobile ? 1600 : SPAWN_INTERVAL);
    return () => clearInterval(spawnTimerRef.current);
  }, [spawnBubble, gameOver, isMobile]);

  // Remove expired bubbles
  useEffect(() => {
    if (gameOver) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setBubbles((prev) => {
        const next: GameBubble[] = [];
        let missedCount = 0;
        for (const b of prev) {
          if (b.popping) continue;
          if (now - b.spawnedAt > b.lifetime && !b.fading) { missedCount++; continue; }
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

  function handleBubbleClick(bubble: GameBubble) {
    if (activeBubble || gameOver) return;
    const wrongChoices = vocab
      .filter((v) => v.meaningTh !== bubble.meaningTh)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map((v) => v.meaningTh);
    setActiveBubble(bubble);
    setChoices([...wrongChoices, bubble.meaningTh].sort(() => Math.random() - 0.5));
    setAnswered(null);
  }

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
      setBubbles((prev) => prev.map((b) => b.id === activeBubble.id ? { ...b, popping: true } : b));
      setPopups((prev) => [...prev, {
        id: `p-${Date.now()}`, x: activeBubble.x, y: activeBubble.y,
        text: `+${points}${multiplier > 1 ? ` x${multiplier}` : ""}`,
        color: cfg.color, createdAt: Date.now(),
      }]);
      setTimeout(() => setBubbles((prev) => prev.filter((b) => b.id !== activeBubble.id)), 400);
    } else {
      setScore((s) => s + cfg.penalty);
      setCombo(0);
      setWrong((w) => w + 1);
      setWordsWrong((prev) => [...prev, { word: activeBubble.word, meaningTh: activeBubble.meaningTh }]);
      wrongWordsRef.current.add(activeBubble.word);
      // Flash the correct answer
      setFlashMsg({ word: activeBubble.word, meaningTh: activeBubble.meaningTh });
      setTimeout(() => setFlashMsg(null), 2000);
      // Wrong → shake then pop (remove bubble)
      setBubbles((prev) => prev.map((b) => b.id === activeBubble.id ? { ...b, shaking: true } : b));
      setPopups((prev) => [...prev, {
        id: `p-${Date.now()}`, x: activeBubble.x, y: activeBubble.y,
        text: `${cfg.penalty}`, color: "#ef4444", createdAt: Date.now(),
      }]);
      setTimeout(() => {
        setBubbles((prev) => prev.map((b) => b.id === activeBubble.id ? { ...b, shaking: false, popping: true } : b));
        setTimeout(() => setBubbles((prev) => prev.filter((b) => b.id !== activeBubble.id)), 400);
      }, 400);
    }

    setTimeout(() => { setActiveBubble(null); setAnswered(null); }, isCorrect ? 300 : 600);
  }

  // RAG lesson fetch
  async function fetchLesson() {
    if (ragLoading || ragLesson || !result) return;
    setRagLoading(true);
    try {
      const uniqueWords = [...new Map(result.wordsWrong.map((w) => [w.word, w])).values()];
      const res = await fetch("/api/lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          words: uniqueWords.map((w) => ({ word: w.word, meaningTh: w.meaningTh, pos: "noun", examples: [] })),
        }),
      });
      const data = await res.json();
      setRagLesson(data.lesson ?? "Could not generate lesson.");
      setRagRelated(data.relatedWords ?? []);
    } catch {
      setRagLesson("Failed to generate lesson.");
    }
    setRagLoading(false);
  }

  // Showing RAG lesson fullscreen
  if (ragLesson && result) {
    const uniqueWrong = [...new Map(result.wordsWrong.map((w) => [w.word, w])).values()];
    return (
      <div className="fixed inset-0 flex flex-col bg-white">
        {/* Header */}
        <div className="shrink-0 border-b border-gray-100 px-5 py-3 flex items-center justify-between">
          <h2 className="font-bold text-sm">AI Lesson</h2>
          <button
            onClick={() => setRagLesson(null)}
            className="text-gray-400 hover:text-gray-600 text-sm"
          >
            &larr; Back to results
          </button>
        </div>

        {/* Words bar */}
        <div className="shrink-0 px-5 py-3 border-b border-gray-100">
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs text-gray-400 mr-1">Missed:</span>
            {uniqueWrong.map((w) => (
              <span key={w.word} className="rounded-full bg-red-50 border border-red-200 px-3 py-1 text-xs font-medium text-red-600">
                {w.word}
              </span>
            ))}
            {ragRelated.length > 0 && (
              <>
                <span className="text-xs text-gray-300 mx-1">+</span>
                <span className="text-xs text-gray-400 mr-1">Related:</span>
                {ragRelated.slice(0, 5).map((r) => (
                  <span key={r.word} className="rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-medium text-blue-600">
                    {r.word}
                  </span>
                ))}
              </>
            )}
          </div>
        </div>

        {/* Lesson content — fills remaining space */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="max-w-lg mx-auto">
            <div
              className="text-[15px] leading-relaxed text-gray-700 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:first:mt-0 [&_strong]:text-blue-600 [&_strong]:font-semibold [&_p]:mb-3 [&_em]:text-gray-500"
              dangerouslySetInnerHTML={{
                __html: ragLesson
                  .replace(/## (.*)/g, "<h2>$1</h2>")
                  .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                  .replace(/\*(.*?)\*/g, "<em>$1</em>")
                  .replace(/`(.*?)`/g, '<code class="rounded bg-gray-100 px-1.5 py-0.5 text-sm font-mono text-blue-600">$1</code>')
                  .replace(/^- (.*)/gm, '<div class="flex gap-2 mb-2 pl-1"><span class="text-blue-400 shrink-0 mt-0.5">•</span><span>$1</span></div>')
                  .replace(/^(\d+)\. (.*)/gm, '<div class="flex gap-2 mb-2 pl-1"><span class="text-blue-400 shrink-0 font-medium mt-0.5">$1.</span><span>$2</span></div>')
                  .replace(/^> (.*)/gm, '<blockquote class="border-l-3 border-blue-300 pl-4 py-1 my-2 text-gray-600 italic">$1</blockquote>')
                  .replace(/\n\n/g, "</p><p>")
                  .replace(/\n/g, "<br>"),
              }}
            />
          </div>
        </div>

        {/* Bottom actions */}
        <div className="shrink-0 border-t border-gray-100 px-5 py-4">
          <div className="max-w-lg mx-auto flex gap-3">
            <button onClick={() => window.location.reload()} className="flex-1 rounded-xl bg-blue-600 text-white py-3 font-bold hover:bg-blue-500 active:scale-[0.97]">
              Play Again
            </button>
            <a href="/" className="flex-1 rounded-xl border border-gray-200 py-3 text-center font-medium hover:border-gray-400">
              Menu
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Result screen
  if (result) {
    const accuracy = result.correct + result.wrong > 0
      ? Math.round((result.correct / (result.correct + result.wrong)) * 100) : 0;

    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-white px-6 safe-area-pad">
        <div className="w-full max-w-md space-y-5 text-center">
          <h1 className="text-3xl sm:text-4xl font-black">
            {result.score >= 500 ? "Amazing!" : result.score >= 200 ? "Great job!" : result.score >= 50 ? "Nice try!" : "Keep practicing!"}
          </h1>

          <div className="text-5xl sm:text-6xl font-black text-blue-600">{result.score}</div>
          <p className="text-gray-400 -mt-3 text-sm">points</p>

          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            <StatBox label="Correct" value={result.correct} color="text-green-600" />
            <StatBox label="Wrong" value={result.wrong} color="text-red-600" />
            <StatBox label="Missed" value={result.missed} color="text-gray-400" />
            <StatBox label="Combo" value={`x${result.maxCombo}`} color="text-yellow-600" />
          </div>

          <div className="h-2 rounded-full bg-gray-100">
            <div className="h-2 rounded-full bg-blue-500 transition-all duration-1000" style={{ width: `${accuracy}%` }} />
          </div>
          <p className="text-sm text-gray-400">{accuracy}% accuracy</p>

          {result.wordsWrong.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap justify-center gap-1.5">
                {[...new Map(result.wordsWrong.map((w) => [w.word, w])).values()].map((w) => (
                  <span key={w.word} className="rounded-full bg-red-50 border border-red-200 px-3 py-1 text-xs text-red-600">
                    {w.word} = {w.meaningTh}
                  </span>
                ))}
              </div>

              {!ragLoading && (
                <button
                  onClick={fetchLesson}
                  className="w-full rounded-xl bg-gradient-to-r from-blue-50 to-amber-50 border border-amber-200 py-3.5 text-sm font-semibold text-amber-700 hover:from-blue-100 hover:to-amber-100 active:scale-[0.98] transition-all"
                >
                  ✨ Why did I miss these?
                </button>
              )}

              {ragLoading && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 py-4 flex items-center justify-center gap-2 text-blue-600">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
                    <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  <span className="text-sm font-medium">AI is analyzing your mistakes...</span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => window.location.reload()} className="flex-1 rounded-xl bg-blue-600 text-white py-3 font-bold hover:bg-blue-500 active:scale-[0.97]">
              Play Again
            </button>
            <a href="/" className="flex-1 rounded-xl border border-gray-200 py-3 text-center font-medium hover:border-gray-400">
              Menu
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Game screen
  const timerPct = (timeLeft / GAME_DURATION) * 100;
  const timerColor = timeLeft > 20000 ? "#3b82f6" : timeLeft > 10000 ? "#eab308" : "#ef4444";
  const comboMultiplier = Math.min(combo, 5);

  return (
    <div className="fixed inset-0 flex flex-col bg-white select-none touch-manipulation">
      {/* HUD — compact on mobile */}
      <div className="shrink-0 px-3 sm:px-4 pt-2 sm:pt-3 pb-1 sm:pb-2 z-30 safe-top">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="text-2xl sm:text-3xl font-black tabular-nums text-gray-900">{score}</div>
            {combo > 1 && (
              <div className="rounded-full px-2 py-0.5 text-xs sm:text-sm font-black bg-yellow-100 text-yellow-600">
                x{comboMultiplier}
              </div>
            )}
          </div>
          <div className="text-lg sm:text-xl font-mono font-black tabular-nums" style={{ color: timerColor }}>
            {Math.ceil(timeLeft / 1000)}s
          </div>
        </div>
        <div className="h-1.5 sm:h-2 rounded-full bg-gray-100">
          <div className="h-1.5 sm:h-2 rounded-full transition-all duration-100 ease-linear" style={{ width: `${timerPct}%`, backgroundColor: timerColor }} />
        </div>
      </div>

      {/* Bubble area */}
      <div className="relative flex-1 overflow-hidden" data-canvas="true">
        {bubbles.map((b) => (
          <FloatingGameBubble key={b.id} bubble={b} disabled={!!activeBubble || gameOver} onClick={() => handleBubbleClick(b)} isMobile={isMobile} />
        ))}

        {/* Score popups */}
        {popups.map((p) => (
          <div key={p.id} className="absolute pointer-events-none font-black text-lg sm:text-2xl animate-float-up" style={{ left: `${p.x}%`, top: `${p.y}%`, color: p.color }}>
            {p.text}
          </div>
        ))}

        {/* Flash explanation on wrong answer */}
        {flashMsg && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none animate-flash-in">
            <div className="rounded-xl bg-gray-900 text-white px-5 py-3 shadow-lg text-center max-w-xs">
              <p className="font-bold text-base">{flashMsg.word}</p>
              <p className="text-sm text-gray-300">{flashMsg.meaningTh}</p>
            </div>
          </div>
        )}

        {/* Choice overlay — bottom sheet on mobile, centered on desktop */}
        {activeBubble && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 p-4">
            <div className="w-full max-w-sm max-h-[90%] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 space-y-3 shadow-2xl">
              <div className="text-center">
                <p className="text-xl sm:text-2xl font-bold" style={{ color: DIFF_CONFIG[activeBubble.difficulty as keyof typeof DIFF_CONFIG]?.color }}>
                  {activeBubble.word}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {DIFF_CONFIG[activeBubble.difficulty as keyof typeof DIFF_CONFIG]?.label} · +{DIFF_CONFIG[activeBubble.difficulty as keyof typeof DIFF_CONFIG]?.points}
                  {comboMultiplier > 1 ? ` × ${comboMultiplier}` : ""} pts
                </p>
              </div>

              <div className="grid gap-2">
                {choices.map((c, idx) => {
                  let cls = "rounded-xl border-2 px-3 py-2.5 text-left text-sm transition-all duration-150";
                  if (answered) {
                    if (c === activeBubble.meaningTh) cls += " border-green-500 bg-green-50 text-green-700";
                    else if (c === answered) cls += " border-red-500 bg-red-50 text-red-700";
                    else cls += " border-gray-100 text-gray-300";
                  } else {
                    cls += " border-gray-200 text-gray-700 active:bg-gray-50 active:border-blue-400 cursor-pointer";
                  }
                  return (
                    <button key={idx} className={cls} onClick={() => handleAnswer(c)}>
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
        .touch-manipulation { touch-action: manipulation; }
        .safe-area-pad { padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }
        .safe-top { padding-top: max(8px, env(safe-area-inset-top)); }
        .safe-bottom { padding-bottom: max(16px, env(safe-area-inset-bottom)); }
        @keyframes float-up { 0% { transform: translateY(0); opacity: 1; } 100% { transform: translateY(-50px); opacity: 0; } }
        @keyframes flash-in { 0% { opacity: 0; transform: translateY(-10px); } 10% { opacity: 1; transform: translateY(0); } 80% { opacity: 1; } 100% { opacity: 0; } }
        .animate-flash-in { animation: flash-in 2s ease-out forwards; }
        .animate-float-up { animation: float-up 1.2s ease-out forwards; }
        @keyframes pop { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.4); opacity: 0.5; } 100% { transform: scale(1.8); opacity: 0; } }
        @keyframes shake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-6px); } 40% { transform: translateX(6px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(4px); } }
      `}</style>
    </div>
  );
}

// --- Floating Game Bubble ---
function FloatingGameBubble({ bubble, disabled, onClick, isMobile }: { bubble: GameBubble; disabled: boolean; onClick: () => void; isMobile: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const animRef = useRef(0);

  const diff = bubble.difficulty as keyof typeof DIFF_CONFIG;
  const cfg = DIFF_CONFIG[diff] ?? DIFF_CONFIG.medium;
  const size = getBubbleSize(bubble.difficulty, isMobile);

  useEffect(() => {
    const el = ref.current;
    if (!el || bubble.popping) return;
    const startTime = performance.now();
    function tick(now: number) {
      if (!el) return;
      const t = (now - startTime) / 1000;
      const dx = Math.sin(t * bubble.freqX + bubble.phase) * bubble.ampX + Math.sin(t * bubble.freqX * 0.6 + bubble.phase * 1.7) * bubble.ampX * 0.3;
      const dy = Math.cos(t * bubble.freqY + bubble.phase * 0.8) * bubble.ampY + Math.cos(t * bubble.freqY * 0.5 + bubble.phase * 2.1) * bubble.ampY * 0.4;
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      animRef.current = requestAnimationFrame(tick);
    }
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [bubble.freqX, bubble.freqY, bubble.ampX, bubble.ampY, bubble.phase, bubble.popping]);

  // Auto-shrink font for long words
  const fontSize = fitFontSize(bubble.word, size);

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
        border: `2.5px solid ${cfg.border}`,
        opacity: bubble.popping ? 0 : bubble.fading ? 0.35 : 1,
        cursor: disabled ? "default" : "pointer",
        animation: bubble.popping ? "pop 0.4s ease-out forwards" : bubble.shaking ? "shake 0.4s ease-out" : undefined,
        transition: "opacity 1s ease",
        zIndex: bubble.popping ? 10 : 1,
      }}
    >
      <span
        className="text-center leading-tight font-bold select-none pointer-events-none break-all"
        style={{ fontSize: `${fontSize}px`, width: size - 16, color: cfg.color }}
      >
        {bubble.word}
      </span>
    </button>
  );
}

// --- Stat box ---
function StatBox({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-xl bg-gray-50 border border-gray-200 p-2 sm:p-3 text-center">
      <div className={`text-lg sm:text-xl font-bold ${color}`}>{value}</div>
      <div className="text-[10px] sm:text-xs text-gray-400">{label}</div>
    </div>
  );
}
