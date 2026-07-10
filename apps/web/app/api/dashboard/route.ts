import { NextResponse } from "next/server";
import { getDb } from "@repo/db";
import type { UserWordStat, UserCategoryStat, VocabWord } from "@repo/db";
import { CATEGORIES } from "@repo/db";

// GET /api/dashboard?userId=anonymous
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId") ?? "anonymous";

  const db = await getDb();
  const wordStats = db.collection<UserWordStat>("user_word_stats");
  const categoryStats = db.collection<UserCategoryStat>("user_category_stats");
  const vocab = db.collection<VocabWord>("vocab_words");

  // Get all category stats for this user
  const catStats = await categoryStats.find({ userId }).toArray();

  // Get total vocab count per category
  const vocabCounts = await vocab
    .aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ])
    .toArray();
  const vocabCountMap = new Map(vocabCounts.map((v) => [v._id, v.count]));

  // Build category breakdown
  const categories = CATEGORIES.map((cat) => {
    const stat = catStats.find((s) => s.category === cat);
    const totalVocab = vocabCountMap.get(cat) ?? 0;

    if (!stat) {
      return {
        category: cat,
        label: cat.replace(/_/g, " "),
        totalVocab,
        attempted: 0,
        correct: 0,
        accuracy: null as number | null,
        weaknessScore: 0,
        status: "not_started" as const,
      };
    }

    const accuracy =
      stat.totalAttempts > 0
        ? Math.round((stat.totalCorrect / stat.totalAttempts) * 100)
        : null;

    return {
      category: cat,
      label: cat.replace(/_/g, " "),
      totalVocab,
      attempted: stat.totalAttempts,
      correct: stat.totalCorrect,
      accuracy,
      weaknessScore: stat.weaknessScore,
      status: (accuracy === null
        ? "not_started"
        : accuracy >= 80
          ? "strong"
          : accuracy >= 50
            ? "needs_work"
            : "weak") as "not_started" | "strong" | "needs_work" | "weak",
    };
  });

  // Sort by weakness (worst first), then not_started
  const suggestions = [...categories].sort((a, b) => {
    // Weak/needs_work first, then not_started, then strong
    const order = { weak: 0, needs_work: 1, not_started: 2, strong: 3 };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    // Within same status, sort by weakness score desc
    return b.weaknessScore - a.weaknessScore;
  });

  // Get top weak words across all categories
  const allWordStats = await wordStats
    .find({ userId, wrongCount: { $gt: 0 } })
    .sort({ wrongCount: -1 })
    .limit(10)
    .toArray();

  const topWeakWords = await Promise.all(
    allWordStats.map(async (stat) => {
      const vocabWord = await vocab.findOne(
        { canonicalWord: stat.canonicalWord },
        { projection: { embedding: 0 } }
      );
      return vocabWord
        ? {
            word: vocabWord.word,
            meaningTh: vocabWord.meaningTh,
            category: vocabWord.category,
            wrongCount: stat.wrongCount,
            correctCount: stat.correctCount,
            masteryScore: stat.masteryScore,
          }
        : null;
    })
  );

  // Overall stats
  const totalAttempts = catStats.reduce((s, c) => s + c.totalAttempts, 0);
  const totalCorrect = catStats.reduce((s, c) => s + c.totalCorrect, 0);
  const overallAccuracy =
    totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : null;
  const categoriesAttempted = catStats.length;

  return NextResponse.json({
    overview: {
      totalAttempts,
      totalCorrect,
      overallAccuracy,
      categoriesAttempted,
      totalCategories: CATEGORIES.length,
      totalVocab: Array.from(vocabCountMap.values()).reduce((s, v) => s + v, 0),
    },
    categories,
    suggestions: suggestions.slice(0, 5),
    topWeakWords: topWeakWords.filter(Boolean),
  });
}
