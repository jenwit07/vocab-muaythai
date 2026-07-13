"use client";

import { useState, useEffect, useRef } from "react";

type ClusterWord = {
  word: string;
  meaningTh: string;
  meaningEn?: string;
  pos: string;
  category: string;
  wrongCount: number;
  examples: string[];
};

type Cluster = {
  id: string;
  label: string;
  words: ClusterWord[];
  totalWrong: number;
  severity: "high" | "medium" | "low";
};

const SEVERITY_CONFIG = {
  high: { label: "Focus", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", dot: "bg-red-500" },
  medium: { label: "Review", color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30", dot: "bg-yellow-500" },
  low: { label: "Minor", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30", dot: "bg-blue-500" },
};

export default function LearnPage() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lessons, setLessons] = useState<Record<string, string>>({});
  const [loadingLesson, setLoadingLesson] = useState<string | null>(null);
  const lessonRef = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    fetch("/api/clusters")
      .then((r) => r.json())
      .then((d) => {
        setClusters(d.clusters ?? []);
        setLoading(false);
      });
  }, []);

  async function handleGenerateLesson(cluster: Cluster) {
    // Toggle expand
    if (expandedId === cluster.id) {
      setExpandedId(null);
      return;
    }

    setExpandedId(cluster.id);

    // Already generated
    if (lessons[cluster.id]) return;

    setLoadingLesson(cluster.id);
    try {
      const res = await fetch("/api/lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words: cluster.words }),
      });
      const data = await res.json();
      setLessons((prev) => ({ ...prev, [cluster.id]: data.lesson ?? "Failed to generate." }));
    } catch {
      setLessons((prev) => ({ ...prev, [cluster.id]: "Failed to generate lesson." }));
    }
    setLoadingLesson(null);
  }

  if (loading) {
    return (
      <div className="space-y-6 pt-8">
        <div className="space-y-2">
          <div className="h-8 w-48 rounded bg-gray-100 animate-pulse" />
          <div className="h-5 w-80 rounded bg-gray-100 animate-pulse" />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-40 rounded-xl border border-gray-200 bg-gray-50 animate-pulse" />
        ))}
      </div>
    );
  }

  if (clusters.length === 0) {
    return (
      <div className="space-y-6 pt-8">
        <div>
          <h1 className="text-2xl font-bold">Learn from Mistakes</h1>
          <p className="text-gray-500">AI-powered lessons based on your confusion patterns</p>
        </div>
        <div className="rounded-xl border border-gray-200 p-12 text-center space-y-4">
          <div className="text-4xl">🎯</div>
          <p className="text-lg text-gray-500">No confusion clusters yet</p>
          <p className="text-sm text-gray-400">
            Take some quizzes first — when you make mistakes, the system will detect
            patterns and create personalized lessons for you.
          </p>
          <a
            href="/quiz"
            className="inline-block rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-500"
          >
            Start a Quiz
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-8">
      <div>
        <h1 className="text-2xl font-bold">Learn from Mistakes</h1>
        <p className="text-gray-500">
          {clusters.length} confusion {clusters.length === 1 ? "cluster" : "clusters"} detected from your quiz history
        </p>
      </div>

      <div className="space-y-4">
        {clusters.map((cluster) => {
          const cfg = SEVERITY_CONFIG[cluster.severity];
          const isExpanded = expandedId === cluster.id;
          const isLoading = loadingLesson === cluster.id;
          const lesson = lessons[cluster.id];

          return (
            <div
              key={cluster.id}
              className={`rounded-xl border ${isExpanded ? cfg.border : "border-gray-200"} bg-white overflow-hidden transition-colors duration-200`}
            >
              {/* Header — always visible, fixed height */}
              <button
                onClick={() => handleGenerateLesson(cluster)}
                className="w-full p-5 text-left"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${cfg.dot} shrink-0`} />
                      <h3 className="font-semibold truncate">{cluster.label}</h3>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${cfg.color} ${cfg.bg}`}>
                        {cfg.label}
                      </span>
                    </div>

                    {/* Word pills */}
                    <div className="flex flex-wrap gap-1.5">
                      {cluster.words.map((w) => (
                        <span
                          key={w.word}
                          className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs"
                        >
                          <span className="font-medium text-gray-700">{w.word}</span>
                          {w.wrongCount > 0 && (
                            <span className="text-red-400/70">{w.wrongCount}x</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Expand arrow */}
                  <div className={`shrink-0 mt-1 text-gray-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                </div>
              </button>

              {/* Expanded content */}
              <div
                className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
              >
                <div className="overflow-hidden">
                  <div
                    ref={(el) => { lessonRef.current[cluster.id] = el; }}
                    className="border-t border-gray-200 px-5 pb-5 pt-4 space-y-4"
                  >
                    {/* Word comparison table — always show */}
                    <div className="space-y-1">
                      {cluster.words.map((w) => (
                        <div
                          key={w.word}
                          className="flex items-baseline gap-3 rounded-lg bg-gray-100 px-3 py-2"
                        >
                          <span className="font-mono font-semibold text-blue-600 w-28 shrink-0">
                            {w.word}
                          </span>
                          <span className="text-xs text-gray-400 w-10 shrink-0">
                            {w.pos}
                          </span>
                          <span className="text-sm text-gray-700 flex-1">
                            {w.meaningTh}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Lesson content */}
                    <div className="min-h-[120px]">
                      {isLoading && (
                        <div className="flex items-center gap-3 py-8 justify-center text-gray-400">
                          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
                            <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                          </svg>
                          <span className="text-sm">Generating lesson...</span>
                        </div>
                      )}

                      {!isLoading && lesson && (
                        <div className="prose prose-sm max-w-none">
                          <div
                            className="text-sm leading-relaxed text-gray-700 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-gray-900 [&_h2]:mt-4 [&_h2]:mb-2 [&_strong]:text-blue-600 [&_p]:mb-2"
                            dangerouslySetInnerHTML={{
                              __html: formatMarkdown(lesson),
                            }}
                          />
                        </div>
                      )}

                      {!isLoading && !lesson && (
                        <div className="flex justify-center py-6">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleGenerateLesson(cluster);
                            }}
                            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500"
                          >
                            Generate AI Lesson
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatMarkdown(text: string): string {
  return text
    .replace(/## (.*)/g, "<h2>$1</h2>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, '<code class="rounded bg-gray-100 px-1 py-0.5 text-xs">$1</code>')
    .replace(/^- (.*)/gm, '<div class="flex gap-2 mb-1"><span class="text-gray-400 shrink-0">•</span><span>$1</span></div>')
    .replace(/^(\d+)\. (.*)/gm, '<div class="flex gap-2 mb-1"><span class="text-gray-400 shrink-0">$1.</span><span>$2</span></div>')
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>");
}
