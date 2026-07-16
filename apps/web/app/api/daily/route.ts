import { NextResponse } from "next/server";
import { getDb } from "@repo/db";
import type { VocabWord } from "@repo/db";

const DAILY_WORD_COUNT = 15;
// Day 1 reference point
const EPOCH = new Date("2026-07-16").getTime();

// Seeded pseudo-random from date string — deterministic, same for everyone
function seededRandom(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h >>> 16;
    h = Math.imul(h, 0x45d9f3b);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  };
}

function seededShuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function getDailyMeta(dateStr: string) {
  const dayNum = Math.floor((new Date(dateStr).getTime() - EPOCH) / 86400000) + 1;
  return { dayNum: Math.max(1, dayNum), dateStr };
}

// GET /api/daily?date=2026-07-16  (date optional — defaults to today)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // Use UTC date to ensure everyone gets the same day regardless of timezone
  const dateStr = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const { dayNum } = getDailyMeta(dateStr);

  const db = await getDb();
  const vocab = db.collection<VocabWord>("vocab_words");
  const allWords = await vocab.find({}, { projection: { embedding: 0 } }).toArray();

  if (allWords.length < DAILY_WORD_COUNT) {
    return NextResponse.json({ error: "Not enough vocab" }, { status: 500 });
  }

  const rng = seededRandom(`daily-${dateStr}`);
  const shuffled = seededShuffle(allWords, rng);
  const todayWords = shuffled.slice(0, DAILY_WORD_COUNT);

  // Generate choices for each word (also seeded — same for everyone)
  const questions = todayWords.map((qWord, i) => {
    const qRng = seededRandom(`daily-${dateStr}-q${i}`);
    const others = shuffled
      .filter((w) => w.canonicalWord !== qWord.canonicalWord)
      .sort(() => qRng() - 0.5)
      .slice(0, 6);

    // Mix: prefer same category distractors for harder choices
    const sameCat = others.filter((w) => w.category === qWord.category).slice(0, 2);
    const anyOther = others.filter((w) => w.category !== qWord.category).slice(0, 2);
    const distractors = [...sameCat, ...anyOther]
      .sort(() => qRng() - 0.5)
      .slice(0, 3)
      .map((w) => w.meaningTh);

    const options = [...distractors, qWord.meaningTh].sort(() => qRng() - 0.5);

    return {
      id: qWord._id!.toString(),
      word: qWord.word,
      pos: qWord.pos,
      meaningTh: qWord.meaningTh,
      meaningEn: qWord.meaningEn,
      category: qWord.category,
      difficulty: qWord.difficulty,
      example: qWord.examples[0] ?? "",
      options,
      correctAnswer: qWord.meaningTh,
    };
  });

  return NextResponse.json({ questions, dayNum, dateStr, total: DAILY_WORD_COUNT });
}
