# deslop

A Claude Code skill that edits or drafts text so it reads like a specific
person made these particular choices, instead of the statistically average
output an LLM defaults to.

## The problem

Ask an LLM to write something and, absent other instruction, you get a
recognizable style: hedged claims, forced three-part structure, a closing
paragraph that restates the opening, transitions like "furthermore" doing
the work a repeated noun should be doing, vocabulary that leans on `leverage`,
`robust`, `delve`, `landscape`. None of that is wrong sentence by sentence.
It's wrong in aggregate, because it's the same aggregate every time,
regardless of who's supposedly writing or what they actually think.

`deslop` treats that as a text-quality problem, not a disguise problem. It
edits toward the writer's actual intent, stance, and certainty — not toward
"sounds less like AI," which is a different and worse target: optimizing for
that directly produces typos, manufactured hedging, chopped-up sentences, and
other stereotypes of human writing that a careful writer wouldn't produce
either. The skill's own anti-humanizer rules name and forbid that path
explicitly.

## Two modes

**EDIT MODE** activates whenever a draft already exists. The draft is the
authoritative seed: meaning, stance, certainty, and idiosyncrasy get
preserved, and the smallest edit that produces a real improvement wins over
a paragraph rewrite, which wins over a full rewrite. The draft is never
silently regenerated into a generic voice.

**GENERATE MODE** only applies when there's no usable draft, or a fresh one
is explicitly requested. It infers purpose, audience, register, and genre
before writing, and it does not invent biographical detail, anecdotes,
opinions, or quotes to fill in a writer's persona that was never established.
When the writer's identity is unknown, the fix is staying specific about the
subject, not fabricating specifics about a person who doesn't exist in the
conversation.

## The analyzer

Before an EDIT MODE pass, the skill runs a bundled, zero-dependency Node
script over the draft:

```
node skills/deslop/scripts/analyze.mjs --json path/to/draft.md
```

It checks seven mechanical patterns:

| Category | What it looks for |
|---|---|
| `cliche_filler` | Stock filler frames — "it is important to note that", "in today's fast-paced world", "fontos megjegyezni, hogy" |
| `forced_closure` | Frames that manufacture significance — "this underscores the need for", "the key takeaway is" |
| `transition_overuse` | Connectives ("furthermore", "however", "moreover") used at a density or repetition that suggests reflex rather than actual logical need |
| `sentence_length_monotony` | Runs of four or more consecutive sentences within a narrow word-count band |
| `paragraph_opener_repetition` | Consecutive paragraphs starting with the same word or two |
| `passive_voice_heuristic` | `(was\|were\|is\|are\|been\|being)` followed by something participle-shaped — a heuristic, with known false positives on adjectival copulas |
| `lexical_candidates` | Words that skew heavily toward generated text — `leverage`, `unlock`, `seamless`, `delve`, `kulcsfontosságú` |

Each hit is a location, not a verdict. The script never edits anything and
never marks a hit "wrong" — it hands back paragraph numbers, snippets, and
counts, and the judgment about whether any given hit is worth touching
belongs to whoever (or whatever) reads the draft next: `cliche_filler` might
be genuinely inert filler, or the phrase might be load-bearing here; a
passive construction might be hiding an actor for no reason, or it might be
the correct choice because the actor doesn't matter to the sentence. Reading
`analyze.mjs`'s output as an edit checklist — strip every hit mechanically —
reproduces the exact over-correction the skill exists to avoid. It's a scan
for candidates, not a linter with a fix mode.

## The learning loop

Two of the seven lists — `cliche_filler` and `forced_closure` — are
learnable, meaning the skill can grow them from real accepted edits instead
of staying fixed at whatever a human seeded. `transition_overuse` and
`lexical_candidates` are frozen by design: they're closed, hand-curated
vocabulary lists, and the skill's own stated lexical policy forbids letting
tooling auto-grow a single-word blacklist — a word being common in AI output
doesn't make it wrong in a specific sentence, and an unsupervised process
that keeps adding words to a "bad word" list degrades into exactly the kind
of static blacklist the skill argues against for prose in the first place.

Growing the learnable lists is a three-step pipeline, and each step writes
to a different file:

1. **Mine.** After an EDIT MODE change is accepted, feed the before/after
   pair to the learner:

   ```
   node skills/deslop/scripts/learn.mjs --before original.md --after edited.md
   ```

   It diffs the two texts word-by-word, extracts contiguous runs of 3-8
   words that were present before and are gone after, and records each into
   `data/candidates.json` — a staging file, never the active lists. Runs
   under three words are refused outright; a two-word cut is too likely to
   be coincidental, not a frame. `--from-flagged` offers a weaker signal:
   mining repeated n-grams out of a single flagged draft with no edit to
   compare against, weighted at half strength per repeat so it can't reach
   promotion as fast as a real accepted edit can.

2. **Stage.** Nothing from step 1 is active yet. Each candidate accumulates
   a `confirmations` count as it's re-mined across multiple accepted edits.

3. **Promote, gated.** A human runs the review gate:

   ```
   node skills/deslop/scripts/promote.mjs              # dry run, default
   node skills/deslop/scripts/promote.mjs --apply       # writes
   ```

   Dry run prints what would be promoted, held back, or evicted, and writes
   nothing. `--apply` is required before anything is written — there is no
   flag that skips the dry run. Candidates at or above the confirmation
   threshold (default 3) move into `data/learned.json`; learned entries that
   haven't been reconfirmed in the staleness window (default 180 days) drop
   back to candidates for one more cycle before disappearing; each list is
   capped (default 150, seed and learned entries counted together) so a
   promotion run can't unboundedly grow what `analyze.mjs` scans.

Promotion is gated rather than automatic because the input is text a human
chose to cut, not a rule that's true in general — a phrase this writer edited
out of this draft is weak evidence on its own; only repetition across
multiple independent edits, and then a human's sign-off on the resulting
list, turns that into something worth flagging in someone else's draft. An
auto-promoting pipeline would let one unusual edit silently poison a shared
list.

### Seed lists vs. learned state

`data/phrases.json` holds the four curated seed lists this repo ships with —
committed, and never written to by any script. `data/learned.json` is where
`promote.mjs --apply` writes promoted entries; `data/candidates.json` is
where `learn.mjs` stages mining output. Both are gitignored: promoted and
staged entries carry example snippets pulled from whatever real text produced
them, and that text has no business in a public repository. `analyze.mjs`
merges the seed lists with `learned.json` when the latter exists; its
absence — the state of every fresh clone — is normal and silent. A malformed
`learned.json`, by contrast, is a hard error with a clear message, the same
treatment a malformed `phrases.json` gets: silently scanning with an empty
list would look exactly like "clean draft," which is a worse failure mode
than refusing to run. `data/learned.example.json` shows the shape without
shipping anyone's actual edited text.

Other things worth knowing about the scripts, because they look like
incidental defensiveness and aren't: writes to `phrases.json`, `learned.json`,
and `candidates.json` are all atomic (temp file + rename), because these
files are meant to live in a Syncthing-style replicated setup where a
half-written file is a real failure mode, not a theoretical one. Mined
phrases are built only from tokenizer word-matches, so nothing a user types
into a draft — including a regex metacharacter — can end up interpreted as
one once it's promoted.

## What this actually is, and isn't

Tools claiming to "humanize AI text" are a crowded category, and most of
them optimize for evading a detector — which is a different goal from
writing well, and often actively opposed to it. `deslop` doesn't do that.
It has no detector-evasion logic, no perplexity or burstiness maximization,
no injected typos, no banned-word list enforced by find-and-replace. Its
frontmatter says plainly not to imitate stereotypical human mistakes or add
randomness for its own sake.

What it does instead, concretely: it reports candidates for a human (or the
calling model) to judge rather than auto-editing anything; its automatic
learning is restricted to multi-word frames, never single words, and gated
behind a confirmation threshold and a manual `--apply`; and its analysis
output is explicitly framed as non-authoritative — the SKILL.md that drives
the editing behavior says outright that something unflagged can still be
wrong, and something flagged can be exactly right. None of these three
choices is exotic. Stated together, they're the actual shape of the tool,
and worth being specific about instead of claiming the field didn't already
exist.

## Installation

As a marketplace plugin:

```
/plugin marketplace add alenoi/deslop
```

then install the `deslop` plugin from that marketplace.

Manually, without the plugin system: copy `skills/deslop/` into
`~/.claude/skills/deslop/` (or a project's `.claude/skills/`) so the
directory contains `SKILL.md` directly.

## Reference files

`SKILL.md` points at two on-demand reference files, read only when they
apply:

- `skills/deslop/references/genre-adaptation.md` — guidance for
  technical/academic/fiction pieces or unclear genre expectations.
- `skills/deslop/references/hungarian.md` — Hungarian-specific phrasing and
  the Hungarian entries in the frozen and learnable lists.

## Script reference

All three scripts are zero-dependency Node 16+, live under
`skills/deslop/scripts/`, and support `-h`/`--help`.

**`analyze.mjs [--json] [<file>]`** — scans a draft, read from the file
argument or stdin. Exit 2 on a usage or read error; exit 0 otherwise — there
is no "fail" exit, since the script only reports.

```
node analyze.mjs draft.md
node analyze.mjs --json draft.md > report.json
cat draft.md | node analyze.mjs --json
```

**`learn.mjs --before <file> --after <file> [--category cliche_filler|forced_closure]`**
or **`learn.mjs --from-flagged <file> [--category ...]`** — mines
`data/candidates.json`. `--category` defaults to `cliche_filler`.

**`promote.mjs [--apply] [--threshold N] [--stale-days N] [--cap N] [--json]`**
— the review gate. Defaults: threshold 3, stale-days 180, cap 150. Without
`--apply`, nothing is written.

## License

MIT. See `LICENSE`.
