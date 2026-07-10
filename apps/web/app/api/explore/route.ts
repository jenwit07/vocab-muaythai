import { NextResponse } from "next/server";
import { getDb } from "@repo/db";
import type { VocabWord } from "@repo/db";

// Simple PCA-like projection: pick 2 principal axes from embeddings
// Uses power iteration to find top 2 eigenvectors of covariance matrix
function projectTo2D(embeddings: number[][]): { x: number; y: number }[] {
  const n = embeddings.length;
  if (n === 0) return [];
  const dim = embeddings[0].length;

  // Center the data
  const mean = new Array(dim).fill(0);
  for (const e of embeddings) {
    for (let i = 0; i < dim; i++) mean[i] += e[i];
  }
  for (let i = 0; i < dim; i++) mean[i] /= n;

  const centered = embeddings.map((e) => e.map((v, i) => v - mean[i]));

  // Project onto random axes seeded deterministically, then refine with power iteration
  function powerIteration(data: number[][], deflated: number[][] | null, iterations: number): number[] {
    const d = data[0].length;
    // Deterministic seed vector
    const vec = new Array(d).fill(0).map((_, i) => Math.sin(i * 0.1 + (deflated ? 7 : 0)));

    // Normalize
    let norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    for (let i = 0; i < d; i++) vec[i] /= norm;

    const source = deflated ?? data;

    for (let iter = 0; iter < iterations; iter++) {
      // Multiply by covariance: X^T * X * vec
      const projected = source.map((row) => row.reduce((s, v, i) => s + v * vec[i], 0));
      const result = new Array(d).fill(0);
      for (let i = 0; i < source.length; i++) {
        for (let j = 0; j < d; j++) {
          result[j] += source[i][j] * projected[i];
        }
      }
      norm = Math.sqrt(result.reduce((s, v) => s + v * v, 0));
      for (let i = 0; i < d; i++) vec[i] = result[i] / (norm || 1);
    }

    return vec;
  }

  // First principal component
  const pc1 = powerIteration(centered, null, 20);

  // Deflate: remove pc1 component
  const deflated = centered.map((row) => {
    const proj = row.reduce((s, v, i) => s + v * pc1[i], 0);
    return row.map((v, i) => v - proj * pc1[i]);
  });

  // Second principal component
  const pc2 = powerIteration(centered, deflated, 20);

  // Project all points
  const coords = centered.map((row) => ({
    x: row.reduce((s, v, i) => s + v * pc1[i], 0),
    y: row.reduce((s, v, i) => s + v * pc2[i], 0),
  }));

  // Normalize to 0-1 range using percentile to avoid outlier compression
  const xs = coords.map((c) => c.x).sort((a, b) => a - b);
  const ys = coords.map((c) => c.y).sort((a, b) => a - b);
  const p = Math.floor(n * 0.02); // 2nd percentile
  const minX = xs[p] ?? xs[0];
  const maxX = xs[n - 1 - p] ?? xs[n - 1];
  const minY = ys[p] ?? ys[0];
  const maxY = ys[n - 1 - p] ?? ys[n - 1];
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  const normalized = coords.map((c) => ({
    x: Math.max(0, Math.min(1, (c.x - minX) / rangeX)),
    y: Math.max(0, Math.min(1, (c.y - minY) / rangeY)),
  }));

  // Collision resolution — sequential Gauss-Seidel style
  // Process one pair at a time, immediately apply, which converges faster
  const minDist = 0.055;

  for (let iter = 0; iter < 400; iter++) {
    let resolved = true;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = normalized[j].x - normalized[i].x;
        const dy = normalized[j].y - normalized[i].y;
        const distSq = dx * dx + dy * dy;

        if (distSq < minDist * minDist) {
          resolved = false;
          const dist = Math.sqrt(distSq);

          if (dist < 0.001) {
            // Coincident points — separate with golden angle
            const angle = ((i * 2.39996 + j * 1.1) % (Math.PI * 2));
            const half = minDist / 2;
            normalized[i].x -= Math.cos(angle) * half;
            normalized[i].y -= Math.sin(angle) * half;
            normalized[j].x += Math.cos(angle) * half;
            normalized[j].y += Math.sin(angle) * half;
          } else {
            // Push apart so dist === minDist
            const half = (minDist - dist) / (2 * dist);
            normalized[i].x -= dx * half;
            normalized[i].y -= dy * half;
            normalized[j].x += dx * half;
            normalized[j].y += dy * half;
          }
        }
      }
    }

    // Clamp to bounds
    for (const p of normalized) {
      p.x = Math.max(0.03, Math.min(0.97, p.x));
      p.y = Math.max(0.03, Math.min(0.97, p.y));
    }

    if (resolved) break;
  }

  return normalized;
}

// GET /api/explore?category=business_finance
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");

  const db = await getDb();
  const vocab = db.collection<VocabWord>("vocab_words");

  const filter: Record<string, unknown> = {};
  if (category) filter.category = category;

  const words = await vocab.find(filter).toArray();

  // Filter words that have embeddings
  const withEmbeddings = words.filter((w) => w.embedding && w.embedding.length > 0);

  if (withEmbeddings.length < 3) {
    return NextResponse.json({ bubbles: [], error: "Not enough data" });
  }

  // Project to 2D
  const embeddings = withEmbeddings.map((w) => w.embedding!);
  const positions = projectTo2D(embeddings);

  const bubbles = withEmbeddings.map((w, i) => ({
    word: w.word,
    meaningTh: w.meaningTh,
    meaningEn: w.meaningEn,
    pos: w.pos,
    category: w.category,
    difficulty: w.difficulty,
    confusedWith: w.confusedWith,
    examples: w.examples,
    collocations: w.collocations,
    x: positions[i].x,
    y: positions[i].y,
  }));

  return NextResponse.json({ bubbles, total: bubbles.length });
}
