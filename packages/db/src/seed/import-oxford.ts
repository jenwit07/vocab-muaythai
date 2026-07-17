/**
 * Oxford 3000 → DB importer (batch mode)
 *
 * Usage:
 *   pnpm oxford [--level B1,B2] [--dry-run] [--limit 50] [--batch 10]
 */

import dotenv from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../../.env") });

import { getDb, getClient } from "../client.js";
import type { VocabWord } from "../models/vocab.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GEN_MODEL = "gemini-3.1-pro-preview";
const EMBED_MODEL = "gemini-embedding-001";

// --- CLI args ---
const args = process.argv.slice(2);
const levels = (args.find(a => a.startsWith("--level="))?.split("=")[1] ?? "B1,B2").split(",");
const dryRun = args.includes("--dry-run");
const limit = Number(args.find(a => a.startsWith("--limit="))?.split("=")[1] ?? 999999);
const BATCH_SIZE = Number(args.find(a => a.startsWith("--batch="))?.split("=")[1] ?? 10);

type OxfordEntry = { word: string; pos: string; level: string };

const CATEGORIES = [
  "business_finance", "office_workplace", "jobs_hiring", "travel",
  "customer_service", "sales_marketing", "shipping_delivery",
  "restaurant_hotel", "office_equipment", "common_business_verbs", "general",
] as const;

// --- Generate vocab for a BATCH of words in one API call ---
async function generateBatch(
  entries: OxfordEntry[]
): Promise<Map<string, Omit<VocabWord, "_id" | "canonicalWord" | "embedding" | "createdAt"> | null>> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEN_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const wordList = entries.map((e, i) =>
    `${i + 1}. "${e.word}" (${e.pos}, Oxford level ${e.level})`
  ).join("\n");

  const prompt = `You are a TOEIC vocabulary expert. Generate Thai dictionary entries for these ${entries.length} English words.

Words:
${wordList}

Return a JSON array with exactly ${entries.length} objects in the SAME ORDER as the words above.
Each object must have these fields:
{
  "word": "the English word",
  "meaningTh": "คำแปลภาษาไทยที่ถูกต้อง เป็นธรรมชาติ สั้นกระชับ (1-6 คำ)",
  "meaningEn": "concise English definition under 15 words",
  "category": "one of: business_finance|office_workplace|jobs_hiring|travel|customer_service|sales_marketing|shipping_delivery|restaurant_hotel|office_equipment|common_business_verbs|general",
  "subCategory": "2-3 word sub-topic",
  "confusedWith": ["similar_word1", "similar_word2"],
  "collocations": ["common phrase1", "common phrase2", "common phrase3"],
  "examples": ["TOEIC sentence using the word.", "Another business sentence."],
  "difficulty": "easy|medium|hard"
}

Rules:
- meaningTh must be natural Thai, not literal translation
- A1/A2 words → "easy", B1 → "medium", B2 → "hard"
- Return ONLY the JSON array, no other text`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
      }),
    });

    if (!res.ok) {
      console.error(`  HTTP ${res.status}`);
      return new Map(entries.map(e => [e.word, null]));
    }

    const json = await res.json();
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // Extract JSON array
    let jsonStr = text.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();
    const start = jsonStr.indexOf("[");
    const end = jsonStr.lastIndexOf("]");
    if (start === -1 || end === -1) {
      console.error(`  No JSON array found`);
      return new Map(entries.map(e => [e.word, null]));
    }
    jsonStr = jsonStr.slice(start, end + 1);

    const items = JSON.parse(jsonStr);
    const result = new Map<string, Omit<VocabWord, "_id" | "canonicalWord" | "embedding" | "createdAt"> | null>();

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const item = items[i];

      if (!item || !item.meaningTh) {
        result.set(entry.word, null);
        continue;
      }

      const rawCat = (item.category ?? "").toLowerCase().replace(/[\s&]+/g, "_");
      const matchedCat = CATEGORIES.find(c => c === rawCat || rawCat.startsWith(c.split("_")[0])) ?? "general";

      result.set(entry.word, {
        word: entry.word,
        pos: entry.pos,
        meaningTh: item.meaningTh,
        meaningEn: item.meaningEn ?? "",
        category: matchedCat,
        subCategory: item.subCategory ?? "",
        confusedWith: Array.isArray(item.confusedWith) ? item.confusedWith.slice(0, 3) : [],
        collocations: Array.isArray(item.collocations) ? item.collocations.slice(0, 4) : [],
        examples: Array.isArray(item.examples) ? item.examples.slice(0, 2) : [],
        difficulty: ["easy", "medium", "hard"].includes(item.difficulty) ? item.difficulty : "medium",
        level: entry.level as VocabWord["level"],
      });
    }

    return result;
  } catch (e) {
    console.error(`  Batch parse error:`, (e as Error).message.slice(0, 80));
    return new Map(entries.map(e => [e.word, null]));
  }
}

// --- Embedding ---
async function generateEmbedding(text: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: `models/${EMBED_MODEL}`, content: { parts: [{ text }] } }),
  });
  if (!res.ok) throw new Error(`Embed ${res.status}`);
  return (await res.json()).embedding.values;
}

async function loadOxfordWords(): Promise<OxfordEntry[]> {
  const jsonPath = resolve(__dirname, "./oxford-3000.json");
  if (!existsSync(jsonPath)) {
    console.error("oxford-3000.json not found! Run pnpm parse-pdf first.");
    process.exit(1);
  }
  return JSON.parse(await readFile(jsonPath, "utf-8"));
}

async function main() {
  console.log(`\n🚀 Oxford 3000 importer (batch=${BATCH_SIZE})`);
  console.log(`   Levels: ${levels.join(", ")}`);
  console.log(`   Model: ${GEN_MODEL}`);
  console.log(`   Dry run: ${dryRun}\n`);

  const db = await getDb();
  const vocab = db.collection<VocabWord>("vocab_words");

  const existing = new Set(await vocab.distinct("canonicalWord") as string[]);
  console.log(`📦 Existing words in DB: ${existing.size}`);

  const oxfordWords = await loadOxfordWords();
  console.log(`📖 Oxford 3000 total: ${oxfordWords.length}`);

  const toProcess = oxfordWords
    .filter(w => levels.includes(w.level))
    .filter(w => !existing.has(w.word.toLowerCase().trim()))
    .slice(0, limit);

  console.log(`✅ To process: ${toProcess.length} words (${Math.ceil(toProcess.length / BATCH_SIZE)} batches)\n`);

  if (dryRun) {
    toProcess.slice(0, 10).forEach(w => console.log(`  ${w.word} (${w.pos}) [${w.level}]`));
    process.exit(0);
  }

  const batches = Math.ceil(toProcess.length / BATCH_SIZE);
  const estimatedInputTokens = batches * 400;
  const estimatedOutputTokens = toProcess.length * 150;
  console.log(`💰 Estimated cost:`);
  console.log(`   Input:  ${estimatedInputTokens.toLocaleString()} tokens ≈ $${(estimatedInputTokens * 1.25 / 1e6).toFixed(3)}`);
  console.log(`   Output: ${estimatedOutputTokens.toLocaleString()} tokens ≈ $${(estimatedOutputTokens * 10 / 1e6).toFixed(3)}`);
  console.log(`   Total:  ≈ $${((estimatedInputTokens * 1.25 + estimatedOutputTokens * 10) / 1e6).toFixed(2)}\n`);

  let inserted = 0, failed = 0, batchFailed = 0;
  const startTime = Date.now();

  for (let b = 0; b < batches; b++) {
    const batch = toProcess.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
    const batchNum = `[Batch ${b + 1}/${batches}]`;
    const wordNames = batch.map(e => e.word).join(", ");

    process.stdout.write(`${batchNum} ${wordNames.slice(0, 60)}... `);

    const results = await generateBatch(batch);

    // Collect successful results
    const successItems: Array<{ entry: OxfordEntry; data: Omit<VocabWord, "_id" | "canonicalWord" | "embedding" | "createdAt"> }> = [];
    for (const entry of batch) {
      const data = results.get(entry.word);
      if (!data) { failed++; continue; }
      successItems.push({ entry, data });
    }

    // Skip embeddings during import — run pnpm embeddings separately after
    // Bulk upsert with empty embeddings (filled later)
    const upsertOps = successItems.map(({ entry, data }) => ({
      updateOne: {
        filter: { canonicalWord: entry.word.toLowerCase().trim() },
        update: { $setOnInsert: { ...data, canonicalWord: entry.word.toLowerCase().trim(), embedding: [], createdAt: new Date() } },
        upsert: true,
      },
    }));

    let batchSuccess = successItems.length;

    if (upsertOps.length > 0) {
      const result = await vocab.bulkWrite(upsertOps);
      inserted += result.upsertedCount;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const total = inserted + failed;
    const eta = total > 0 ? Math.round((toProcess.length - total) * (Number(elapsed) / total)) : 0;
    console.log(`✅ ${batchSuccess}/${batch.length} | Total: ${inserted} inserted | ETA: ${eta}s`);

    // Small delay between batches to avoid rate limits
    if (b < batches - 1) await new Promise(r => setTimeout(r, 800));
  }

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n✅ Done in ${elapsed} minutes!`);
  console.log(`   Inserted: ${inserted}`);
  console.log(`   Failed:   ${failed}`);
  console.log(`   Total in DB: ${await vocab.countDocuments()}`);

  const client = await getClient();
  await client.close();
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
