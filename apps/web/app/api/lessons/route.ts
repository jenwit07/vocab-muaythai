import { NextResponse } from "next/server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const LLM_MODEL = "gemini-flash-latest";

async function generateText(prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${LLM_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1500,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini API error: ${res.status}`);
  }

  const json = await res.json();
  return json.candidates[0].content.parts[0].text;
}

// POST /api/lessons
// Body: { words: [{ word, meaningTh, meaningEn, pos, examples }] }
export async function POST(request: Request) {
  const { words } = await request.json();

  if (!words || !Array.isArray(words) || words.length < 2) {
    return NextResponse.json({ error: "At least 2 words required" }, { status: 400 });
  }

  const wordList = words
    .map(
      (w: { word: string; meaningTh: string; meaningEn?: string; pos: string; examples?: string[] }) =>
        `- ${w.word} (${w.pos}): ${w.meaningTh}${w.meaningEn ? ` — ${w.meaningEn}` : ""}${w.examples?.[0] ? `\n  Example: "${w.examples[0]}"` : ""}`
    )
    .join("\n");

  const prompt = `You are a TOEIC vocabulary tutor helping a Thai student who keeps confusing these words:

${wordList}

Create a clear mini-lesson in this EXACT format:

## ภาพรวม
(1-2 sentences explaining what connects these words and why they're confusing)

## เปรียบเทียบ
(For each word, write ONE line with format: **word** = Thai meaning — when to use, in simple Thai)

## จำง่ายๆ
(A simple memory trick or mnemonic in Thai that helps distinguish ALL the words at once. Be creative — use wordplay, visual imagery, or a story.)

## ตัวอย่าง TOEIC
(2-3 short TOEIC-style sentences using different words from the group. Bold the key word.)

Rules:
- Keep it SHORT and scannable
- Use Thai for explanations, English for examples
- Don't repeat the word definitions verbatim
- Focus on the DIFFERENCES, not individual definitions
- Make the memory trick actually memorable`;

  try {
    const lesson = await generateText(prompt);
    return NextResponse.json({ lesson });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to generate lesson", lesson: null },
      { status: 500 }
    );
  }
}
