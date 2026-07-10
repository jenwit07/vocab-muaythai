import { NextResponse } from "next/server";
import { getDb } from "@repo/db";
import type { VocabWord, UserWordStat, UserCategoryStat } from "@repo/db";

// GET /api/quiz?category=business_finance&limit=20&difficulty=hard
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const difficulty = searchParams.get("difficulty"); // easy, medium, hard
  const limit = Math.min(Number(searchParams.get("limit") ?? 20), 50);

  const db = await getDb();
  const vocab = db.collection<VocabWord>("vocab_words");

  const filter: Record<string, unknown> = {};
  if (category) filter.category = category;
  if (difficulty) filter.difficulty = difficulty;

  const allWords = await vocab
    .find(filter, { projection: { embedding: 0 } })
    .toArray();

  if (allWords.length < 4) {
    return NextResponse.json({ error: "Not enough words to create quiz" }, { status: 400 });
  }

  // Shuffle and pick questions
  const shuffled = allWords.sort(() => Math.random() - 0.5);
  const questionWords = shuffled.slice(0, limit);

  // For wrong options, pull from ALL vocab (not just filtered) for variety
  const allVocab = category || difficulty
    ? await vocab.find({}, { projection: { embedding: 0 } }).toArray()
    : allWords;

  const questions = questionWords.map((qWord) => {
    // Pick 3 wrong Thai meanings from other words
    // Prefer same category for harder distractors
    const sameCat = allVocab
      .filter((w) => w.canonicalWord !== qWord.canonicalWord && w.category === qWord.category)
      .sort(() => Math.random() - 0.5);
    const otherCat = allVocab
      .filter((w) => w.canonicalWord !== qWord.canonicalWord && w.category !== qWord.category)
      .sort(() => Math.random() - 0.5);

    // Mix: 1-2 from same category (harder), rest from other categories
    const distractors = [...sameCat.slice(0, 2), ...otherCat.slice(0, 2)]
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);

    const options = [
      ...distractors.map((w) => ({ text: w.meaningTh, word: w.word })),
      { text: qWord.meaningTh, word: qWord.word },
    ].sort(() => Math.random() - 0.5);

    return {
      id: qWord._id!.toString(),
      word: qWord.word,
      pos: qWord.pos,
      meaningTh: qWord.meaningTh,
      meaningEn: qWord.meaningEn,
      category: qWord.category,
      difficulty: qWord.difficulty,
      confusedWith: qWord.confusedWith,
      example: qWord.examples[0] ?? "",
      options: options.map((o) => o.text),
      correctAnswer: qWord.meaningTh,
    };
  });

  return NextResponse.json({
    questions,
    total: allWords.length,
    showing: questions.length,
  });
}

// POST /api/quiz — submit quiz answers
export async function POST(request: Request) {
  const body = await request.json();
  const { userId = "anonymous", answers } = body as {
    userId?: string;
    answers: { word: string; selected: string; correct: boolean; category: string }[];
  };

  if (!answers || !Array.isArray(answers)) {
    return NextResponse.json({ error: "answers array required" }, { status: 400 });
  }

  const db = await getDb();
  const wordStats = db.collection<UserWordStat>("user_word_stats");
  const categoryStats = db.collection<UserCategoryStat>("user_category_stats");

  const wordOps = answers.map((a) => ({
    updateOne: {
      filter: { userId, canonicalWord: a.word.toLowerCase().trim() },
      update: {
        $inc: {
          correctCount: a.correct ? 1 : 0,
          wrongCount: a.correct ? 0 : 1,
        },
        $set: { lastReviewedAt: new Date() },
        $setOnInsert: { userId, canonicalWord: a.word.toLowerCase().trim(), masteryScore: 0 },
      },
      upsert: true,
    },
  }));

  await wordStats.bulkWrite(wordOps);

  // Recalculate mastery
  for (const a of answers) {
    const stat = await wordStats.findOne({ userId, canonicalWord: a.word.toLowerCase().trim() });
    if (stat) {
      const total = stat.correctCount + stat.wrongCount;
      const mastery = total > 0 ? Math.round((stat.correctCount / total) * 100) : 0;
      await wordStats.updateOne({ _id: stat._id }, { $set: { masteryScore: mastery } });
    }
  }

  // Update category stats
  const categoryMap = new Map<string, { correct: number; total: number }>();
  for (const a of answers) {
    const cur = categoryMap.get(a.category) ?? { correct: 0, total: 0 };
    cur.total++;
    if (a.correct) cur.correct++;
    categoryMap.set(a.category, cur);
  }

  for (const [category, { correct, total }] of categoryMap) {
    await categoryStats.updateOne(
      { userId, category },
      {
        $inc: { totalAttempts: total, totalCorrect: correct },
        $setOnInsert: { userId, category, weaknessScore: 0 },
      },
      { upsert: true }
    );

    const catStat = await categoryStats.findOne({ userId, category });
    if (catStat) {
      const weakness =
        catStat.totalAttempts > 0
          ? Math.round(((catStat.totalAttempts - catStat.totalCorrect) / catStat.totalAttempts) * 100)
          : 0;
      await categoryStats.updateOne({ _id: catStat._id }, { $set: { weaknessScore: weakness } });
    }
  }

  const totalCorrect = answers.filter((a) => a.correct).length;
  return NextResponse.json({
    score: totalCorrect,
    total: answers.length,
    accuracy: Math.round((totalCorrect / answers.length) * 100),
  });
}
