import dotenv from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../../.env") });

import { getDb, getClient } from "../client.js";

async function main() {
  const db = await getDb();
  const vocab = db.collection("vocab_words");

  // 1. Regular indexes
  console.log("Creating regular indexes...");
  await vocab.createIndex({ canonicalWord: 1 }, { unique: true });
  await vocab.createIndex({ category: 1 });
  console.log("  Done");

  // 2. Atlas Vector Search index
  console.log("Creating vector search index...");
  try {
    await vocab.createSearchIndex({
      name: "vocab_vector_index",
      type: "vectorSearch",
      definition: {
        fields: [
          {
            type: "vector",
            path: "embedding",
            numDimensions: 3072,
            similarity: "cosine",
          },
          {
            type: "filter",
            path: "category",
          },
        ],
      },
    });
    console.log("  Vector search index created!");
  } catch (err: any) {
    if (err.message?.includes("already exists")) {
      console.log("  Vector search index already exists, skipping.");
    } else {
      throw err;
    }
  }

  // 3. User stats indexes
  const userWordStats = db.collection("user_word_stats");
  const userCategoryStats = db.collection("user_category_stats");

  console.log("Creating user stats indexes...");
  await userWordStats.createIndex({ userId: 1, canonicalWord: 1 }, { unique: true });
  await userWordStats.createIndex({ userId: 1, masteryScore: 1 });
  await userCategoryStats.createIndex({ userId: 1, category: 1 }, { unique: true });
  console.log("  Done");

  console.log("\nAll indexes created!");

  const client = await getClient();
  await client.close();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
