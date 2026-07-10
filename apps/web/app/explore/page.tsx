"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type Bubble = {
  word: string;
  meaningTh: string;
  meaningEn?: string;
  pos: string;
  category: string;
  difficulty: string;
  confusedWith: string[];
  examples: string[];
  collocations: string[];
  x: number;
  y: number;
};

const CATEGORY_COLORS: Record<string, string> = {
  business_finance: "#3b82f6",
  office_workplace: "#8b5cf6",
  jobs_hiring: "#ec4899",
  travel: "#f59e0b",
  customer_service: "#10b981",
  sales_marketing: "#ef4444",
  shipping_delivery: "#06b6d4",
  restaurant_hotel: "#f97316",
  office_equipment: "#6366f1",
  common_business_verbs: "#14b8a6",
};

const CATEGORY_LABELS: Record<string, string> = {
  business_finance: "Business & Finance",
  office_workplace: "Office & Workplace",
  jobs_hiring: "Jobs & Hiring",
  travel: "Travel",
  customer_service: "Customer Service",
  sales_marketing: "Sales & Marketing",
  shipping_delivery: "Shipping & Delivery",
  restaurant_hotel: "Restaurant & Hotel",
  office_equipment: "Office Equipment",
  common_business_verbs: "Business Verbs",
};

const DIFFICULTY_SIZE = { easy: 56, medium: 66, hard: 78 };

function useFullscreen() {
  useEffect(() => {
    const nav = document.getElementById("main-nav");
    const main = document.getElementById("main-content");
    if (nav) nav.style.display = "none";
    if (main) {
      main.style.maxWidth = "none";
      main.style.padding = "0";
      main.style.margin = "0";
    }
    return () => {
      if (nav) nav.style.display = "";
      if (main) {
        main.style.maxWidth = "";
        main.style.padding = "";
        main.style.margin = "";
      }
    };
  }, []);
}

export default function ExplorePage() {
  useFullscreen();

  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Bubble | null>(null);
  const [category, setCategory] = useState("");

  const fetchBubbles = useCallback(async () => {
    setLoading(true);
    setSelected(null);
    const params = category ? `?category=${category}` : "";
    const res = await fetch(`/api/explore${params}`);
    const data = await res.json();
    setBubbles(data.bubbles ?? []);
    setLoading(false);
  }, [category]);

  useEffect(() => {
    fetchBubbles();
  }, [fetchBubbles]);

  const categories = Object.keys(CATEGORY_COLORS);

  return (
    <div className="fixed inset-0 flex flex-col bg-gray-950">
      {/* Top bar */}
      <div className="shrink-0 border-b border-gray-800/50 bg-gray-950/80 backdrop-blur-sm px-5 py-3 z-30">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <a href="/" className="text-sm font-bold text-gray-400 hover:text-white">
              &larr;
            </a>
            <h1 className="text-sm font-semibold">Explore Vocab</h1>
            <span className="rounded-full bg-gray-800 px-2.5 py-0.5 text-xs text-gray-400">
              {bubbles.length} words
            </span>
          </div>
          <div className="hidden md:flex gap-3 text-xs text-gray-500">
            <span>size = difficulty</span>
            <span className="text-gray-700">|</span>
            <span>position = meaning similarity</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-2">
          <button
            onClick={() => setCategory("")}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              !category ? "bg-white text-gray-900" : "bg-gray-800/60 text-gray-400 hover:text-white"
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className="rounded-full px-3 py-1 text-xs transition-colors"
              style={{
                backgroundColor: category === cat ? CATEGORY_COLORS[cat] : "rgba(31,41,55,0.6)",
                color: category === cat ? "white" : "rgb(156,163,175)",
              }}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </div>

      {/* Bubble canvas */}
      <div
        className="relative flex-1 overflow-hidden"
        onClick={(e) => {
          if ((e.target as HTMLElement).dataset.canvas) setSelected(null);
        }}
        data-canvas="true"
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500 z-10">
            <svg className="mr-2 h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
              <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            Loading...
          </div>
        )}

        {!loading &&
          bubbles.map((b, i) => (
            <FloatingBubble
              key={b.word}
              bubble={b}
              index={i}
              isSelected={selected?.word === b.word}
              isRelated={
                selected
                  ? selected.confusedWith.includes(b.word) || b.confusedWith.includes(selected.word)
                  : false
              }
              isFaded={selected !== null && selected.word !== b.word}
              onClick={() => setSelected(selected?.word === b.word ? null : b)}
            />
          ))}

        {/* Detail overlay */}
        {selected && (
          <div className="absolute bottom-0 left-0 right-0 z-30 p-4 pointer-events-none">
            <div
              className="pointer-events-auto mx-auto max-w-xl rounded-2xl border border-gray-700/50 bg-gray-900/95 backdrop-blur-md p-5 shadow-2xl"
              style={{ borderColor: `${CATEGORY_COLORS[selected.category]}30` }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2
                      className="text-xl font-bold"
                      style={{ color: CATEGORY_COLORS[selected.category] }}
                    >
                      {selected.word}
                    </h2>
                    <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
                      {selected.pos}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-xs"
                      style={{
                        backgroundColor: `${CATEGORY_COLORS[selected.category]}20`,
                        color: CATEGORY_COLORS[selected.category],
                      }}
                    >
                      {selected.difficulty}
                    </span>
                    <span className="text-xs text-gray-600">
                      {CATEGORY_LABELS[selected.category]}
                    </span>
                  </div>
                  <p className="text-lg text-gray-100">{selected.meaningTh}</p>
                  {selected.meaningEn && (
                    <p className="text-sm text-gray-400">{selected.meaningEn}</p>
                  )}
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="shrink-0 rounded-lg p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {selected.examples.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-gray-500">Example</p>
                    <p className="text-sm text-gray-300 italic">
                      &ldquo;{selected.examples[0]}&rdquo;
                    </p>
                  </div>
                )}
                {selected.collocations.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-gray-500">Collocations</p>
                    <div className="flex flex-wrap gap-1">
                      {selected.collocations.map((c) => (
                        <span key={c} className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-300">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {selected.confusedWith.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-gray-500">Confused with</p>
                    <div className="flex flex-wrap gap-1">
                      {selected.confusedWith.map((w) => (
                        <button
                          key={w}
                          onClick={() => {
                            const target = bubbles.find((bb) => bb.word === w);
                            if (target) setSelected(target);
                          }}
                          className="rounded-full border px-2 py-0.5 text-xs hover:bg-gray-800"
                          style={{
                            borderColor: `${CATEGORY_COLORS[selected.category]}40`,
                            color: CATEGORY_COLORS[selected.category],
                          }}
                        >
                          {w}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Each bubble runs its own requestAnimationFrame loop for smooth floating
function FloatingBubble({
  bubble,
  index,
  isSelected,
  isRelated,
  isFaded,
  onClick,
}: {
  bubble: Bubble;
  index: number;
  isSelected: boolean;
  isRelated: boolean;
  isFaded: boolean;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const animRef = useRef<number>(0);

  const size = DIFFICULTY_SIZE[bubble.difficulty as keyof typeof DIFFICULTY_SIZE] ?? 60;
  const color = CATEGORY_COLORS[bubble.category] ?? "#6b7280";

  // Base position: 4%-96% of container
  const baseXPct = 4 + bubble.x * 92;
  const baseYPct = 4 + bubble.y * 92;

  // Each bubble gets unique wave parameters
  const freqX1 = 0.15 + (index % 7) * 0.04;
  const freqY1 = 0.12 + (index % 5) * 0.035;
  const freqX2 = 0.08 + (index % 9) * 0.02;
  const freqY2 = 0.06 + (index % 6) * 0.025;
  const ampX = 6 + (index % 8) * 2;
  const ampY = 5 + (index % 6) * 2;
  const phase = (index * 2.3) % (Math.PI * 2);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let start = performance.now();

    function tick(now: number) {
      if (!el) return;
      const t = (now - start) / 1000;

      // Layered sine waves for organic movement
      const dx =
        Math.sin(t * freqX1 + phase) * ampX +
        Math.sin(t * freqX2 + phase * 1.7) * ampX * 0.4;
      const dy =
        Math.cos(t * freqY1 + phase * 0.8) * ampY +
        Math.cos(t * freqY2 + phase * 2.1) * ampY * 0.5;

      el.style.transform = `translate(${dx}px, ${dy}px)`;
      animRef.current = requestAnimationFrame(tick);
    }

    animRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [freqX1, freqY1, freqX2, freqY2, ampX, ampY, phase]);

  let opacity = 1;
  if (isSelected) {
    opacity = 1;
  } else if (isRelated) {
    opacity = 0.85;
  } else if (isFaded) {
    opacity = 0.15;
  }

  return (
    <button
      ref={ref}
      onClick={onClick}
      className="absolute rounded-full flex items-center justify-center cursor-pointer will-change-transform"
      style={{
        width: size,
        height: size,
        left: `calc(${baseXPct}% - ${size / 2}px)`,
        top: `calc(${baseYPct}% - ${size / 2}px)`,
        backgroundColor: isSelected ? `${color}35` : `${color}12`,
        border: `1.5px solid ${isSelected ? color : `${color}50`}`,
        opacity,
        transition: "opacity 0.5s ease, border-color 0.3s ease, background-color 0.3s ease, box-shadow 0.3s ease",
        zIndex: isSelected ? 20 : isRelated ? 10 : 1,
        boxShadow: isSelected
          ? `0 0 24px ${color}50, 0 0 48px ${color}20`
          : isRelated
            ? `0 0 12px ${color}30`
            : "none",
      }}
    >
      <span
        className="text-center leading-tight font-medium px-1 select-none pointer-events-none"
        style={{
          fontSize: size < 60 ? "9px" : size < 70 ? "10px" : "11px",
          color: isSelected ? "white" : isFaded ? `${color}60` : color,
          transition: "color 0.5s ease",
        }}
      >
        {bubble.word}
      </span>
    </button>
  );
}
