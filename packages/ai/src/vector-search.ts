import type { Db } from "mongodb";
import { generateEmbedding } from "./embeddings";

export type VectorSearchResult = {
  word: string;
  meaningTh: string;
  category: string;
  score: number;
};

export async function findRelatedWords(
  db: Db,
  queryText: string,
  limit = 5
): Promise<VectorSearchResult[]> {
  const queryVector = await generateEmbedding(queryText);
  const collection = db.collection("vocab_words");

  const results = await collection
    .aggregate([
      {
        $vectorSearch: {
          index: "vocab_vector_index",
          path: "embedding",
          queryVector,
          numCandidates: limit * 10,
          limit,
        },
      },
      {
        $project: {
          word: 1,
          meaningTh: 1,
          category: 1,
          score: { $meta: "vectorSearchScore" },
        },
      },
    ])
    .toArray();

  return results as unknown as VectorSearchResult[];
}
