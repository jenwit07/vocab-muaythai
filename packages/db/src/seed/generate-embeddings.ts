import dotenv from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../../.env") });
import { getDb, getClient } from "../client.js";
import type { VocabWord } from "../models/vocab.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("Missing GEMINI_API_KEY in .env");
  process.exit(1);
}

const EMBEDDING_MODEL = "gemini-embedding-001";

async function generateEmbedding(text: string): Promise<number[]> {
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
    throw new Error(`Gemini API error: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  return json.embedding.values;
}

function buildEmbeddingText(word: VocabWord): string {
  return [
    word.word,
    word.meaningEn ?? "",
    `category: ${word.category}`,
    ...word.examples.slice(0, 2),
  ]
    .filter(Boolean)
    .join(". ");
}

async function main() {
  const db = await getDb();
  const collection = db.collection<VocabWord>("vocab_words");

  // Find words with empty embeddings
  const words = await collection
    .find({ $or: [{ embedding: { $size: 0 } }, { embedding: { $exists: false } }] })
    .toArray();

  console.log(`Found ${words.length} words without embeddings`);

  for (const word of words) {
    const text = buildEmbeddingText(word);
    console.log(`  Generating embedding for "${word.word}"...`);

    const embedding = await generateEmbedding(text);

    await collection.updateOne(
      { _id: word._id },
      { $set: { embedding } }
    );

    console.log(`    Done (${embedding.length} dimensions)`);
  }

  console.log(`\nAll embeddings generated!`);

  const client = await getClient();
  await client.close();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
