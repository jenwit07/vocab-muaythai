import type { Db } from "mongodb";
import { findRelatedWords } from "./vector-search";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const LLM_MODEL = "gemini-flash-latest";

export type ExplainResult = {
  word: string;
  confusedWith: string;
  relatedWords: string[];
  explanation: string;
};

async function generateText(prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${LLM_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini LLM API error: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  return json.candidates[0].content.parts[0].text;
}

export async function explainConfusedWords(
  db: Db,
  word: string,
  confusedWith: string
): Promise<ExplainResult> {
  // 1. Find semantically related words via vector search
  const related = await findRelatedWords(db, `${word} ${confusedWith}`, 5);
  const relatedWords = related.map((r) => r.word);

  // 2. Build context from related words
  const context = related
    .map((r) => `${r.word} (${r.meaningTh}) [${r.category}]`)
    .join("\n");

  // 3. Generate explanation via Gemini
  const prompt = `You are a TOEIC vocabulary tutor. A student confused "${word}" with "${confusedWith}".

Related words from the vocab bank:
${context}

Explain the difference between "${word}" and "${confusedWith}" clearly and concisely.
Include:
- Thai meaning of each word
- When to use each word
- A simple memory trick
- One TOEIC-style example sentence for each

Reply in a mix of Thai and English (Thai for explanations, English for examples).`;

  const explanation = await generateText(prompt);

  return {
    word,
    confusedWith,
    relatedWords,
    explanation,
  };
}
