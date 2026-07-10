"use client";

import { useState, useEffect } from "react";

type WeakWord = {
  word: string;
  meaningTh: string;
  meaningEn?: string;
  category: string;
  confusedWith: string[];
  wrongCount: number;
  correctCount: number;
  masteryScore: number;
  daysSinceReview: number;
  priorityScore: number;
};

export default function ReviewPage() {
  const [words, setWords] = useState<WeakWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [explaining, setExplaining] = useState<string | null>(null);
  const [explanations, setExplanations] = useState<Record<string, string>>({});

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/review?limit=15");
      const data = await res.json();
      setWords(data.words ?? []);
      setMessage(data.message ?? null);
      setLoading(false);
    }
    load();
  }, []);

  async function handleExplain(word: string, confusedWith: string) {
    setExplaining(word);
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word, confusedWith }),
      });
      const data = await res.json();
      setExplanations((prev) => ({ ...prev, [word]: data.explanation }));
    } catch {
      setExplanations((prev) => ({ ...prev, [word]: "Failed to load explanation." }));
    }
    setExplaining(null);
  }

  if (loading) {
    return <div className="pt-12 text-center text-gray-400">Loading review...</div>;
  }

  if (words.length === 0) {
    return (
      <div className="space-y-4 pt-12 text-center">
        <h1 className="text-2xl font-bold">Daily Review</h1>
        <p className="text-gray-400">{message ?? "No weak words yet. Take a quiz first!"}</p>
        <a
          href="/quiz"
          className="inline-block rounded-lg bg-blue-600 px-6 py-3 font-medium hover:bg-blue-500"
        >
          Start Quiz
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-8">
      <div>
        <h1 className="text-2xl font-bold">Daily Review</h1>
        <p className="text-gray-400">
          {words.length} words to focus on, sorted by priority
        </p>
      </div>

      <div className="space-y-3">
        {words.map((w) => (
          <div
            key={w.word}
            className="rounded-xl border border-gray-800 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold">{w.word}</p>
                <p className="text-sm text-gray-400">{w.meaningTh}</p>
                {w.meaningEn && (
                  <p className="text-xs text-gray-500">{w.meaningEn}</p>
                )}
              </div>
              <div className="text-right space-y-1">
                <div className="flex gap-2">
                  <span className="rounded bg-red-500/10 px-2 py-0.5 text-xs text-red-400">
                    {w.wrongCount} wrong
                  </span>
                  <span className="rounded bg-green-500/10 px-2 py-0.5 text-xs text-green-400">
                    {w.correctCount} right
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  {w.category.replace(/_/g, " ")}
                </p>
                <div className="flex items-center gap-1">
                  <div className="h-1.5 w-16 rounded-full bg-gray-800">
                    <div
                      className="h-1.5 rounded-full bg-blue-500"
                      style={{ width: `${w.masteryScore}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500">{w.masteryScore}%</span>
                </div>
              </div>
            </div>

            {/* Confused with */}
            {w.confusedWith.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-gray-500">Often confused with:</span>
                {w.confusedWith.map((cw) => (
                  <button
                    key={cw}
                    onClick={() => handleExplain(w.word, cw)}
                    disabled={explaining === w.word}
                    className="rounded-full border border-yellow-600/30 px-2 py-0.5 text-xs text-yellow-400 hover:bg-yellow-600/10 disabled:opacity-50"
                  >
                    {explaining === w.word ? "..." : `vs ${cw}`}
                  </button>
                ))}
              </div>
            )}

            {/* Explanation */}
            {explanations[w.word] && (
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-sm whitespace-pre-wrap">
                {explanations[w.word]}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
