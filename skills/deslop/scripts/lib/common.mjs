// Shared helpers for analyze.mjs, learn.mjs, promote.mjs: JSON load-or-die,
// atomic write, date stamp, rounding, --help handling, word tokenizing.
// Zero dependencies. Node 16+.

import { readFileSync, writeFileSync, renameSync } from "node:fs";

function parseJsonOrDie(raw, path, programName) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(`${programName}: ${path} is not valid JSON: ${error.message}`);
    process.exit(2);
  }
}

function validateOrDie(data, path, programName, validate) {
  if (!validate) return data;
  const err = validate(data);
  if (err) {
    console.error(`${programName}: ${path}: ${err}`);
    process.exit(2);
  }
  return data;
}

// Read + parse a JSON file, exiting with a clear stderr message (exit 2) on
// any failure: unreadable file, invalid JSON, or a failed `validate`. Use
// this for files whose absence is itself an error — the committed seed data
// (data/phrases.json) — where a silent empty-list fallback would read as
// "clean draft" instead of "something is wrong."
export function readJson(path, programName, validate) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    console.error(`${programName}: cannot read ${path}: ${error.message}`);
    process.exit(2);
  }
  return validateOrDie(parseJsonOrDie(raw, path, programName), path, programName, validate);
}

// Same as readJson, but a missing file (ENOENT) is normal, not an error: it
// returns `fallback` untouched. A file that exists but fails to parse or
// fails `validate` still dies loudly — malformed state is never treated as
// empty state. Use this for gitignored staging/learned-state files (
// data/learned.json, data/candidates.json) whose absence just means "a
// fresh clone, nothing mined yet."
export function readJsonOptional(path, programName, validate, fallback) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    console.error(`${programName}: cannot read ${path}: ${error.message}`);
    process.exit(2);
  }
  return validateOrDie(parseJsonOrDie(raw, path, programName), path, programName, validate);
}

// Atomic write: temp file + rename, so a Syncthing-replicated file is never
// observed half-written.
export function writeJsonAtomic(path, data) {
  const tmp = path + ".tmp-" + process.pid;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  renameSync(tmp, path);
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function round2(n) {
  return Math.round(n * 100) / 100;
}

export function handleHelp(args, helpText) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(helpText);
    process.exit(0);
  }
}

// Word tokenizer: letters/digits, with an internal apostrophe or hyphen
// allowed so "can't" and "AI-tell" don't split. Shared by analyze.mjs (word
// counts) and learn.mjs, where it doubles as the only thing that can end up
// inside a mined phrase — so no regex metacharacter from source text can
// ever reach candidates.json or learned.json.
const WORD_RE = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

export function tokenizeWords(str) {
  return str.match(WORD_RE) || [];
}
