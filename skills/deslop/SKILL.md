---
name: deslop
description: Rewrites or drafts text so it reads as a specific human making specific choices, instead of generic AI output — preserves the writer's actual intent, stance, certainty, and voice rather than adding stereotypical "human" quirks, typos, or randomness meant to evade AI detectors. Two modes: EDIT MODE treats an existing draft as the authoritative seed and makes the smallest edits that produce a meaningful improvement (preserve meaning, stance, certainty, idiosyncrasies — never silently regenerate into a default voice); GENERATE MODE drafts fresh only when no usable draft exists, inferring purpose/audience/register/genre without fabricating biographical detail, anecdotes, or quotes. Runs a bundled mechanical analyzer (cliché/filler frames, forced closure, transition overuse, sentence-length monotony, paragraph-opener repetition, a passive-voice heuristic, generic-AI vocabulary) plus a structural pass (over-regular sections, forced three-part structure, obligatory conclusions) and an information-selection pass (cut what the reader can already infer). Use before returning any substantive written output — a report section, an email, a document draft, a rewritten paragraph — where genericness, hedging, forced balance, or over-explanation would flatten the writer's actual voice. Trigger on "deslop this", "de-slop", "run deslop", "make this sound human", "remove the AI tone", "this reads as AI-written", "tighten this without losing my voice", "edit this the way I'd actually write it", "humanize this text", "szűrd ki az AI-s szagot a szövegből", "ne legyen ennyire gépi", "legyen emberibb a szöveg", "vedd ki belőle az AI-s fordulatokat". Not for translation, fact-checking, or a project's own client-facing voice/brand compliance pass where one already exists — defer to that project's own voice skill when the piece is going to its client; use this one everywhere else, or when no project-specific voice skill applies.
---

# DESLOP

Read `references/genre-adaptation.md` for technical/academic/fiction pieces or unclear genre expectations; `references/hungarian.md` for Hungarian-language text.

## PURPOSE

Make writing sound like a specific human making specific choices.

Do not optimize for "AI detector evasion," imitate stereotypical human mistakes, or add randomness for its own sake. Optimize for fidelity to the writer's actual intent and persona, meaningful specificity, non-formulaic structure, selective explanation, natural rhythm, precise and economical language.

The goal is not "less polished" — it's less statistically generic.

## CORE PRINCIPLE

Human-sounding writing isn't quirks added to generic prose. It comes from preserving or reconstructing what this writer notices, cares about, assumes the reader knows, leaves implicit, how certain they are, and where they decide to stop. Prefer authorial decisions over stylistic decoration.

## MODE

**EDIT MODE** — whenever the user provides an existing draft. Treat it as the authoritative seed: preserve meaning, stance, certainty, idiosyncrasies, characteristic vocabulary, intentional roughness. Do NOT silently regenerate the passage into your default voice. Local edit > paragraph rewrite > full rewrite — escalate only when the existing structure itself is the problem.

**GENERATE MODE** — only when no usable draft exists or a fresh draft is explicitly requested. Infer purpose, audience, register, writer/reader relationship, stance, certainty, genre first. If the user supplied writing samples, anchor to those. Do not invent biographical experiences, anecdotes, opinions, emotions, quotes, or personal history — when the writer is unknown, stay specific about the subject, not about a fabricated person.

## PRIORITY ORDER

When principles conflict, in this order: (1) factual and semantic fidelity, (2) writer/persona fidelity, (3) communicative purpose, (4) structural naturalness, (5) specificity, (6) concision, (7) sentence-level style. Never improve surface style at the expense of meaning or identity.

Structural naturalness (4): watch for over-regularity — every section the same shape, mechanical claim→explanation→example→summary, forced three-part structure, throat-clearing, a conclusion that just repeats the intro — and break it only when that improves the piece, never to simulate humanity. Not every piece needs a moral or a recap; end when the task is done.

Specificity (5): prefer grounded detail over generic language when it distinguishes the case, reveals a cause or trade-off, or clarifies who did what — not decorative specificity (arbitrary numbers, fake names) added to look human. E.g. "Support tickets grew 40% while active users grew 8%" over "Customer support faced significant challenges during a period of growth."

Concision (6) includes information selection: cut an explanatory sentence if the reader doesn't need it to follow what comes next. Trust the reader to infer the obvious.

## VOICE CONTRACT

Silently infer a compact voice contract before editing or generating, across six dimensions: **formality** (casual…literary), **directness** (blunt…diplomatic), **certainty** (tentative…confident), **energy** (restrained…enthusiastic), **density** (compressed…explanatory), **personality** (only traits the text or request actually supports). Do not automatically push these toward professional/positive/confident/inspirational/polished — those are model defaults, not improvements.

## Run the analyzer first

In EDIT MODE, before editing, scan the draft:

```
node <skill-dir>/scripts/analyze.mjs --json <path-to-draft>
```

(or pipe it via stdin). GENERATE MODE has no draft to scan — skip this and write from the sections above.

The script never edits and never judges a hit as wrong — just candidates in seven categories, each still needing your judgment:

- **cliche_filler** — delete, state the point directly, or replace with something context-specific; never a more elaborate synonym.
- **forced_closure** — keep only if it does real interpretive work the preceding text didn't already do.
- **transition_overuse** — cut where adjacency or a repeated noun already carries the link.
- **sentence_length_monotony** — vary only where thought structure supports it; repetition can be right.
- **paragraph_opener_repetition** — vary if accidental, keep if deliberate parallelism.
- **passive_voice_heuristic** — fix only where it hides the actor without purpose; expect false positives (adjectival copulas, intentional passives), never ban passive globally.
- **lexical_candidates** — replace only if the word is actually wrong here. A hit is not proof.

A flag is a candidate to judge, not an instruction. Something unflagged can still be wrong (structure, epistemic drift — not mechanical); something flagged can be exactly right here.

## Learning from accepted edits

After an EDIT MODE edit is accepted, feed the before/after pair to the analyzer's learner so its cliché/filler frames improve from real edits (write the pre-edit text to a temp file if only the in-memory version exists):

```
node <skill-dir>/scripts/learn.mjs --before <original> --after <edited>
```

This only mines multi-word frames into a staging file — never single words, and never the active lists directly. A flagged candidate stays a candidate until a separate, explicitly-run review promotes it: `node scripts/promote.mjs` (dry run), then `--apply`.

## LEXICAL POLICY

No static blacklist of "AI words," and no assuming a word is bad because AI often uses it — why `lexical_candidates` reports locations, not verdicts. Evaluate in context: a common word can be exactly right, a rare one painfully artificial. Replace only vague, inflated, formulaic, or register-inconsistent vocabulary; keep ordinary language where it works.

## RHYTHM

Natural rhythm follows thought, not randomized sentence length. Avoid prolonged stretches of same-length, same-opening, same-structure sentences — but don't manufacture variation when repetition is useful. Short/long sentences, unequal paragraphs, asides, a conjunction-led sentence, deliberate repetition: fine when they fit the writer and genre, never as manufactured texture. Never add typos or grammar errors to simulate humanity.

## CALIBRATED IMPERFECTION

Don't "perfect" away meaningful texture — a strong preference, an asymmetric argument, a brief aside, an unresolved reservation, dry humor, stylistic repetition — preserve it when it fits. But never add imperfection just because "humans are messy": authentic irregularity comes from thought, voice, or context, never from manufacture.

## EPISTEMIC FIDELITY

Never make the writer sound more certain than the evidence supports. "I think this is probably the cause" does not become "This is the cause." "The results were mixed" does not become "The results demonstrate..." Do not add confidence, optimism, outrage, or moral certainty unless the source text or requested tone supports it.

## PERSONA FIDELITY

The finished text should still plausibly belong to the same person — not a generic consultant, marketer, academic, or motivational speaker. Test: "would the original writer say this still sounds like me?"

## ANTI-HUMANIZER RULES

Never humanize by deliberately: inserting typos or grammar mistakes, swapping in rare synonyms, banning em dashes or bullet points, adding random slang/filler/fake uncertainty/fake opinions, inventing personal experiences, chopping sentences at random, maximizing "perplexity" or "burstiness," or otherwise making the text worse. These manipulate stereotypes of human writing instead of improving authorship.

## OUTPUT BEHAVIOR

Unless asked for commentary, return only the finished text — no "Here is the revised version" preface, no explaining edits unless requested. Preserve formatting when asked. Light edit requested → light edit; aggressive rewrite requested → rewrite freely.

Don't mistake human for casual, professional for generic, clear for over-explained, specific for decorative, or varied for random.

## FINAL INTERNAL PASS

Before returning the text, silently check, and fix what fails:

- **Meaning** — any claim, fact, number, stance, or certainty changed? Restore unless substantive rewriting was requested.
- **Persona** — writer sounding more polished/confident/enthusiastic than they were? Undo the drift.
- **Structure** — unnecessary explanation, forced balance, or an obligatory conclusion left in? Remove it.
- **Specificity** — generic claims where grounded detail exists? Make them concrete.
- **Restraint** — anything added just to sound impressive or human? Delete it.
- **Rhythm** — same sentence/paragraph shape repeating accidentally? Adjust.
- **Naturalness** — would a competent person here actually choose these words? If not, simplify.

The target is a text that feels chosen rather than completed.
