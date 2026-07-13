import { NextResponse } from "next/server";
import { getDb } from "@repo/db";
import type { VocabWord } from "@repo/db";
import { generateEmbedding } from "@repo/ai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const LLM_MODEL = "gemini-flash-latest";

async function generateText(prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${LLM_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 4000 },
    }),
  });

  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
  const json = await res.json();
  return json.candidates[0].content.parts[0].text;
}

// Vector search for related words
async function findRelatedWords(words: string[], limit: number = 5): Promise<VocabWord[]> {
  const db = await getDb();
  const vocab = db.collection<VocabWord>("vocab_words");

  // Build query text from all wrong words
  const queryText = words.join(" ");

  try {
    const queryVector = await generateEmbedding(queryText);

    const results = await vocab
      .aggregate([
        {
          $vectorSearch: {
            index: "vocab_vector_index",
            path: "embedding",
            queryVector,
            numCandidates: limit * 5,
            limit: limit + words.length, // extra to filter out input words
          },
        },
        { $project: { embedding: 0 } },
      ])
      .toArray();

    // Filter out the input words themselves
    const inputSet = new Set(words.map((w) => w.toLowerCase()));
    return (results as unknown as VocabWord[]).filter(
      (r) => !inputSet.has(r.canonicalWord)
    ).slice(0, limit);
  } catch {
    // Fallback: get words from same categories via confusedWith
    const inputWords = await vocab
      .find({ canonicalWord: { $in: words.map((w) => w.toLowerCase()) } }, { projection: { embedding: 0 } })
      .toArray();

    const relatedNames = new Set<string>();
    for (const w of inputWords) {
      for (const cw of w.confusedWith) relatedNames.add(cw.toLowerCase());
    }

    // Remove input words
    for (const w of words) relatedNames.delete(w.toLowerCase());

    const related = await vocab
      .find({ canonicalWord: { $in: [...relatedNames] } }, { projection: { embedding: 0 } })
      .limit(limit)
      .toArray();

    return related;
  }
}

// POST /api/lessons
// Body: { words: [{ word, meaningTh, pos, examples }] }
export async function POST(request: Request) {
  const { words } = await request.json();

  if (!words || !Array.isArray(words) || words.length === 0) {
    return NextResponse.json({ error: "At least 1 word required" }, { status: 400 });
  }

  // --- RAG: Retrieve related words via vector search ---
  const wordNames = words.map((w: { word: string }) => w.word);
  const relatedWords = await findRelatedWords(wordNames);

  const relatedContext = relatedWords.length > 0
    ? `\n\nRelated words from the vocab bank (use these to enrich your explanation):\n${relatedWords
        .map((r) => `- ${r.word} (${r.pos}): ${r.meaningTh}${r.meaningEn ? ` — ${r.meaningEn}` : ""}`)
        .join("\n")}`
    : "";

  // --- Build word list ---
  const wordList = words
    .map(
      (w: { word: string; meaningTh: string; meaningEn?: string; pos: string; examples?: string[] }) =>
        `- ${w.word} (${w.pos}): ${w.meaningTh}${w.meaningEn ? ` — ${w.meaningEn}` : ""}${w.examples?.[0] ? `\n  Example: "${w.examples[0]}"` : ""}`
    )
    .join("\n");

  const isSingleWord = words.length === 1;

  // --- Generate prompt with RAG context ---
  const prompt = isSingleWord
    ? `You are a TOEIC vocabulary tutor helping a Thai student learn this word:

${wordList}
${relatedContext}

Create a clear mini-lesson in this EXACT format:

## ความหมาย
(Explain the word clearly in Thai — what it means, when it's used in TOEIC context)

## คำที่มักสับสน
(2-3 similar words from the related words — ONE line each: **word** = meaning — how it differs)

## จำง่ายๆ
(One short memory trick in Thai. Max 2 sentences.)

## ตัวอย่าง TOEIC
(2 short TOEIC-style sentences. Bold the key word.)

CRITICAL Rules:
- MUST include ALL 4 sections — do NOT skip any
- Keep TOTAL response under 250 words
- Use Thai for explanations, English for examples`
    : `You are a TOEIC vocabulary tutor helping a Thai student who keeps confusing these words:

${wordList}
${relatedContext}

Create a clear mini-lesson in this EXACT format:

## ภาพรวม
(1-2 sentences explaining what connects these words and why they're confusing. Reference related words if relevant.)

## เปรียบเทียบ
(For EACH word: ONE line only → **word** = Thai meaning — when to use. Keep each line under 20 words.)

## จำง่ายๆ
(One short memory trick in Thai. Max 2-3 sentences.)

## ตัวอย่าง TOEIC
(2 short TOEIC-style sentences. Bold the key word.)

CRITICAL Rules:
- MUST include ALL 4 sections above — do NOT skip any
- Keep TOTAL response under 300 words
- Use Thai for explanations, English for examples
- One line per word in เปรียบเทียบ — no extra paragraphs`;

  try {
    const lesson = await generateText(prompt);
    return NextResponse.json({
      lesson,
      relatedWords: relatedWords.map((r) => ({ word: r.word, meaningTh: r.meaningTh, category: r.category })),
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to generate lesson", lesson: null },
      { status: 500 }
    );
  }
}
