import { NextResponse } from "next/server";
import { getDb } from "@repo/db";

// GET /api/vocab — list vocab words with optional category filter
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");

  const db = await getDb();
  const collection = db.collection("vocab_words");

  const filter = category ? { category } : {};
  const words = await collection
    .find(filter, { projection: { embedding: 0 } })
    .toArray();

  return NextResponse.json({ words, total: words.length });
}
