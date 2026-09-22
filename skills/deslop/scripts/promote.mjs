#!/usr/bin/env node
// promote.mjs : the review gate between mined candidates and the active
// learned-phrase list. Zero dependencies. Node 16+.
//
// Reads data/candidates.json (written by learn.mjs), data/phrases.json
// (the committed seed list, read-only — used only for its entry counts, to
// keep the per-category cap counting seed + learned together) and
// data/learned.json (gitignored, the only file this script ever writes to),
// and either reports (dry run, default) or applies (--apply):
//   - PROMOTE: candidates with confirmations >= threshold move into the
//     matching learnable list in learned.json (source: "learned"), and are
//     removed from candidates.json.
//   - EVICT: learned entries not confirmed/re-fired within the staleness
//     window drop back to candidates.json (or are dropped entirely if
//     already stale there too). Seed entries live in phrases.json, which
//     this script never writes to, so eviction structurally can't touch
//     them — there is no "never evict source:seed" conditional to write.
//   - CAP: each learnable list (seed + learned combined) is capped; over the
//     cap, lower-confirmation candidates are held back (reported, not
//     silently dropped).
//
//   node promote.mjs                     dry run (default) — nothing written
//   node promote.mjs --apply             actually write learned.json + candidates.json
//   node promote.mjs --threshold 5       override confirmation threshold (default 3)
//   node promote.mjs --stale-days 90     override staleness window (default 180)
//   node promote.mjs --cap 200           override per-list cap (default 150)
//   node promote.mjs --json              machine-readable summary
//
// Refuses to run if phrases.json marks a learnable category frozen — there
// is currently no path that would try to write there anyway (this script
// never writes phrases.json), this is a defense-in-depth guard for future
// category additions.
//
// exit codes: 0 ran fine, 2 usage or read error.

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { handleHelp, readJson, readJsonOptional, todayIso, writeJsonAtomic } from "./lib/common.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PHRASES_PATH = join(SCRIPT_DIR, "..", "data", "phrases.json");
const LEARNED_PATH = join(SCRIPT_DIR, "..", "data", "learned.json");
const CANDIDATES_PATH = join(SCRIPT_DIR, "..", "data", "candidates.json");
const LEARNABLE_CATEGORIES = ["cliche_filler", "forced_closure"];

const DEFAULT_THRESHOLD = 3;
const DEFAULT_STALE_DAYS = 180;
const DEFAULT_CAP = 150;

const HELP = `usage: promote.mjs [--apply] [--threshold N] [--stale-days N] [--cap N] [--json]

Review gate for data/candidates.json -> data/learned.json. Dry run by
default; --apply is required to write anything. Never writes to
data/phrases.json (the committed seed list) or a frozen category
(transition_overuse, lexical_candidates).

  --apply           actually write (default: report only)
  --threshold N     confirmations needed to promote (default ${DEFAULT_THRESHOLD})
  --stale-days N    days without reconfirmation before eviction (default ${DEFAULT_STALE_DAYS})
  --cap N           max entries per learnable list, seed + learned (default ${DEFAULT_CAP})
  --json            machine-readable summary
  -h, --help        this text

exit codes: 0 ran fine, 2 usage or read error.`;

const args = process.argv.slice(2);
handleHelp(args, HELP);
const apply = args.includes("--apply");
const asJson = args.includes("--json");

function readIntOpt(name, fallback) {
  const i = args.indexOf(name);
  if (i === -1) return fallback;
  const v = Number(args[i + 1]);
  if (!Number.isFinite(v) || v <= 0) {
    console.error(`promote: ${name} needs a positive number`);
    process.exit(2);
  }
  return v;
}

const threshold = readIntOpt("--threshold", DEFAULT_THRESHOLD);
const staleDays = readIntOpt("--stale-days", DEFAULT_STALE_DAYS);
const cap = readIntOpt("--cap", DEFAULT_CAP);

// -------------------------------------------------------------- helpers ----

function daysBetween(isoA, isoB) {
  const a = new Date(isoA + "T00:00:00Z").getTime();
  const b = new Date(isoB + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000);
}

// -------------------------------------------------------------- load ----

// Seed list: committed, read-only here. Still hard-fails on missing/malformed
// — this script needs real seed counts for the cap, and a silent empty
// fallback would under-count and let promotion blow past the intended cap.
const phrases = readJson(PHRASES_PATH, "promote", (d) => {
  for (const key of LEARNABLE_CATEGORIES) {
    if (!d[key] || !Array.isArray(d[key].entries)) return `missing valid "${key}.entries"`;
    if (d[key].frozen) return `"${key}" is marked frozen — refusing to treat it as learnable`;
  }
  return null;
});

// Learned list: gitignored, the only file this script writes. Missing is
// the normal fresh-clone/never-promoted-yet state; malformed is a hard
// error like any other corrupt state file.
const EMPTY_LEARNED = { cliche_filler: { entries: [] }, forced_closure: { entries: [] } };
const learned = readJsonOptional(LEARNED_PATH, "promote", (d) => {
  for (const key of LEARNABLE_CATEGORIES) {
    if (!d[key] || !Array.isArray(d[key].entries)) return `missing valid "${key}.entries"`;
  }
  return null;
}, EMPTY_LEARNED);

// Candidates staging: gitignored. Missing is normal (nothing mined yet).
const candidatesFile = readJsonOptional(
  CANDIDATES_PATH,
  "promote",
  (d) => (Array.isArray(d.candidates) ? null : 'missing "candidates" array'),
  { candidates: [] },
);

const today = todayIso();

// ------------------------------------------------------- promotion pass ----

const report = { promoted: [], evicted: [], heldBack: [], unchanged: 0 };
const remainingCandidates = [];

for (const cand of candidatesFile.candidates) {
  if (!LEARNABLE_CATEGORIES.includes(cand.category)) {
    // unknown/foreign category — pass through untouched rather than drop
    remainingCandidates.push(cand);
    continue;
  }
  if (cand.confirmations >= threshold) {
    report.promoted.push(cand);
  } else {
    remainingCandidates.push(cand);
    report.unchanged++;
  }
}

// Apply per-category cap: if promoting everything above threshold would
// exceed cap, keep the highest-confirmation ones and hold the rest back
// (they stay candidates, not silently discarded). Cap counts seed +
// already-learned together, since that's the combined list analyze.mjs
// actually scans.
const promotedByCategory = {};
for (const cat of LEARNABLE_CATEGORIES) {
  const currentCount = phrases[cat].entries.length + learned[cat].entries.length;
  const room = Math.max(0, cap - currentCount);
  const queued = report.promoted
    .filter((c) => c.category === cat)
    .sort((a, b) => b.confirmations - a.confirmations);
  const toPromote = queued.slice(0, room);
  const heldBack = queued.slice(room);
  promotedByCategory[cat] = toPromote;
  for (const h of heldBack) {
    report.heldBack.push(h);
    remainingCandidates.push(h);
  }
}
report.promoted = LEARNABLE_CATEGORIES.flatMap((cat) => promotedByCategory[cat]);

// ---------------------------------------------------------- eviction pass ----
// Only learned.json entries are ever considered: seed entries live in
// phrases.json, which this script never writes, so they structurally can't
// be evicted — no "skip source:seed" check needed.

for (const cat of LEARNABLE_CATEGORIES) {
  const kept = [];
  for (const entry of learned[cat].entries) {
    const lastActivity = entry.lastSeen || entry.promotedOn || entry.firstSeen;
    const age = lastActivity ? daysBetween(lastActivity, today) : 0;
    if (age > staleDays) {
      report.evicted.push({ ...entry, category: cat });
      // demoted back to candidates, not dropped, unless it's already
      // stale there too — a learned entry earned its way in once, give
      // it one more cycle as a candidate before it's gone for good.
      remainingCandidates.push({
        phrase: entry.phrase,
        category: cat,
        confirmations: Math.max(1, Math.floor((entry.confirmations || threshold) / 2)),
        firstSeen: entry.firstSeen || today,
        lastSeen: today,
        source: "evicted-reentry",
        examples: entry.examples || [],
      });
    } else {
      kept.push(entry);
    }
  }
  learned[cat].entries = kept;
}

// ----------------------------------------------------------------- apply ----

if (apply) {
  for (const cat of LEARNABLE_CATEGORIES) {
    for (const cand of promotedByCategory[cat]) {
      learned[cat].entries.push({
        phrase: cand.phrase,
        source: "learned",
        confirmations: cand.confirmations,
        firstSeen: cand.firstSeen || today,
        promotedOn: today,
        examples: cand.examples || [],
      });
    }
  }
  writeJsonAtomic(LEARNED_PATH, learned);
  writeJsonAtomic(CANDIDATES_PATH, { ...candidatesFile, candidates: remainingCandidates });
}

// ---------------------------------------------------------------- print ----

if (asJson) {
  console.log(JSON.stringify({ apply, threshold, staleDays, cap, ...report }, null, 2));
} else {
  console.log(`promote: ${apply ? "APPLYING" : "DRY RUN (pass --apply to write)"}`);
  console.log(`  threshold=${threshold} confirmations, stale after ${staleDays} days, cap ${cap}/list`);
  console.log("");
  if (report.promoted.length) {
    console.log(`PROMOTE (${report.promoted.length}):`);
    for (const c of report.promoted) {
      console.log(`  [${c.category}] "${c.phrase}" (confirmations=${c.confirmations}) — ${c.examples?.[0] || ""}`);
    }
  } else {
    console.log("PROMOTE: none met the threshold");
  }
  console.log("");
  if (report.heldBack.length) {
    console.log(`HELD BACK, cap reached (${report.heldBack.length}):`);
    for (const c of report.heldBack) {
      console.log(`  [${c.category}] "${c.phrase}" (confirmations=${c.confirmations})`);
    }
    console.log("");
  }
  if (report.evicted.length) {
    console.log(`EVICT, stale (${report.evicted.length}):`);
    for (const c of report.evicted) {
      console.log(`  [${c.category}] "${c.phrase}" — back to candidates.json`);
    }
  } else {
    console.log("EVICT: nothing stale");
  }
  console.log("");
  console.log(`unchanged candidates: ${report.unchanged}`);
  if (!apply) console.log("\nNothing written. Re-run with --apply to write learned.json + candidates.json.");
}

process.exit(0);
