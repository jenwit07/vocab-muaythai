"use client";

// Cheeky "you got snatched" reaction shown when an opponent answers your open
// bubble before you. Shared by /game/online and /game/multi.

export type SnatchVariant = "stolen" | "fumbled";

const STOLEN = {
  emojis: ["😜", "🤪", "😏", "😎", "🫵", "🤣"],
  lines: [
    "โดนแย่งไปแล้วจ้า~",
    "ช้าไป 0.1 วิ!",
    "{snatcher} เอาไปกิน 😏",
    "มือไวกว่า...อดเลย 🫵",
    "อดจ้า 555",
  ],
};

const FUMBLED = {
  emojis: ["🤡", "🤣", "😹"],
  lines: [
    "{snatcher} แย่งไปแต่ตอบผิด! 🤡",
    "แย่งแล้วพลาดเอง 5555",
    "เสียมารยาทแถมตอบผิด 😹",
  ],
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function pickSnatchTaunt(
  variant: SnatchVariant,
  snatcher: string
): { emoji: string; text: string } {
  const pool = variant === "fumbled" ? FUMBLED : STOLEN;
  const emoji = pick(pool.emojis);
  const text = pick(pool.lines).replace("{snatcher}", snatcher || "คู่ต่อสู้");
  return { emoji, text };
}

export function SnatchOverlay({ emoji, text }: { emoji: string; text: string }) {
  return (
    <div className="snatch-overlay absolute inset-0 z-40 flex flex-col items-center justify-center pointer-events-none">
      <div className="snatch-emoji" style={{ fontSize: 104, lineHeight: 1 }}>
        {emoji}
      </div>
      <div className="snatch-text mt-4 text-2xl sm:text-3xl font-black text-white text-center px-6 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
        {text}
      </div>
      <style>{`
        .snatch-overlay { background: rgba(0,0,0,0.45); animation: snatch-fade 0.7s ease-out forwards; }
        .snatch-emoji { animation: snatch-spin 0.5s cubic-bezier(.2,1.4,.5,1) both; will-change: transform; }
        .snatch-text { animation: snatch-pop 0.3s ease-out 0.05s both; }
        @keyframes snatch-fade {
          0%   { opacity: 1; }
          60%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes snatch-spin {
          0%   { transform: scale(0) rotate(-140deg); opacity: 0; }
          55%  { transform: scale(1.3) rotate(20deg); opacity: 1; }
          78%  { transform: scale(0.95) rotate(-8deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes snatch-pop {
          0%   { transform: scale(0.5) translateY(10px); opacity: 0; }
          70%  { transform: scale(1.08); }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
