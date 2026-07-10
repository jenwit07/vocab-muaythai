"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CATEGORIES } from "./categories";

type Question = {
  id: string;
  word: string;
  pos: string;
  meaningTh: string;
  meaningEn?: string;
  category: string;
  difficulty: string;
  confusedWith: string[];
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

const DIFFICULTY_COLORS = {
  easy: "text-green-400 bg-green-500/10",
  medium: "text-yellow-400 bg-yellow-500/10",
  hard: "text-red-400 bg-red-500/10",
};

const QUIZ_LENGTHS = [10, 20, 30, 50];

function QuizContent() {
  const searchParams = useSearchParams();
  const [category, setCategory] = useState(searchParams.get("category") ?? "");
  const [difficulty, setDifficulty] = useState(searchParams.get("difficulty") ?? "");
  const [quizLength, setQuizLength] = useState(Number(searchParams.get("limit") ?? 20));
  const [questions, setQuestions] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSetup, setShowSetup] = useState(true);
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [result, setResult] = useState<{
    score: number;
    total: number;
    accuracy: number;
  } | null>(null);

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(quizLength) });
    if (category) params.set("category", category);
    if (difficulty) params.set("difficulty", difficulty);

    const res = await fetch(`/api/quiz?${params}`);
    const data = await res.json();

    if (data.error) {
      setQuestions([]);
    } else {
      setQuestions(data.questions);
    }

    setCurrent(0);
    setSelected(null);
    setAnswers([]);
    setFinished(false);
    setResult(null);
    setExplanation(null);
    setShowHint(false);
    setShowSetup(false);
    setLoading(false);
  }, [category, difficulty, quizLength]);

  // Auto-start if category from URL
  useEffect(() => {
    if (searchParams.get("category")) {
      fetchQuestions();
    }
  }, []);

  const q = questions[current];
  const score = answers.filter((a) => a.correct).length;

  function handleSelect(option: string) {
    if (selected !== null) return;
    setSelected(option);
    setAnswers((prev) => [
      ...prev,
      {
        word: q.word,
        selected: option,
        correct: option === q.correctAnswer,
        category: q.category,
      },
    ]);
  }

  async function handleNext() {
    setExplanation(null);
    setShowHint(false);
    if (current + 1 >= questions.length) {
      const finalAnswers = answers;
      // Include current answer if not yet added
      const res = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: finalAnswers }),
      });
      const data = await res.json();
      setResult(data);
      setFinished(true);
    } else {
      setCurrent((c) => c + 1);
      setSelected(null);
    }
  }

  async function handleExplain() {
    setExplaining(true);
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word: q.word,
          confusedWith: q.confusedWith[0] ?? q.word,
        }),
      });
      const data = await res.json();
      setExplanation(data.explanation);
    } catch {
      setExplanation("Failed to load explanation.");
    }
    setExplaining(false);
  }

  // Setup screen
  if (showSetup) {
    return (
      <div className="mx-auto max-w-lg space-y-6 pt-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Vocab Quiz</h1>
          <p className="text-gray-400">
            English word → เลือกความหมายภาษาไทย
          </p>
        </div>

        {/* Category */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Category</label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCategory("")}
              className={`rounded-full px-4 py-1.5 text-sm ${
                !category ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              All categories
            </button>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`rounded-full px-4 py-1.5 text-sm capitalize ${
                  category === cat
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:text-white"
                }`}
              >
                {cat.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </div>

        {/* Difficulty */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Difficulty</label>
          <div className="flex gap-2">
            <button
              onClick={() => setDifficulty("")}
              className={`rounded-full px-4 py-1.5 text-sm ${
                !difficulty ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              All levels
            </button>
            {["easy", "medium", "hard"].map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={`rounded-full px-4 py-1.5 text-sm capitalize ${
                  difficulty === d
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:text-white"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Quiz Length */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Questions</label>
          <div className="flex gap-2">
            {QUIZ_LENGTHS.map((n) => (
              <button
                key={n}
                onClick={() => setQuizLength(n)}
                className={`rounded-full px-4 py-1.5 text-sm ${
                  quizLength === n
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:text-white"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={fetchQuestions}
          className="w-full rounded-xl bg-blue-600 py-4 text-lg font-semibold hover:bg-blue-500"
        >
          Start Quiz
        </button>
      </div>
    );
  }

  if (loading) {
    return <div className="pt-12 text-center text-gray-400">Loading questions...</div>;
  }

  if (questions.length === 0) {
    return (
      <div className="pt-12 text-center space-y-4">
        <p className="text-gray-400">No questions available for this filter.</p>
        <button
          onClick={() => setShowSetup(true)}
          className="rounded-lg bg-blue-600 px-6 py-3 font-medium hover:bg-blue-500"
        >
          Change Settings
        </button>
      </div>
    );
  }

  // Results screen
  if (finished && result) {
    const wrongAnswers = answers.filter((a) => !a.correct);
    const emoji =
      result.accuracy >= 90 ? "Excellent!" : result.accuracy >= 70 ? "Good job!" : result.accuracy >= 50 ? "Keep practicing!" : "Don't give up!";

    return (
      <div className="mx-auto max-w-lg space-y-6 pt-8">
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-bold">{emoji}</h1>
          <div className="relative mx-auto h-32 w-32">
            <svg className="h-32 w-32 -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="50" stroke="#1f2937" strokeWidth="10" fill="none" />
              <circle
                cx="60"
                cy="60"
                r="50"
                stroke={result.accuracy >= 70 ? "#22c55e" : result.accuracy >= 50 ? "#eab308" : "#ef4444"}
                strokeWidth="10"
                fill="none"
                strokeDasharray={`${(result.accuracy / 100) * 314} 314`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold">{result.accuracy}%</span>
              <span className="text-xs text-gray-400">
                {result.score}/{result.total}
              </span>
            </div>
          </div>
        </div>

        {/* Wrong answers detail */}
        {wrongAnswers.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-semibold text-red-400">
              Words to review ({wrongAnswers.length})
            </h3>
            {wrongAnswers.map((a) => {
              const q = questions.find((q) => q.word === a.word);
              return (
                <div
                  key={a.word}
                  className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{a.word}</span>
                    <span className="text-xs text-gray-500 capitalize">
                      {a.category.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="text-sm text-green-400">
                    Correct: {q?.correctAnswer}
                  </p>
                  <p className="text-sm text-red-400/70">
                    Your answer: {a.selected}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            onClick={() => {
              setShowSetup(false);
              fetchQuestions();
            }}
            className="rounded-xl bg-blue-600 py-3 font-medium hover:bg-blue-500"
          >
            Play Again
          </button>
          <button
            onClick={() => setShowSetup(true)}
            className="rounded-xl border border-gray-700 py-3 font-medium hover:border-gray-500"
          >
            Change Settings
          </button>
          <a
            href="/dashboard"
            className="rounded-xl border border-gray-700 py-3 text-center font-medium hover:border-gray-500 sm:col-span-2"
          >
            View Dashboard
          </a>
        </div>
      </div>
    );
  }

  // Quiz question screen
  const progress = ((current + 1) / questions.length) * 100;
  const diffColor = DIFFICULTY_COLORS[q.difficulty as keyof typeof DIFFICULTY_COLORS] ?? DIFFICULTY_COLORS.medium;

  return (
    <div className="mx-auto max-w-xl space-y-6 pt-4">
      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">
            {current + 1} / {questions.length}
          </span>
          <span className="text-gray-400">
            Score: {score}/{current + (selected ? 1 : 0)}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-gray-800">
          <div
            className="h-1.5 rounded-full bg-blue-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Word card */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 capitalize">
            {q.category.replace(/_/g, " ")}
          </span>
          <div className="flex gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs ${diffColor}`}>
              {q.difficulty}
            </span>
            <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
              {q.pos}
            </span>
          </div>
        </div>

        <h2 className="text-3xl font-bold text-blue-300">{q.word}</h2>

        {/* Hint toggle */}
        {!showHint && selected === null && (
          <button
            onClick={() => setShowHint(true)}
            className="text-xs text-gray-500 hover:text-gray-300"
          >
            Show hint (example sentence)
          </button>
        )}
        {showHint && q.example && (
          <p className="text-sm text-gray-400 italic">
            &ldquo;{q.example.replace(new RegExp(q.word, "gi"), "______")}&rdquo;
          </p>
        )}
      </div>

      {/* Question */}
      <p className="text-center text-lg font-medium text-gray-300">
        คำนี้แปลว่าอะไร?
      </p>

      {/* Options */}
      <div className="grid gap-3">
        {q.options.map((opt, idx) => {
          let cls =
            "rounded-xl border-2 px-5 py-4 text-left transition-all duration-200";
          if (selected !== null) {
            if (opt === q.correctAnswer)
              cls += " border-green-500 bg-green-500/10 text-green-300";
            else if (opt === selected)
              cls += " border-red-500 bg-red-500/10 text-red-300";
            else cls += " border-gray-800 text-gray-600";
          } else {
            cls +=
              " border-gray-700 hover:border-blue-500/50 hover:bg-gray-800/50 cursor-pointer text-gray-200";
          }
          return (
            <button key={`${opt}-${idx}`} className={cls} onClick={() => handleSelect(opt)}>
              <span className="mr-3 inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-800 text-xs text-gray-400">
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
          {/* Correct feedback */}
          {selected === q.correctAnswer && (
            <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 text-center">
              <p className="text-green-400 font-medium">Correct!</p>
              {q.meaningEn && (
                <p className="text-sm text-gray-400 mt-1">{q.meaningEn}</p>
              )}
            </div>
          )}

          {/* Wrong feedback */}
          {selected !== q.correctAnswer && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 space-y-2">
              <p className="text-red-400 font-medium">Incorrect</p>
              <p className="text-sm">
                <span className="text-gray-400">Correct: </span>
                <span className="text-green-400 font-medium">{q.correctAnswer}</span>
              </p>
              {q.meaningEn && (
                <p className="text-xs text-gray-500">{q.meaningEn}</p>
              )}
              {q.example && (
                <p className="text-xs text-gray-500 italic mt-1">
                  &ldquo;{q.example}&rdquo;
                </p>
              )}
            </div>
          )}

          {/* AI Explain */}
          {selected !== q.correctAnswer && !explanation && (
            <button
              onClick={handleExplain}
              disabled={explaining}
              className="w-full rounded-xl border border-yellow-600/40 py-2.5 text-sm text-yellow-400 hover:bg-yellow-600/10 disabled:opacity-50"
            >
              {explaining ? "Generating explanation..." : "AI Explain"}
            </button>
          )}

          {explanation && (
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm whitespace-pre-wrap max-h-80 overflow-y-auto">
              {explanation}
            </div>
          )}

          {/* Next button */}
          <button
            onClick={handleNext}
            className="w-full rounded-xl bg-blue-600 py-3.5 font-semibold hover:bg-blue-500"
          >
            {current + 1 >= questions.length ? "See Results" : "Next Question"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function QuizPage() {
  return (
    <Suspense fallback={<div className="pt-12 text-center text-gray-400">Loading...</div>}>
      <QuizContent />
    </Suspense>
  );
}
