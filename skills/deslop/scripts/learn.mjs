#!/usr/bin/env node
// learn.mjs : mine phrase candidates from accepted edits, never touch the
// active list. Zero dependencies. Node 16+.
//
// Two modes:
//   node learn.mjs --before <original.md> --after <edited.md> [--category cliche_filler|forced_closure]
//     Diffs the two (word-level LCS), extracts contiguous 3-8 word runs
//     present in `before` and gone from `after`, and records each into
//     data/candidates.json with confirmations+1 (or a fresh entry).
//
//   node learn.mjs --from-flagged <draft.md> [--category cliche_filler|forced_closure]
//     Weaker signal: mines n-grams (length 3-6) that repeat within a single
//     flagged draft. Recorded at a reduced weight (0.5x per repeat) so a
//     flagged-only draft can't reach the promotion threshold as fast as a
//     real before/after edit.
//
// Only writes data/candidates.json — never data/phrases.json (the committed
// seed list) and never data/learned.json (only ever written by
// scripts/promote.mjs, after a human reviews a dry run). Sequences under 3
// words are refused. Phrases are built by joining tokenizer word-matches, so
// no raw regex metacharacter can ever enter a stored phrase.
//
// data/candidates.json is gitignored staging: a missing file is the normal
// state of a fresh clone (treated as empty) and gets created on first write;
// a malformed one is a hard error, same as any other corrupt state file.
//
//   --category <name>  cliche_filler (default) or forced_closure — which
//                       learnable list a promoted candidate would join
//   -h, --help          this text
//
// exit codes: 0 ran fine (including "found nothing"), 2 usage or read error.
//
// Examples:
//   node learn.mjs --before draft-v1.md --after draft-v2.md
//   node learn.mjs --from-flagged sloppy-report.md --category forced_closure

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { handleHelp, readJsonOptional, round2, todayIso, tokenizeWords, writeJsonAtomic } from "./lib/common.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CANDIDATES_PATH = join(SCRIPT_DIR, "..", "data", "candidates.json");
const PHRASES_PATH = join(SCRIPT_DIR, "..", "data", "phrases.json");
const LEARNED_PATH = join(SCRIPT_DIR, "..", "data", "learned.json");
const LEARNABLE_CATEGORIES = new Set(["cliche_filler", "forced_closure"]);
const MIN_WORDS = 3;
const MAX_WORDS = 8;
// ponytail: O(n*m) word-level LCS. Fine for a report-sized before/after pair;
// caps out rather than hanging on something huge. Upgrade to a chunked/
// paragraph-wise diff if someone ever feeds it a book.
const MAX_LCS_CELLS = 9_000_000;

const HELP = `usage: learn.mjs --before <file> --after <file> [--category cliche_filler|forced_closure]
       learn.mjs --from-flagged <file> [--category cliche_filler|forced_closure]

Mine phrase candidates into data/candidates.json. Never writes
data/phrases.json or data/learned.json — promotion is a separate reviewed
step (promote.mjs).

  --before <file>      original text (edit mode, use with --after)
  --after <file>       edited text (edit mode, use with --before)
  --from-flagged <file> mine repeated n-grams from one flagged draft (weaker signal)
  --category <name>    cliche_filler (default) or forced_closure
  -h, --help            this text

exit codes: 0 ran fine, 2 usage or read error.`;

// --------------------------------------------------------------- CLI ----

const args = process.argv.slice(2);
handleHelp(args, HELP);

function readOpt(name) {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const v = args[i + 1];
  if (v === undefined || v.startsWith("--")) {
    console.error(`learn: ${name} needs a value`);
    process.exit(2);
  }
  return v;
}

const beforePath = readOpt("--before");
const afterPath = readOpt("--after");
const flaggedPath = readOpt("--from-flagged");
const category = readOpt("--category") || "cliche_filler";

if (!LEARNABLE_CATEGORIES.has(category)) {
  console.error(`learn: --category must be one of: ${[...LEARNABLE_CATEGORIES].join(", ")}`);
  process.exit(2);
}

const editMode = beforePath || afterPath;
if (editMode && flaggedPath) {
  console.error("learn: use either --before/--after or --from-flagged, not both");
  process.exit(2);
}
if (editMode && (!beforePath || !afterPath)) {
  console.error("learn: --before and --after are both required together");
  process.exit(2);
}
if (!editMode && !flaggedPath) {
  console.error(HELP);
  process.exit(2);
}

function readTextFile(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    console.error(`learn: cannot read ${path}: ${error.message}`);
    process.exit(2);
  }
}

// ------------------------------------------------------------ helpers ----

function snippetFor(words, start, len) {
  return words.slice(Math.max(0, start - 3), Math.min(words.length, start + len + 3)).join(" ");
}

// --------------------------------------------------- edit-mode diff ----

// Word-level LCS backtrace: returns the indices of `before` words that ARE
// matched somewhere in `after` (kept). Everything else is a "removed" word.
function keptIndices(beforeWords, afterWords) {
  const n = beforeWords.length;
  const m = afterWords.length;
  if (n * m > MAX_LCS_CELLS) {
    console.error(
      `learn: before/after too large to diff word-by-word (${n}x${m} > ${MAX_LCS_CELLS} cells) — skipping edit-mode mining`,
    );
    return null;
  }
  const dp = new Array(n + 1);
  for (let i = 0; i <= n; i++) dp[i] = new Uint16Array(m + 1);
  const bLower = beforeWords.map((w) => w.toLowerCase());
  const aLower = afterWords.map((w) => w.toLowerCase());
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = bLower[i - 1] === aLower[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const kept = new Set();
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (bLower[i - 1] === aLower[j - 1]) {
      kept.add(i - 1);
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return kept;
}

function removedRuns(beforeWords, kept) {
  const runs = [];
  let run = [];
  let runStart = 0;
  for (let idx = 0; idx < beforeWords.length; idx++) {
    if (kept.has(idx)) {
      if (run.length) runs.push({ words: run, start: runStart });
      run = [];
    } else {
      if (!run.length) runStart = idx;
      run.push(beforeWords[idx]);
    }
  }
  if (run.length) runs.push({ words: run, start: runStart });
  return runs;
}

// Split a removed run into 3-8 word candidate frames, non-overlapping.
function chunkRun(run) {
  const chunks = [];
  let words = run.words;
  let start = run.start;
  while (words.length) {
    if (words.length < MIN_WORDS) break; // remainder too short, drop
    const take = Math.min(MAX_WORDS, words.length);
    chunks.push({ words: words.slice(0, take), start });
    words = words.slice(take);
    start += take;
  }
  return chunks;
}

function mineEditPair(beforeText, afterText) {
  const beforeWords = tokenizeWords(beforeText);
  const afterWords = tokenizeWords(afterText);
  const kept = keptIndices(beforeWords, afterWords);
  if (kept === null) return [];
  const candidates = [];
  for (const run of removedRuns(beforeWords, kept)) {
    for (const chunk of chunkRun(run)) {
      candidates.push({
        phrase: chunk.words.join(" ").toLowerCase(),
        example: snippetFor(beforeWords, chunk.start, chunk.words.length),
        source: "edit-diff",
        weight: 1,
      });
    }
  }
  return candidates;
}

// --------------------------------------------------- flagged-draft mine ----

function mineFlagged(text) {
  const words = tokenizeWords(text);
  const lower = words.map((w) => w.toLowerCase());
  const candidates = [];
  // ponytail: fixed n-gram lengths (3,4,5,6), no containment de-dup across
  // lengths — a real repeated frame may surface at more than one length.
  // Good enough for a weak secondary signal; tighten if candidates.json
  // gets noisy from this mode specifically.
  for (const n of [3, 4, 5, 6]) {
    const seen = new Map(); // phrase -> { count, start }
    for (let i = 0; i + n <= lower.length; i++) {
      const phrase = lower.slice(i, i + n).join(" ");
      if (!seen.has(phrase)) seen.set(phrase, { count: 0, start: i });
      seen.get(phrase).count++;
    }
    const repeated = [...seen.entries()]
      .filter(([, v]) => v.count >= 2)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20);
    for (const [phrase, v] of repeated) {
      candidates.push({
        phrase,
        example: snippetFor(words, v.start, n),
        source: "flagged-repeat",
        weight: 0.5 * v.count,
      });
    }
  }
  return candidates;
}

// -------------------------------------------------------- candidates.json ----

function loadCandidates() {
  return readJsonOptional(
    CANDIDATES_PATH,
    "learn",
    (d) => (Array.isArray(d.candidates) ? null : 'missing a "candidates" array'),
    { candidates: [] },
  );
}

function mergeCandidates(existing, mined, category) {
  const today = todayIso();
  let added = 0, bumped = 0, skippedShort = 0;
  for (const c of mined) {
    const wordCount = c.phrase.split(/\s+/).filter(Boolean).length;
    if (wordCount < MIN_WORDS) { skippedShort++; continue; }
    let entry = existing.candidates.find((e) => e.phrase === c.phrase && e.category === category);
    if (entry) {
      entry.confirmations = round2(entry.confirmations + c.weight);
      entry.lastSeen = today;
      if (entry.examples.length < 5) entry.examples.push(c.example);
      bumped++;
    } else {
      existing.candidates.push({
        phrase: c.phrase,
        category,
        confirmations: c.weight,
        firstSeen: today,
        lastSeen: today,
        source: c.source,
        examples: [c.example],
      });
      added++;
    }
  }
  return { added, bumped, skippedShort };
}

// Never write phrases.json or learned.json — read-only, and only to skip
// candidates already active in either the seed list or the promoted-learned
// list. If either can't be read, mining still proceeds without that half of
// the dedupe (a missing learned.json is expected on a fresh clone and is
// silent; a read/parse failure on either file is a warning, not fatal, here
// specifically — this is a best-effort skip-list, not the analyzer).
function loadActivePhrases(category) {
  const active = new Set();
  try {
    const data = JSON.parse(readFileSync(PHRASES_PATH, "utf8"));
    for (const e of data[category]?.entries || []) if (e.phrase) active.add(e.phrase.toLowerCase());
  } catch (error) {
    console.error(`learn: warning — could not read ${PHRASES_PATH} to skip already-active phrases (${error.message})`);
  }
  try {
    const data = JSON.parse(readFileSync(LEARNED_PATH, "utf8"));
    for (const e of data[category]?.entries || []) if (e.phrase) active.add(e.phrase.toLowerCase());
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error(`learn: warning — could not read ${LEARNED_PATH} to skip already-active phrases (${error.message})`);
    }
  }
  return active;
}

// ------------------------------------------------------------------ run ----

let mined;
if (editMode) {
  const before = readTextFile(beforePath);
  const after = readTextFile(afterPath);
  mined = mineEditPair(before, after);
} else {
  mined = mineFlagged(readTextFile(flaggedPath));
}

const activePhrases = loadActivePhrases(category);
const skippedActiveCount = mined.filter((c) => activePhrases.has(c.phrase)).length;
mined = mined.filter((c) => !activePhrases.has(c.phrase));

const existing = loadCandidates();
const before = existing.candidates.length;
const { added, bumped, skippedShort } = mergeCandidates(existing, mined, category);
writeJsonAtomic(CANDIDATES_PATH, existing);

console.log(`learn: mined ${mined.length + skippedActiveCount} candidate(s) for category "${category}"`);
console.log(
  `  new: ${added}, reinforced: ${bumped}, refused (under ${MIN_WORDS} words): ${skippedShort}, ` +
    `already active: ${skippedActiveCount}`,
);
console.log(`  data/candidates.json now holds ${existing.candidates.length} entries (was ${before})`);
console.log(`  review with: node promote.mjs   (dry run) then --apply`);
process.exit(0);
