"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type Question = {
  id: string;
  word: string;
  pos: string;
  meaningTh: string;
  meaningEn?: string;
  category: string;
  difficulty: string;
  example: string;
  options: string[];
  correctAnswer: string;
};

type Answer = {
  word: string;
  selected: string;
  correct: boolean;
  category: string;
};

type DailyResult = {
  score: number;
  correct: number;
  wrong: number;
  maxCombo: number;
  accuracy: number;
  dayNum: number;
  dateStr: string;
};

const DIFF_COLORS: Record<string, string> = {
  easy: "text-green-600",
  medium: "text-yellow-600",
  hard: "text-red-600",
};

const POINTS: Record<string, number> = { easy: 10, medium: 25, hard: 50 };

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function loadTodayResult(): DailyResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("daily-result");
    if (!raw) return null;
    const r = JSON.parse(raw) as DailyResult;
    // Only valid if it's today's result
    return r.dateStr === todayUTC() ? r : null;
  } catch { return null; }
}

function saveTodayResult(result: DailyResult) {
  localStorage.setItem("daily-result", JSON.stringify(result));
}

// emoji score → rank label
function rankLabel(accuracy: number) {
  if (accuracy === 100) return { label: "Perfect!", emoji: "🏆" };
  if (accuracy >= 80) return { label: "Excellent!", emoji: "🥇" };
  if (accuracy >= 60) return { label: "Good job!", emoji: "🥈" };
  if (accuracy >= 40) return { label: "Keep going!", emoji: "🥉" };
  return { label: "Practice more!", emoji: "📚" };
}

export default function DailyChallengePage() {
  const [phase, setPhase] = useState<"loading" | "intro" | "playing" | "result">("loading");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [dayNum, setDayNum] = useState(1);
  const [dateStr, setDateStr] = useState("");
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [result, setResult] = useState<DailyResult | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [copied, setCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Load questions on mount
  useEffect(() => {
    // Check if already played today
    const existing = loadTodayResult();
    if (existing) {
      setResult(existing);
      setDayNum(existing.dayNum);
      setDateStr(existing.dateStr);
      setPhase("result");
      return;
    }

    fetch(`/api/daily`)
      .then((r) => r.json())
      .then((d) => {
        setQuestions(d.questions);
        setDayNum(d.dayNum);
        setDateStr(d.dateStr);
        setPhase("intro");
      })
      .catch(() => setPhase("intro"));
  }, []);

  const q = questions[current];

  function handleSelect(option: string) {
    if (selected !== null) return;
    setSelected(option);

    const isCorrect = option === q.correctAnswer;
    const pts = POINTS[q.difficulty] ?? 10;
    const newCombo = isCorrect ? combo + 1 : 0;
    const multiplier = Math.min(newCombo, 5);
    const gained = isCorrect ? pts * multiplier : 0;

    setScore((s) => s + gained);
    setCombo(newCombo);
    setMaxCombo((m) => Math.max(m, newCombo));
    setAnswers((prev) => [...prev, { word: q.word, selected: option, correct: isCorrect, category: q.category }]);
  }

  function handleNext() {
    setExplanation(null);
    setShowHint(false);
    if (current + 1 >= questions.length) {
      finishGame();
    } else {
      setCurrent((c) => c + 1);
      setSelected(null);
    }
  }

  function finishGame() {
    const allAnswers = [...answers];
    const correct = allAnswers.filter((a) => a.correct).length;
    const wrong = allAnswers.filter((a) => !a.correct).length;
    const accuracy = Math.round((correct / allAnswers.length) * 100);

    const r: DailyResult = {
      score,
      correct,
      wrong,
      maxCombo,
      accuracy,
      dayNum,
      dateStr,
    };
    saveTodayResult(r);
    setResult(r);
    setPhase("result");

    // Save to quiz stats
    fetch("/api/quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: allAnswers }),
    }).catch(() => {});
  }

  async function handleExplain() {
    if (!selected || selected === q.correctAnswer || explaining) return;
    setExplaining(true);
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: q.word, confusedWith: q.word }),
      });
      const data = await res.json();
      setExplanation(data.explanation);
    } catch { setExplanation("Failed to load explanation."); }
    setExplaining(false);
  }

  function buildShareText(r: DailyResult) {
    const { label, emoji } = rankLabel(r.accuracy);
    const blocks = ["🟩", "🟩", "🟩", "🟥", "🟥"]
      .slice(0, 5)
      .map((_, i) => i < Math.round(r.accuracy / 20) ? "🟩" : "🟥")
      .join("");

    return `📚 TOEIC Daily Challenge #${r.dayNum}
${emoji} ${label}

🏆 ${r.score} pts
${blocks} ${r.accuracy}%
✅ ${r.correct}/${r.correct + r.wrong} correct · 🔥 x${r.maxCombo}

👉 vocabpop.app/daily`;
  }

  async function handleShare(r: DailyResult) {
    const text = buildShareText(r);
    if (navigator.share) {
      try {
        await navigator.share({ title: `TOEIC Daily #${r.dayNum}`, text });
        return;
      } catch {}
    }
    // Fallback: copy to clipboard
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // --- Loading ---
  if (phase === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-400">Loading today's challenge...</div>
      </div>
    );
  }

  // --- Intro ---
  if (phase === "intro") {
    return (
      <div className="mx-auto max-w-sm space-y-6 pt-12 text-center">
        <div>
          <p className="text-xs font-medium text-blue-600 uppercase tracking-widest mb-1">Daily Challenge</p>
          <h1 className="text-4xl font-black">#{dayNum}</h1>
          <p className="text-gray-400 text-sm mt-1">{new Date(dateStr + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 space-y-3 text-left text-sm text-gray-600">
          <p>📋 <strong className="text-gray-900">15 คำศัพท์</strong> เหมือนกันทุกคนในวันนี้</p>
          <p>🌍 ผลสรุปเปรียบเทียบกันทั่วโลกได้</p>
          <p>🔥 ตอบถูกต่อเนื่อง = Combo คูณคะแนน</p>
          <p>📤 แชร์ score ท้าเพื่อนได้หลังเล่น</p>
        </div>

        <button
          onClick={() => setPhase("playing")}
          className="w-full rounded-2xl bg-blue-600 text-white py-4 text-lg font-bold hover:bg-blue-500 active:scale-[0.97] transition-all"
        >
          Start Today's Challenge
        </button>

        <a href="/" className="block text-sm text-gray-400 hover:text-gray-600">&larr; Back</a>
      </div>
    );
  }

  // --- Result ---
  if (phase === "result" && result) {
    const { label, emoji } = rankLabel(result.accuracy);
    const wrongAnswers = answers.filter((a) => !a.correct);

    return (
      <div className="mx-auto max-w-md space-y-5 pt-6">
        {/* Share card */}
        <div ref={cardRef} className="rounded-2xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white p-6 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-blue-500 uppercase tracking-widest">TOEIC Daily</p>
              <p className="text-2xl font-black text-gray-900">Challenge #{result.dayNum}</p>
              <p className="text-xs text-gray-400">{new Date(result.dateStr + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "long" })}</p>
            </div>
            <div className="text-5xl">{emoji}</div>
          </div>

          {/* Score */}
          <div className="flex items-end gap-4">
            <div>
              <p className="text-xs text-gray-400">Score</p>
              <p className="text-4xl font-black text-blue-600">{result.score}</p>
            </div>
            <div className="pb-1 space-y-0.5">
              <p className="text-sm font-medium text-gray-700">{label}</p>
              <div className="flex gap-1">
                {Array.from({ length: 15 }, (_, i) => (
                  <div
                    key={i}
                    className={`h-3 w-3 rounded-sm ${i < result.correct ? "bg-green-500" : "bg-red-300"}`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { label: "Correct", value: result.correct, color: "text-green-600" },
              { label: "Wrong", value: result.wrong, color: "text-red-500" },
              { label: "Accuracy", value: `${result.accuracy}%`, color: "text-blue-600" },
              { label: "Combo", value: `x${result.maxCombo}`, color: "text-yellow-600" },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl border border-gray-100 py-2">
                <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-gray-400">{s.label}</p>
              </div>
            ))}
          </div>

          {/* URL */}
          <p className="text-center text-xs text-gray-300 font-medium tracking-wider">vocabpop.app/daily</p>
        </div>

        {/* Share button */}
        <button
          onClick={() => handleShare(result)}
          className="w-full rounded-xl bg-blue-600 text-white py-3.5 font-bold text-base hover:bg-blue-500 active:scale-[0.97] transition-all flex items-center justify-center gap-2"
        >
          {copied ? "✅ Copied!" : "📤 Share Score"}
        </button>

        {/* Wrong answers */}
        {wrongAnswers.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-500">Words to review:</p>
            {wrongAnswers.map((a) => {
              const origQ = questions.find((q) => q.word === a.word);
              return (
                <div key={a.word} className="rounded-xl border border-red-100 bg-red-50 px-4 py-2.5 text-sm">
                  <span className="font-semibold text-gray-800">{a.word}</span>
                  <span className="text-gray-400 mx-1">=</span>
                  <span className="text-green-700 font-medium">{origQ?.correctAnswer}</span>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex gap-3">
          <a href="/daily" onClick={() => localStorage.removeItem("daily-result")}
            className="flex-1 rounded-xl border border-gray-200 py-3 text-center text-sm font-medium hover:border-gray-400"
          >
            Practice Again
          </a>
          <a href="/" className="flex-1 rounded-xl bg-gray-900 text-white py-3 text-center text-sm font-medium hover:bg-gray-700">
            Play More
          </a>
        </div>
      </div>
    );
  }

  // --- Playing ---
  const progress = ((current + 1) / questions.length) * 100;
  const comboMultiplier = Math.min(combo, 5);
  const pts = POINTS[q?.difficulty] ?? 10;

  return (
    <div className="mx-auto max-w-xl space-y-5 pt-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-blue-500 uppercase tracking-widest">Daily Challenge</p>
          <p className="text-sm font-black text-gray-800">#{dayNum}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black text-gray-900">{score}</p>
          {combo > 1 && (
            <p className="text-xs font-bold text-yellow-600">COMBO x{comboMultiplier}</p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-gray-400">
          <span>{current + 1} / {questions.length}</span>
          <span className={DIFF_COLORS[q?.difficulty] ?? ""}>{q?.difficulty} · +{pts * comboMultiplier}</span>
        </div>
        <div className="h-2 rounded-full bg-gray-100">
          <div className="h-2 rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        {/* Word progress dots */}
        <div className="flex gap-1 pt-0.5">
          {questions.map((_, i) => {
            const ans = answers[i];
            return (
              <div key={i} className={`flex-1 h-1 rounded-full ${
                ans ? (ans.correct ? "bg-green-400" : "bg-red-400") : i === current ? "bg-blue-400" : "bg-gray-200"
              }`} />
            );
          })}
        </div>
      </div>

      {/* Word card */}
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400 capitalize">{q?.category?.replace(/_/g, " ")}</span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{q?.pos}</span>
        </div>
        <h2 className="text-3xl font-bold text-blue-600">{q?.word}</h2>
        {!showHint && selected === null && (
          <button onClick={() => setShowHint(true)} className="text-xs text-gray-400 hover:text-gray-600">
            Show example sentence
          </button>
        )}
        {showHint && q?.example && (
          <p className="text-sm text-gray-400 italic">
            &ldquo;{q.example.replace(new RegExp(q.word, "gi"), "______")}&rdquo;
          </p>
        )}
      </div>

      {/* Question */}
      <p className="text-center font-semibold text-gray-700">คำนี้แปลว่าอะไร?</p>

      {/* Options */}
      <div className="grid gap-2.5">
        {q?.options?.map((opt, idx) => {
          let cls = "rounded-xl border-2 px-4 py-3.5 text-left transition-all duration-150";
          if (selected !== null) {
            if (opt === q.correctAnswer) cls += " border-green-500 bg-green-50 text-green-700";
            else if (opt === selected) cls += " border-red-500 bg-red-50 text-red-700";
            else cls += " border-gray-100 text-gray-300";
          } else {
            cls += " border-gray-200 text-gray-700 hover:border-blue-400 hover:bg-blue-50/50 cursor-pointer active:scale-[0.98]";
          }
          return (
            <button key={idx} className={cls} onClick={() => handleSelect(opt)}>
              <span className="mr-3 inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs text-gray-500">
                {String.fromCharCode(65 + idx)}
              </span>
              {opt}
            </button>
          );
        })}
      </div>

      {/* After answer */}
      {selected !== null && (
        <div className="space-y-3">
          {selected === q.correctAnswer ? (
            <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-sm text-center">
              <span className="font-bold text-green-700">+{pts * comboMultiplier} pts</span>
              {comboMultiplier > 1 && <span className="text-green-500 ml-2">COMBO x{comboMultiplier} 🔥</span>}
            </div>
          ) : (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm space-y-1">
              <p className="text-red-600 font-medium">Incorrect</p>
              <p><span className="text-gray-500">Correct: </span><span className="font-semibold text-green-700">{q.correctAnswer}</span></p>
              {q.meaningEn && <p className="text-xs text-gray-400">{q.meaningEn}</p>}
            </div>
          )}

          {selected !== q.correctAnswer && !explanation && (
            <button
              onClick={handleExplain}
              disabled={explaining}
              className="w-full rounded-xl border border-amber-200 bg-amber-50 py-2.5 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
            >
              {explaining ? "Loading..." : "✨ AI Explain"}
            </button>
          )}

          {explanation && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 text-sm text-gray-700 max-h-52 overflow-y-auto leading-relaxed">
              {explanation}
            </div>
          )}

          <button
            onClick={handleNext}
            className="w-full rounded-xl bg-blue-600 text-white py-3.5 font-bold hover:bg-blue-500 active:scale-[0.97]"
          >
            {current + 1 >= questions.length ? "See Results" : "Next"}
          </button>
        </div>
      )}
    </div>
  );
}
