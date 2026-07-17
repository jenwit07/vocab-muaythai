/**
 * Parse Oxford 3000 PDF → oxford-3000.json
 * Handles 4-column layout by splitting on x-coordinates
 *
 * Usage:
 *   pnpm parse-pdf /path/to/American_Oxford_3000.pdf
 */

import { writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// @ts-ignore
const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

type OxfordEntry = { word: string; pos: string; level: string };

const POS_MAP: Record<string, string> = {
  "n.": "noun", "v.": "verb", "adj.": "adjective", "adv.": "adverb",
  "prep.": "preposition", "conj.": "conjunction", "pron.": "pronoun",
  "det.": "determiner", "exclam.": "exclamation", "number": "number",
  "modal": "modal verb", "article": "article",
};

const LEVEL_RE = /\b(A1|A2|B1|B2)\b/;
const LEVELS = new Set(["A1", "A2", "B1", "B2"]);

// Clean superscript numbers and extra whitespace from word
function cleanWord(raw: string): string {
  return raw
    .replace(/[¹²³⁴⁵⁶⁷⁸⁹\d]+$/, "")
    .replace(/['']/g, "'")
    .trim()
    .toLowerCase();
}

/**
 * Extract text items per page with x,y positions
 * Then sort by column (x), then row (y desc) to reconstruct reading order
 */
async function extractColumnText(pdfPath: string): Promise<string> {
  const loadingTask = pdfjsLib.getDocument({ url: pdfPath });
  const pdf = await loadingTask.promise;

  let allText = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });
    const pageWidth = viewport.width;

    // Collect all text items with position
    type Item = { x: number; y: number; text: string };
    const items: Item[] = [];

    for (const item of content.items) {
      if (!("str" in item) || !(item as any).str.trim()) continue;
      const [,, , , x, y] = (item as any).transform as number[];
      items.push({ x, y, text: (item as any).str });
    }

    // Determine column boundaries (4 columns)
    const colWidth = pageWidth / 4;
    const numCols = 4;

    // Group into columns
    const columns: Item[][] = Array.from({ length: numCols }, () => []);
    for (const item of items) {
      const col = Math.min(Math.floor(item.x / colWidth), numCols - 1);
      columns[col].push(item);
    }

    // Sort each column top→bottom (y descending in PDF coords)
    for (const col of columns) {
      col.sort((a, b) => b.y - a.y);
    }

    // For each column, group items on the same line (same y ± 3)
    for (const col of columns) {
      const lines: string[] = [];
      let currentY = -Infinity;
      let currentLine = "";

      for (const item of col) {
        if (Math.abs(item.y - currentY) > 3 && currentLine) {
          lines.push(currentLine.trim());
          currentLine = item.text;
          currentY = item.y;
        } else if (currentLine === "") {
          currentLine = item.text;
          currentY = item.y;
        } else {
          currentLine += " " + item.text;
        }
      }
      if (currentLine.trim()) lines.push(currentLine.trim());

      allText += lines.join("\n") + "\n";
    }
  }

  return allText;
}

/**
 * Parse a single line like "abandon v. B2" or "all det., pron. A1, adv. A2"
 */
function parseLine(line: string): OxfordEntry | null {
  line = line.trim();
  if (!line || line.length < 3) return null;

  // Must have a level
  if (!LEVEL_RE.test(line)) return null;

  // Skip header/footer lines
  if (line.includes("Oxford University Press") || line.includes("Oxford 3000")) return null;
  if (/^\d/.test(line)) return null; // page numbers

  // Find where POS starts
  const posPattern = /\b(n\.|v\.|adj\.|adv\.|prep\.|conj\.|pron\.|det\.|exclam\.|number\b|modal\b|article\b)/;
  const posIdx = line.search(posPattern);
  if (posIdx === -1) return null;

  const rawWord = line.slice(0, posIdx).trim();
  if (!rawWord) return null;

  // Word should not contain level markers or be too long
  if (rawWord.length > 30) return null;

  // Extract first POS
  const posMatch = line.slice(posIdx).match(posPattern);
  const pos = posMatch ? (POS_MAP[posMatch[1]] ?? posMatch[1].replace(/\.$/, "")) : "word";

  // Get the HIGHEST level in the line (take last A1/A2/B1/B2)
  const allLevels = [...line.matchAll(/\b(A1|A2|B1|B2)\b/g)].map(m => m[1]);
  if (allLevels.length === 0) return null;

  // Sort levels: A1 < A2 < B1 < B2
  const levelOrder = ["A1", "A2", "B1", "B2"];
  const highestLevel = allLevels.reduce((max, l) =>
    levelOrder.indexOf(l) > levelOrder.indexOf(max) ? l : max
  );

  const word = cleanWord(rawWord);
  if (!word || word.length < 2) return null;
  // Filter out obvious non-words
  if (/[^a-z\-']/.test(word)) return null;

  return { word, pos, level: highestLevel };
}

async function main() {
  const pdfPath = process.argv[2];
  if (!pdfPath) {
    console.error("Usage: pnpm parse-pdf <path-to-pdf>");
    process.exit(1);
  }

  const absolutePath = resolve(process.cwd(), pdfPath);
  console.log(`📄 Parsing: ${absolutePath}\n`);

  const text = await extractColumnText(absolutePath);
  const lines = text.split("\n");
  console.log(`Extracted ${lines.length} lines from ${(await import("pdfjs-dist/legacy/build/pdf.mjs")).version ?? ""} pdf`);

  const entries: OxfordEntry[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const entry = parseLine(line);
    if (!entry) continue;
    if (!LEVELS.has(entry.level)) continue;
    if (seen.has(entry.word)) continue;
    seen.add(entry.word);
    entries.push(entry);
  }

  // Level breakdown
  const byLevel: Record<string, number> = {};
  for (const e of entries) {
    byLevel[e.level] = (byLevel[e.level] ?? 0) + 1;
  }

  console.log(`\n✅ Parsed ${entries.length} unique words`);
  console.log(`   A1: ${byLevel.A1 ?? 0}  A2: ${byLevel.A2 ?? 0}  B1: ${byLevel.B1 ?? 0}  B2: ${byLevel.B2 ?? 0}`);

  // Sort alphabetically
  entries.sort((a, b) => a.word.localeCompare(b.word));

  // Save
  const outPath = resolve(__dirname, "./oxford-3000.json");
  await writeFile(outPath, JSON.stringify(entries, null, 2), "utf-8");
  console.log(`\n💾 Saved to: ${outPath}`);

  // Preview
  console.log("\nSample words:");
  [0, 100, 500, 1000, entries.length - 1].forEach(i => {
    if (entries[i]) console.log(`  [${i}] ${entries[i].word} (${entries[i].pos}) [${entries[i].level}]`);
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
