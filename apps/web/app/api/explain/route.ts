import { NextResponse } from "next/server";
import { getDb } from "@repo/db";
import { explainConfusedWords } from "@repo/ai";

// POST /api/explain — RAG-powered explanation for confused words
// Body: { word: string, confusedWith: string }
export async function POST(request: Request) {
  const { word, confusedWith } = await request.json();

  if (!word || !confusedWith) {
    return NextResponse.json(
      { error: "word and confusedWith are required" },
      { status: 400 }
    );
  }

  const db = await getDb();
  const result = await explainConfusedWords(db, word, confusedWith);

  return NextResponse.json(result);
}
