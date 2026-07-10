import { NextResponse } from "next/server";
import { getDb } from "@repo/db";
import type { UserWordStat, VocabWord } from "@repo/db";

export type ConfusionCluster = {
  id: string;
  label: string;
  words: {
    word: string;
    meaningTh: string;
    meaningEn?: string;
    pos: string;
    category: string;
    wrongCount: number;
    examples: string[];
  }[];
  totalWrong: number;
  severity: "high" | "medium" | "low";
};

// GET /api/clusters?userId=anonymous
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId") ?? "anonymous";

  const db = await getDb();
  const wordStats = db.collection<UserWordStat>("user_word_stats");
  const vocab = db.collection<VocabWord>("vocab_words");

  // Get words the user has gotten wrong
  const wrongStats = await wordStats
    .find({ userId, wrongCount: { $gt: 0 } })
    .sort({ wrongCount: -1 })
    .toArray();

  if (wrongStats.length === 0) {
    return NextResponse.json({ clusters: [], message: "No mistakes yet!" });
  }

  // Get vocab details for wrong words
  const wrongWords = await Promise.all(
    wrongStats.map(async (stat) => {
      const v = await vocab.findOne(
        { canonicalWord: stat.canonicalWord },
        { projection: { embedding: 0 } }
      );
      return v ? { ...v, wrongCount: stat.wrongCount } : null;
    })
  );
  const validWords = wrongWords.filter(Boolean) as (VocabWord & { wrongCount: number })[];

  if (validWords.length === 0) {
    return NextResponse.json({ clusters: [], message: "No data yet" });
  }

  // Build clusters using confusedWith relationships + vector search
  const clustered = new Set<string>();
  const clusters: ConfusionCluster[] = [];

  for (const word of validWords) {
    if (clustered.has(word.canonicalWord)) continue;

    // Find cluster: the word + its confusedWith words + vector-similar wrong words
    const clusterWords = new Set<string>([word.canonicalWord]);

    // Add confusedWith
    for (const cw of word.confusedWith) {
      clusterWords.add(cw.toLowerCase().trim());
    }

    // For each confusedWith, also get THEIR confusedWith (2nd degree)
    for (const cw of [...clusterWords]) {
      const related = await vocab.findOne({ canonicalWord: cw });
      if (related) {
        for (const cw2 of related.confusedWith) {
          clusterWords.add(cw2.toLowerCase().trim());
        }
      }
    }

    // Also try vector search for semantically related wrong words
    if (word.embedding && word.embedding.length > 0) {
      try {
        const vectorResults = await vocab
          .aggregate([
            {
              $vectorSearch: {
                index: "vocab_vector_index",
                path: "embedding",
                queryVector: word.embedding,
                numCandidates: 20,
                limit: 6,
              },
            },
            { $project: { canonicalWord: 1, _id: 0 } },
          ])
          .toArray();

        for (const vr of vectorResults) {
          // Only add if user also got this word wrong
          const alsoWrong = validWords.find(
            (w) => w.canonicalWord === (vr as { canonicalWord: string }).canonicalWord
          );
          if (alsoWrong) {
            clusterWords.add((vr as { canonicalWord: string }).canonicalWord);
          }
        }
      } catch {
        // Vector search may fail, continue without it
      }
    }

    // Build cluster with full word data
    const clusterWordData = await Promise.all(
      [...clusterWords].map(async (cw) => {
        const v = await vocab.findOne(
          { canonicalWord: cw },
          { projection: { embedding: 0 } }
        );
        const stat = wrongStats.find((s) => s.canonicalWord === cw);
        if (!v) return null;
        return {
          word: v.word,
          meaningTh: v.meaningTh,
          meaningEn: v.meaningEn,
          pos: v.pos,
          category: v.category,
          wrongCount: stat?.wrongCount ?? 0,
          examples: v.examples,
        };
      })
    );

    const validClusterWords = clusterWordData.filter(Boolean) as ConfusionCluster["words"];

    // Only create cluster if 2+ words
    if (validClusterWords.length >= 2) {
      // Mark all as clustered
      for (const cw of clusterWords) {
        clustered.add(cw);
      }

      const totalWrong = validClusterWords.reduce((s, w) => s + w.wrongCount, 0);

      // Generate label from the most common category/subconcept
      const categories = validClusterWords.map((w) => w.category);
      const topCategory = categories
        .sort((a, b) => categories.filter((c) => c === b).length - categories.filter((c) => c === a).length)[0]
        .replace(/_/g, " ");

      const label =
        validClusterWords.length <= 3
          ? validClusterWords.map((w) => w.word).join(" vs ")
          : `${topCategory} — ${validClusterWords.length} confused words`;

      clusters.push({
        id: [...clusterWords].sort().join("-"),
        label,
        words: validClusterWords.sort((a, b) => b.wrongCount - a.wrongCount),
        totalWrong,
        severity: totalWrong >= 6 ? "high" : totalWrong >= 3 ? "medium" : "low",
      });
    }
  }

  // Sort clusters by severity
  clusters.sort((a, b) => b.totalWrong - a.totalWrong);

  return NextResponse.json({ clusters });
}
