import type { Db } from "mongodb";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 3072;

export async function generateEmbedding(text: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text }] },
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini Embedding API error: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  return json.embedding.values;
}

export function generateVocabEmbeddingText(word: {
  word: string;
  meaningEn?: string;
  category: string;
  examples: string[];
}): string {
  const parts = [
    word.word,
    word.meaningEn ?? "",
    `category: ${word.category}`,
    ...word.examples.slice(0, 2),
  ];
  return parts.filter(Boolean).join(". ");
}

export async function createVectorSearchIndex(db: Db) {
  const collection = db.collection("vocab_words");

  await collection.createSearchIndex({
    name: "vocab_vector_index",
    type: "vectorSearch",
    definition: {
      fields: [
        {
          type: "vector",
          path: "embedding",
          numDimensions: EMBEDDING_DIMENSIONS,
          similarity: "cosine",
        },
      ],
    },
  });
}
