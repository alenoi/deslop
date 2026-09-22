#!/usr/bin/env node
// analyze.mjs : mechanical pattern-scan for AI-tell prose signals.
// Zero dependencies. Node 16+.
//
// Surfaces CANDIDATE locations for seven checkable patterns (cliché/filler
// frames, forced-closure frames, transition overuse, sentence-length
// monotony, paragraph-opener repetition, a passive-voice heuristic, and a
// generic-AI-vocabulary list) plus basic prose stats. It never edits a file
// and never decides a hit is "wrong" — deslop's SKILL.md carries the
// judgment on what each category of hit means and whether it's worth
// touching. A static blacklist match is a candidate, not a verdict.
//
//   node analyze.mjs [--json] <file>
//   cat draft.md | node analyze.mjs --json
//   node analyze.mjs --help
//
// exit codes: 0 ran fine, 2 usage or read error. There is no "fail" exit —
// this script only reports, it never judges the draft as bad.
//
// Examples:
//   node analyze.mjs draft.md
//   node analyze.mjs --json draft.md > report.json
//   pbpaste | node analyze.mjs --json
//   type draft.md | node analyze.mjs            (Windows)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { handleHelp, readJson, readJsonOptional, round2, tokenizeWords } from "./lib/common.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PHRASES_PATH = join(SCRIPT_DIR, "..", "data", "phrases.json");
const LEARNED_PATH = join(SCRIPT_DIR, "..", "data", "learned.json");

const HELP = `usage: analyze.mjs [--json] [<file>]

Scan a text draft for mechanical AI-tell candidates: cliche/filler frames,
forced-closure frames, transition overuse, sentence-length monotony,
paragraph-opener repetition, a passive-voice heuristic, and generic-AI
vocabulary — plus basic word/sentence/paragraph stats.

Reads <file> if given, otherwise stdin. Reports locations only: it never
edits the draft and never decides a hit is wrong. A flag is a candidate for
judgment, not an instruction.

  --json      full structured report (default: short human summary)
  -h, --help  this text

exit codes: 0 ran fine, 2 usage or read error.`;

const MAX_EXAMPLES = 5;

// ---------------------------------------------------------------- CLI ----

const args = process.argv.slice(2);
handleHelp(args, HELP);
let asJson = false;
const positional = [];
for (const arg of args) {
  if (arg === "--json") { asJson = true; continue; }
  if (arg.startsWith("-") && arg !== "-") {
    console.error("analyze: unknown option " + arg);
    console.error("run analyze.mjs --help for usage");
    process.exit(2);
  }
  positional.push(arg);
}
if (positional.length > 1) {
  console.error("analyze: at most one file argument");
  process.exit(2);
}

let text;
try {
  if (positional.length === 1) {
    text = readFileSync(positional[0], "utf8");
  } else if (!process.stdin.isTTY) {
    text = readFileSync(0, "utf8");
  } else {
    console.error(HELP);
    process.exit(2);
  }
} catch (error) {
  console.error("analyze: cannot read input: " + error.message);
  process.exit(2);
}

// ------------------------------------------------------------- helpers ----

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// --------------------------------------------------------- phrase data ----
// Seed lists (cliche_filler, forced_closure, transition_overuse,
// lexical_candidates) live in the committed data/phrases.json and are grown
// only by a human editing that file directly. cliche_filler and
// forced_closure are also learnable: scripts/learn.mjs + scripts/promote.mjs
// grow a *separate*, gitignored data/learned.json, so promoted entries (and
// any real-text snippets riding along in their `examples`) never land in
// this public repo. A missing/malformed phrases.json fails loudly here
// rather than silently scanning with empty lists, which would read as
// "clean draft" — the worst kind of wrong. A missing learned.json is the
// normal, expected state of a fresh clone and is silently treated as empty;
// a *malformed* learned.json fails just as loudly as phrases.json would,
// because silently dropping learned phrases would make the tool quietly
// weaker with no signal.
function validatePhraseData(data) {
  for (const key of ["cliche_filler", "forced_closure", "transition_overuse", "lexical_candidates"]) {
    if (!data[key] || !Array.isArray(data[key].entries)) {
      return `missing a valid "${key}.entries" array`;
    }
  }
  return null;
}

function validateLearnedData(data) {
  for (const key of ["cliche_filler", "forced_closure"]) {
    if (!data[key] || !Array.isArray(data[key].entries)) {
      return `missing a valid "${key}.entries" array`;
    }
  }
  return null;
}

const PHRASE_DATA = readJson(PHRASES_PATH, "analyze", validatePhraseData);
const EMPTY_LEARNED = { cliche_filler: { entries: [] }, forced_closure: { entries: [] } };
const LEARNED_DATA = readJsonOptional(LEARNED_PATH, "analyze", validateLearnedData, EMPTY_LEARNED);

function entryPattern(entry) {
  if (typeof entry === "string") return phrasePattern(entry);
  if (entry.regex) return { re: new RegExp(entry.regex, "giu") };
  if (entry.phrase) return phrasePattern(entry.phrase);
  throw new Error("phrase entry has neither .phrase nor .regex: " + JSON.stringify(entry));
}

function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function stdev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
}

function countWords(str) {
  return tokenizeWords(str).length;
}

function splitParagraphs(str) {
  return str.split(/\r?\n\s*\r?\n+/).map((p) => p.trim()).filter(Boolean);
}

function splitSentences(paragraph) {
  return paragraph
    .split(/(?<=[.!?…])\s+(?=\S)/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

function snippetAround(str, index, len, radius = 40) {
  const start = Math.max(0, index - radius);
  const end = Math.min(str.length, index + len + radius);
  let s = str.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) s = "…" + s;
  if (end < str.length) s = s + "…";
  return s;
}

function firstWords(paragraph, n) {
  const m = paragraph.match(/[\p{L}\p{N}']+/gu) || [];
  return m.slice(0, n);
}

// ------------------------------------------------------------- corpus ----

const paragraphs = splitParagraphs(text);
const sentences = []; // flat, document order
paragraphs.forEach((p, pi) => {
  splitSentences(p).forEach((s, si) => {
    sentences.push({ text: s, para: pi, sentInPara: si, words: countWords(s) });
  });
});

// --------------------------------------------------------------- stats ----

const sentenceWordCounts = sentences.map((s) => s.words);
const stats = {
  words: countWords(text),
  sentences: sentences.length,
  paragraphs: paragraphs.length,
  avgSentenceLength: round2(mean(sentenceWordCounts)),
  sentenceLengthStdev: round2(stdev(sentenceWordCounts)),
};

// ---------------------------------------------------- phrase-list scan ----

function scanPhraseList(patterns) {
  let count = 0;
  const examples = [];
  paragraphs.forEach((p, pi) => {
    for (const pat of patterns) {
      pat.re.lastIndex = 0;
      let m;
      while ((m = pat.re.exec(p)) !== null) {
        count++;
        if (examples.length < MAX_EXAMPLES) {
          examples.push({
            paragraph: pi + 1,
            match: m[0],
            snippet: snippetAround(p, m.index, m[0].length),
          });
        }
        if (m[0].length === 0) pat.re.lastIndex++;
      }
    }
  });
  return { count, examples };
}

function phrasePattern(phrase) {
  return { re: new RegExp(escapeRegExp(phrase), "giu") };
}

// --- cliché / filler frames (EN + HU; cross-language collision is a
// non-issue on exact-phrase matches) — learnable: seed entries from
// data/phrases.json, merged with any promoted entries from data/learned.json ---
const CLICHE_FILLER = scanPhraseList([
  ...PHRASE_DATA.cliche_filler.entries.map(entryPattern),
  ...LEARNED_DATA.cliche_filler.entries.map(entryPattern),
]);

// --- forced-closure / thematic over-determination frames — learnable, same
// seed+learned merge as cliche_filler ---
const FORCED_CLOSURE = scanPhraseList([
  ...PHRASE_DATA.forced_closure.entries.map(entryPattern),
  ...LEARNED_DATA.forced_closure.entries.map(entryPattern),
]);

// --- generic-AI vocabulary candidates (EN + HU) — frozen, hand-curated,
// seed only: never grown by tooling ---
const LEXICAL_CANDIDATES = scanPhraseList(PHRASE_DATA.lexical_candidates.entries.map(entryPattern));

// ----------------------------------------------------- transition scan ----

// frozen, hand-curated, seed only — from data/phrases.json
const TRANSITIONS = PHRASE_DATA.transition_overuse.entries;

function scanTransitionOveruse() {
  const counts = new Map();
  const examples = [];
  let totalHits = 0;
  for (const s of sentences) {
    const lower = s.text.trim().toLowerCase();
    for (const c of TRANSITIONS) {
      const cl = c.toLowerCase();
      if (lower === cl || lower.startsWith(cl + " ") || lower.startsWith(cl + ",")) {
        counts.set(c, (counts.get(c) || 0) + 1);
        totalHits++;
        if (examples.length < MAX_EXAMPLES) {
          examples.push({
            paragraph: s.para + 1,
            sentence: s.sentInPara + 1,
            connective: c,
            snippet: snippetAround(s.text, 0, Math.min(s.text.length, 40)),
          });
        }
        break;
      }
    }
  }
  const byConnective = Object.fromEntries(counts);
  const repeated = [...counts.entries()]
    .filter(([, n]) => n >= 3)
    .map(([connective, n]) => ({ connective, count: n }));
  const densityPerParagraph = paragraphs.length ? round2(totalHits / paragraphs.length) : 0;
  return {
    totalHits,
    byConnective,
    repeated,
    densityPerParagraph,
    flagged: repeated.length > 0 || densityPerParagraph > 1,
    examples,
  };
}

const TRANSITION_OVERUSE = scanTransitionOveruse();

// --------------------------------------------------- sentence monotony ----

function findMonotonyRuns(minRun = 4, band = 4) {
  const runs = [];
  let i = 0;
  while (i < sentences.length) {
    let j = i + 1;
    let min = sentences[i].words;
    let max = sentences[i].words;
    while (j < sentences.length) {
      const w = sentences[j].words;
      const newMin = Math.min(min, w);
      const newMax = Math.max(max, w);
      if (newMax - newMin > band) break;
      min = newMin;
      max = newMax;
      j++;
    }
    const len = j - i;
    if (len >= minRun) {
      const slice = sentences.slice(i, j);
      runs.push({
        length: slice.length,
        minWords: min,
        maxWords: max,
        startParagraph: slice[0].para + 1,
        startSentence: slice[0].sentInPara + 1,
        endParagraph: slice[slice.length - 1].para + 1,
        endSentence: slice[slice.length - 1].sentInPara + 1,
        snippet: snippetAround(slice[0].text, 0, Math.min(slice[0].text.length, 30)),
      });
    }
    i = j;
  }
  return runs;
}

const monotonyRuns = findMonotonyRuns();
const SENTENCE_LENGTH_MONOTONY = {
  totalRuns: monotonyRuns.length,
  examples: monotonyRuns.slice(0, MAX_EXAMPLES),
};

// ------------------------------------------------ paragraph openers ----

function findOpenerRepetition() {
  let count = 0;
  const examples = [];
  for (let i = 1; i < paragraphs.length; i++) {
    const prev = firstWords(paragraphs[i - 1], 2);
    const cur = firstWords(paragraphs[i], 2);
    if (!prev.length || !cur.length) continue;
    const oneWordMatch = prev[0].toLowerCase() === cur[0].toLowerCase();
    if (!oneWordMatch) continue;
    const twoWordMatch = prev.length > 1 && cur.length > 1 && prev[1].toLowerCase() === cur[1].toLowerCase();
    count++;
    if (examples.length < MAX_EXAMPLES) {
      examples.push({
        paragraphs: [i, i + 1],
        opener: twoWordMatch ? prev.slice(0, 2).join(" ") : prev[0],
        twoWordMatch,
      });
    }
  }
  return { count, examples };
}

const PARAGRAPH_OPENER_REPETITION = findOpenerRepetition();

// -------------------------------------------------- passive voice ----

const IRREGULAR_PARTICIPLES = new Set([
  "done", "made", "given", "taken", "written", "seen", "known", "shown",
  "built", "sent", "held", "told", "found", "said", "put", "set", "heard",
  "met", "born", "chosen", "broken", "spoken", "driven", "eaten",
  "forgotten", "hidden", "ridden", "risen", "stolen", "sworn", "thrown",
  "worn", "woven", "bought", "brought", "caught", "taught", "thought",
  "understood", "kept", "left", "lost", "paid", "read", "run", "sat",
  "stood", "won", "grown", "flown", "drawn", "begun", "gone",
]);

function scanPassiveVoice() {
  const re = /\b(was|were|is|are|been|being)\s+([\p{L}]+)\b/giu;
  let m;
  let count = 0;
  const examples = [];
  while ((m = re.exec(text)) !== null) {
    const word = m[2].toLowerCase();
    const looksParticiple = (word.endsWith("ed") && word.length > 3) || IRREGULAR_PARTICIPLES.has(word);
    if (!looksParticiple) continue;
    count++;
    if (examples.length < MAX_EXAMPLES) {
      examples.push({ match: m[0], snippet: snippetAround(text, m.index, m[0].length) });
    }
  }
  return {
    count,
    examples,
    note: "heuristic only: (was|were|is|are|been|being) + -ed/irregular-participle-shaped word. Catches adjectival copulas and other false positives — read each hit in context, do not batch-fix.",
  };
}

const PASSIVE_VOICE_HEURISTIC = scanPassiveVoice();

// -------------------------------------------------------------- report ----

const report = {
  stats,
  cliche_filler: CLICHE_FILLER,
  forced_closure: FORCED_CLOSURE,
  transition_overuse: TRANSITION_OVERUSE,
  sentence_length_monotony: SENTENCE_LENGTH_MONOTONY,
  paragraph_opener_repetition: PARAGRAPH_OPENER_REPETITION,
  passive_voice_heuristic: PASSIVE_VOICE_HEURISTIC,
  lexical_candidates: LEXICAL_CANDIDATES,
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(
    `Draft: ${stats.words} words, ${stats.sentences} sentences, ${stats.paragraphs} paragraph(s) ` +
      `(avg sentence ${stats.avgSentenceLength} words, stdev ${stats.sentenceLengthStdev})`,
  );
  console.log("");
  console.log(`cliche_filler                : ${CLICHE_FILLER.count} hit(s)`);
  console.log(`forced_closure                : ${FORCED_CLOSURE.count} hit(s)`);
  console.log(
    `transition_overuse            : ${TRANSITION_OVERUSE.totalHits} hit(s), ` +
      `${TRANSITION_OVERUSE.densityPerParagraph}/paragraph` +
      (TRANSITION_OVERUSE.repeated.length
        ? ` — repeated: ${TRANSITION_OVERUSE.repeated.map((r) => `${r.connective}×${r.count}`).join(", ")}`
        : ""),
  );
  console.log(`sentence_length_monotony       : ${SENTENCE_LENGTH_MONOTONY.totalRuns} run(s) of 4+ similar-length sentences`);
  console.log(`paragraph_opener_repetition    : ${PARAGRAPH_OPENER_REPETITION.count} consecutive pair(s)`);
  console.log(`passive_voice_heuristic        : ${PASSIVE_VOICE_HEURISTIC.count} hit(s) (heuristic, expect false positives)`);
  console.log(`lexical_candidates             : ${LEXICAL_CANDIDATES.count} hit(s)`);
  console.log("");
  console.log("These are candidates for judgment, not a verdict. Run with --json for locations.");
}

process.exit(0);
