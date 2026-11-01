/**
 * Resolves every character's `wiki` article to a portrait URL and writes
 * src/lib/portraits.json, so the character tree ships with its images instead
 * of asking Wikipedia for 200 summaries at runtime.
 *
 *   npm run portraits            # refresh characters missing from the file
 *   npm run portraits -- --all   # re-resolve everything
 *
 * Run it after adding a character or changing a `wiki` title.
 */
import { readFile, writeFile } from "node:fs/promises";
import { characters } from "../src/lib/characters";

const OUT = new URL("../src/lib/portraits.json", import.meta.url);
const all = process.argv.includes("--all");

type Portraits = Record<string, string>;

const existing: Portraits = await readFile(OUT, "utf8")
  .then((text) => JSON.parse(text) as Portraits)
  .catch(() => ({}));

const next: Portraits = {};
const missing: string[] = [];

for (const character of characters) {
  if (!character.wiki) continue;
  if (!all && existing[character.id]) {
    next[character.id] = existing[character.id];
    continue;
  }
  const response = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(character.wiki)}`,
    { headers: { "user-agent": "marvel-nexus portrait resolver" } },
  );
  const data = response.ok ? await response.json() : null;
  const image: string | undefined = data?.type === "standard" ? data?.thumbnail?.source : undefined;
  if (image) next[character.id] = image;
  else missing.push(`${character.id} (${character.wiki})`);
}

// Stable key order keeps diffs readable.
const sorted = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(OUT, `${JSON.stringify(sorted, null, 2)}\n`);

console.log(`${Object.keys(sorted).length} portraits written.`);
if (missing.length) console.log(`No image for:\n  ${missing.join("\n  ")}`);
