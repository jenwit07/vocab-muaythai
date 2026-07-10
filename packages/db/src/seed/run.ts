import { readFile } from "node:fs/promises";
import { getDb, getClient } from "../client.js";
import type { VocabWord } from "../models/vocab.js";

type VocabInput = Omit<VocabWord, "_id" | "canonicalWord" | "createdAt" | "embedding">;

function normalize(word: string): string {
  return word.trim().toLowerCase();
}

async function seed() {
  const db = await getDb();
  const collection = db.collection<VocabWord>("vocab_words");

  // Ensure unique index on canonicalWord
  await collection.createIndex({ canonicalWord: 1 }, { unique: true });
  // Index for category queries
  await collection.createIndex({ category: 1 });

  // Load vocab data from all seed files
  const files = ["./vocab-data.json", "./vocab-hard.json"];
  const words: VocabInput[] = [];
  for (const file of files) {
    try {
      const raw = await readFile(new URL(file, import.meta.url), "utf-8");
      const parsed: VocabInput[] = JSON.parse(raw);
      words.push(...parsed);
      console.log(`  Loaded ${parsed.length} words from ${file}`);
    } catch {
      console.log(`  Skipped ${file} (not found)`);
    }
  }

  // Bulk upsert — skip existing words
  const ops = words.map((w) => ({
    updateOne: {
      filter: { canonicalWord: normalize(w.word) },
      update: {
        $setOnInsert: {
          ...w,
          canonicalWord: normalize(w.word),
          embedding: [],
          createdAt: new Date(),
        },
      },
      upsert: true,
    },
  }));

  const result = await collection.bulkWrite(ops);

  console.log(`Seed complete:`);
  console.log(`  Inserted: ${result.upsertedCount}`);
  console.log(`  Matched (skipped): ${result.matchedCount}`);
  console.log(`  Total vocab in DB: ${await collection.countDocuments()}`);

  const client = await getClient();
  await client.close();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
