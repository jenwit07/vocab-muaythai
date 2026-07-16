"use client";

import { useEffect, useState } from "react";

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

function loadProfile() {
  if (typeof window === "undefined") return { rating: 1000, wins: 0, losses: 0 };
  try {
    const raw = localStorage.getItem("vocab-rank-profile");
    if (raw) { const p = JSON.parse(raw); return { rating: p.rating ?? 1000, wins: p.wins ?? 0, losses: p.losses ?? 0 }; }
  } catch {}
  return { rating: 1000, wins: 0, losses: 0 };
}

function getRank(rating: number) {
  if (rating >= 1800) return { name: "Diamond", badge: "👑" };
  if (rating >= 1400) return { name: "Platinum", badge: "💎" };
  if (rating >= 1000) return { name: "Gold", badge: "🥇" };
  if (rating >= 600) return { name: "Silver", badge: "🥈" };
  return { name: "Bronze", badge: "🥉" };
}

export default function HomePage() {
  useFullscreen();
  const [profile] = useState(loadProfile);
  const rank = getRank(profile.rating);
  const winRate = profile.wins + profile.losses > 0 ? Math.round((profile.wins / (profile.wins + profile.losses)) * 100) : 0;

  return (
    <div className="fixed inset-0 flex flex-col bg-white">
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-full max-w-sm space-y-8">
          {/* Title */}
          <div className="space-y-2">
            <h1 className="text-5xl sm:text-6xl font-black tracking-tight">
              <span className="text-green-600">Bubble</span>{" "}
              <span className="text-yellow-500">Pop</span>{" "}
              <span className="text-red-500">!</span>
            </h1>
            <p className="text-gray-400 text-sm">Learn TOEIC vocab by popping bubbles</p>
          </div>

          {/* Rating badge */}
          {(profile.wins > 0 || profile.losses > 0) && (
            <div className="flex items-center justify-center gap-3">
              <span className="text-3xl">{rank.badge}</span>
              <div className="text-left">
                <p className="text-sm font-bold">{rank.name} · {profile.rating}</p>
                <p className="text-xs text-gray-400">{profile.wins}W {profile.losses}L · {winRate}%</p>
              </div>
            </div>
          )}

          {/* Game modes */}
          <div className="grid gap-3">
            {/* Daily Challenge — hero button */}
            <a
              href="/daily"
              className="rounded-2xl border-2 border-blue-500 bg-blue-50 px-8 py-4 text-lg font-bold text-blue-700 hover:bg-blue-100 active:scale-[0.97] transition-all text-center flex items-center justify-center gap-2"
            >
              📚 Daily Challenge
            </a>
            <a
              href="/game"
              className="rounded-2xl bg-blue-600 text-white px-8 py-4 text-lg font-bold hover:bg-blue-500 active:scale-[0.97] transition-all text-center"
            >
              Solo Mode
            </a>
            <a
              href="/game/online"
              className="rounded-2xl bg-green-600 text-white px-8 py-4 text-lg font-bold hover:bg-green-500 active:scale-[0.97] transition-all text-center"
            >
              Play Online
            </a>
            <a
              href="/game/multi"
              className="rounded-2xl border-2 border-purple-500 px-8 py-4 text-lg font-bold text-purple-500 hover:bg-purple-50 active:scale-[0.97] transition-all text-center"
            >
              VS Friend
            </a>
          </div>

          {/* Point legend */}
          <div className="flex justify-center gap-5 text-xs text-gray-400">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-green-500" />Easy +10</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-yellow-500" />Medium +25</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-500" />Hard +50</span>
          </div>
        </div>
      </div>

      {/* Bottom links */}
      <div className="shrink-0 border-t border-gray-100 px-6 py-4">
        <div className="mx-auto max-w-sm flex justify-center gap-6 text-sm text-gray-400">
          <a href="/explore" className="hover:text-gray-600">Explore</a>
          <a href="/quiz" className="hover:text-gray-600">Quiz</a>
          <a href="/dashboard" className="hover:text-gray-600">Stats</a>
          <a href="/learn" className="hover:text-gray-600">Learn</a>
          <a href="/review" className="hover:text-gray-600">Review</a>
        </div>
      </div>
    </div>
  );
}
