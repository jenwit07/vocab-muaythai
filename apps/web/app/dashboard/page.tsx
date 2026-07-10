"use client";

import { useState, useEffect } from "react";

type CategoryStat = {
  category: string;
  label: string;
  totalVocab: number;
  attempted: number;
  correct: number;
  accuracy: number | null;
  weaknessScore: number;
  status: "not_started" | "strong" | "needs_work" | "weak";
};

type WeakWord = {
  word: string;
  meaningTh: string;
  category: string;
  wrongCount: number;
  correctCount: number;
  masteryScore: number;
};

type DashboardData = {
  overview: {
    totalAttempts: number;
    totalCorrect: number;
    overallAccuracy: number | null;
    categoriesAttempted: number;
    totalCategories: number;
    totalVocab: number;
  };
  categories: CategoryStat[];
  suggestions: CategoryStat[];
  topWeakWords: WeakWord[];
};

const STATUS_CONFIG = {
  weak: { label: "Weak", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", bar: "bg-red-500" },
  needs_work: { label: "Needs Work", color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30", bar: "bg-yellow-500" },
  strong: { label: "Strong", color: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/30", bar: "bg-green-500" },
  not_started: { label: "Not Started", color: "text-gray-500", bg: "bg-gray-500/10", border: "border-gray-700", bar: "bg-gray-600" },
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, []);

  if (loading || !data) {
    return <div className="pt-12 text-center text-gray-400">Loading dashboard...</div>;
  }

  const { overview, categories, suggestions, topWeakWords } = data;
  const hasData = overview.totalAttempts > 0;

  return (
    <div className="space-y-8 pt-4">
      <div>
        <h1 className="text-2xl font-bold">Your Progress</h1>
        <p className="text-gray-400">Track your strengths and weaknesses across TOEIC categories</p>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard
          label="Overall Accuracy"
          value={overview.overallAccuracy !== null ? `${overview.overallAccuracy}%` : "—"}
          sub={hasData ? `${overview.totalCorrect}/${overview.totalAttempts} correct` : "Take a quiz to start"}
        />
        <StatCard
          label="Categories Covered"
          value={`${overview.categoriesAttempted}/${overview.totalCategories}`}
          sub={`${overview.totalCategories - overview.categoriesAttempted} remaining`}
        />
        <StatCard
          label="Total Vocab"
          value={`${overview.totalVocab}`}
          sub="words in bank"
        />
        <StatCard
          label="Weak Words"
          value={`${topWeakWords.length}`}
          sub="words to review"
        />
      </div>

      {/* Suggestions */}
      {hasData && suggestions.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Suggested for You</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {suggestions.map((cat) => {
              const cfg = STATUS_CONFIG[cat.status];
              return (
                <div
                  key={cat.category}
                  className={`rounded-xl border ${cfg.border} p-4 space-y-3`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold capitalize">{cat.label}</p>
                      <p className="text-xs text-gray-500">{cat.totalVocab} words</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${cfg.color} ${cfg.bg}`}>
                      {cfg.label}
                    </span>
                  </div>

                  {cat.status === "not_started" ? (
                    <p className="text-sm text-gray-400">You haven&apos;t tried this category yet</p>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 rounded-full bg-gray-800">
                          <div
                            className={`h-2 rounded-full ${cfg.bar}`}
                            style={{ width: `${cat.accuracy ?? 0}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium">{cat.accuracy}%</span>
                      </div>
                      <p className="text-xs text-gray-500">
                        {cat.correct}/{cat.attempted} correct
                      </p>
                    </>
                  )}

                  <a
                    href={`/quiz?category=${cat.category}`}
                    className="block w-full rounded-lg bg-blue-600 py-2 text-center text-sm font-medium hover:bg-blue-500"
                  >
                    {cat.status === "not_started" ? "Start" : "Practice"} this category
                  </a>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* All Categories */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">All Categories</h2>
        <div className="space-y-2">
          {categories.map((cat) => {
            const cfg = STATUS_CONFIG[cat.status];
            return (
              <div
                key={cat.category}
                className="flex items-center gap-4 rounded-lg border border-gray-800 p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium capitalize truncate">{cat.label}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${cfg.color} ${cfg.bg}`}>
                      {cfg.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">{cat.totalVocab} words</p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {cat.accuracy !== null && (
                    <div className="flex items-center gap-2 w-32">
                      <div className="h-1.5 flex-1 rounded-full bg-gray-800">
                        <div
                          className={`h-1.5 rounded-full ${cfg.bar}`}
                          style={{ width: `${cat.accuracy}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium w-8 text-right">{cat.accuracy}%</span>
                    </div>
                  )}
                  <a
                    href={`/quiz?category=${cat.category}`}
                    className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs hover:border-gray-500"
                  >
                    Quiz
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Top Weak Words */}
      {topWeakWords.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Words You Struggle With</h2>
            <a href="/review" className="text-sm text-blue-400 hover:text-blue-300">
              View all &rarr;
            </a>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {topWeakWords.map((w) => (
              <div
                key={w.word}
                className="flex items-center justify-between rounded-lg border border-gray-800 p-3"
              >
                <div>
                  <p className="font-medium">{w.word}</p>
                  <p className="text-xs text-gray-400">{w.meaningTh}</p>
                </div>
                <div className="text-right">
                  <span className="rounded bg-red-500/10 px-2 py-0.5 text-xs text-red-400">
                    {w.wrongCount}x wrong
                  </span>
                  <p className="mt-1 text-xs text-gray-500 capitalize">
                    {w.category.replace(/_/g, " ")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {!hasData && (
        <div className="rounded-xl border border-gray-800 p-8 text-center space-y-4">
          <p className="text-lg text-gray-400">No quiz data yet</p>
          <p className="text-sm text-gray-500">
            Take a quiz to see your strengths and weaknesses across TOEIC categories
          </p>
          <a
            href="/quiz"
            className="inline-block rounded-lg bg-blue-600 px-6 py-3 font-medium hover:bg-blue-500"
          >
            Start Your First Quiz
          </a>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-gray-800 p-4 space-y-1">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-gray-500">{sub}</p>
    </div>
  );
}
