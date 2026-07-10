import { NextResponse } from "next/server";
import { getDb } from "@repo/db";
import type { UserWordStat, VocabWord, UserCategoryStat } from "@repo/db";

// GET /api/review?userId=anonymous&limit=10
// Returns weak words sorted by priority score
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId") ?? "anonymous";
  const limit = Math.min(Number(searchParams.get("limit") ?? 10), 30);

  const db = await getDb();
  const wordStats = db.collection<UserWordStat>("user_word_stats");
  const categoryStats = db.collection<UserCategoryStat>("user_category_stats");
  const vocab = db.collection<VocabWord>("vocab_words");

  // Get user's word stats
  const stats = await wordStats.find({ userId }).toArray();

  if (stats.length === 0) {
    return NextResponse.json({ words: [], message: "No quiz history yet. Take a quiz first!" });
  }

  // Get category weakness map
  const catStats = await categoryStats.find({ userId }).toArray();
  const catWeaknessMap = new Map(catStats.map((c) => [c.category, c.weaknessScore]));

  // Calculate priority score for each word
  const scored = await Promise.all(
    stats.map(async (stat) => {
      const vocabWord = await vocab.findOne(
        { canonicalWord: stat.canonicalWord },
        { projection: { embedding: 0 } }
      );
      if (!vocabWord) return null;

      const daysSinceReview = stat.lastReviewedAt
        ? (Date.now() - new Date(stat.lastReviewedAt).getTime()) / (1000 * 60 * 60 * 24)
        : 30;

      const categoryWeakness = catWeaknessMap.get(vocabWord.category) ?? 0;
      const confusedWordPenalty = vocabWord.confusedWith.length > 0 && stat.wrongCount > 0 ? 10 : 0;

      const priorityScore =
        stat.wrongCount * 4 +
        categoryWeakness * 0.3 +
        confusedWordPenalty +
        daysSinceReview -
        stat.masteryScore;

      return {
        word: vocabWord.word,
        meaningTh: vocabWord.meaningTh,
        meaningEn: vocabWord.meaningEn,
        category: vocabWord.category,
        confusedWith: vocabWord.confusedWith,
        wrongCount: stat.wrongCount,
        correctCount: stat.correctCount,
        masteryScore: stat.masteryScore,
        daysSinceReview: Math.round(daysSinceReview),
        priorityScore: Math.round(priorityScore * 10) / 10,
      };
    })
  );

  const words = scored
    .filter((w): w is NonNullable<typeof w> => w !== null)
    .filter((w) => w.masteryScore < 100)
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, limit);

  return NextResponse.json({ words, total: words.length });
}
