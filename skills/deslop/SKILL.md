---
name: deslop
description: Rewrites or drafts text so it reads as a specific human who makes specific choices, not as generic AI output. Keeps the writer's intent, stance, certainty and voice. EDIT MODE treats an existing draft as the authoritative seed and makes the smallest edits that give a real improvement. GENERATE MODE drafts new text only when no usable draft exists. A bundled analyzer finds cliché and filler frames, forced closure, transition overuse, sentence-length monotony, paragraph-opener repetition, passive voice and generic-AI vocabulary. A REGISTER section applies ASD-STE100 style (Simplified Technical English) to internal technical English. Use before you return substantive written output. Triggers - "deslop this", "de-slop", "run deslop", "make this sound human", "remove the AI tone", "this reads as AI-written", "tighten this without losing my voice", "humanize this text", "STE", "ASD-STE100", "simplified technical english", "STE stílusban", "írd át STE szerint", "szűrd ki az AI-s szagot a szövegből", "ne legyen ennyire gépi", "legyen emberibb a szöveg". Not for translation, fact-checking, or a client-facing voice or brand pass that a project already has. For client text, use that project's own voice skill.
---

# DESLOP

Read `references/genre-adaptation.md` for technical, academic or fiction text, or when the genre is unclear. Read `references/hungarian.md` for Hungarian text. Read `references/ste.md` when REGISTER says STE applies.

## PURPOSE

Make writing sound like a specific human who makes specific choices.

Do not optimize for "AI detector evasion". Do not imitate human mistakes. Do not add randomness for its own sake. Optimize for fidelity to the writer's intent and persona. Add meaningful specificity, non-formulaic structure, selective explanation, natural rhythm and economical language.

The goal is not "less polished". The goal is "less statistically generic".

## CORE PRINCIPLE

Human-sounding writing is not quirks added to generic prose. It comes from the writer's choices. The writer decides what to notice, what the reader already knows, what to leave implicit, how certain to be, and where to stop. Keep or rebuild these choices. Prefer authorial decisions to stylistic decoration.

## REGISTER

STE applies in two cases:

- The text is internal technical English: a ticket, commit, PR, doc, agent prompt or memory file.
- The user asks for STE, ASD-STE100 or Simplified Technical English.

In these cases, read `references/ste.md` and run the analyzer with `--ste`. The STE rules override the deslop rules that conflict with them. The voice contract then narrows to three items: keep the meaning, the certainty and the terms.

All other text keeps the voice-preservation rules in this file.

## MODE

**EDIT MODE** applies when the user gives an existing draft. Treat the draft as the authoritative seed. Keep its meaning, stance, certainty, idiosyncrasies, characteristic vocabulary and intentional roughness. Do NOT silently regenerate the passage into your default voice. Prefer a local edit to a paragraph rewrite, and a paragraph rewrite to a full rewrite. Escalate only when the existing structure is the problem.

**GENERATE MODE** applies only when no usable draft exists, or the user asks for a fresh draft. First infer the purpose, audience, register, writer-reader relationship, stance, certainty and genre. If the user gave writing samples, anchor to them. Do not invent biographical experiences, anecdotes, opinions, emotions, quotes or personal history. When the writer is unknown, stay specific about the subject, not about an invented person.

## PRIORITY ORDER

When principles conflict, use this order. (1) factual and semantic fidelity, (2) writer and persona fidelity, (3) communicative purpose, (4) structural naturalness, (5) specificity, (6) concision, (7) sentence-level style. Never improve surface style at the cost of meaning or identity.

Structural naturalness (4): look for over-regularity. Examples: every section has the same shape, a mechanical claim-explanation-example-summary pattern, a forced three-part structure, throat-clearing, a conclusion that repeats the intro. Break the pattern only when that improves the piece. Never break it to simulate humanity. Not every piece needs a moral or a recap. End when the task is done.

Specificity (5): prefer grounded detail to generic language. Use detail that distinguishes the case, shows a cause or trade-off, or shows who did what. Do not add decorative detail (arbitrary numbers, fake names) to look human. Write "Support tickets grew 40% while active users grew 8%." Do not write "Customer support faced significant challenges during a period of growth."

Concision (6) includes information selection. Cut an explanatory sentence if the reader does not need it to follow the next one. Trust the reader to infer the obvious.

## VOICE CONTRACT

Before you edit or generate, silently infer a voice contract in six dimensions:

- **formality** (casual to literary)
- **directness** (blunt to diplomatic)
- **certainty** (tentative to confident)
- **energy** (restrained to enthusiastic)
- **density** (compressed to explanatory)
- **personality** (only traits that the text or request supports)

Do not push these toward professional, positive, confident, inspirational or polished. Those are model defaults, not improvements.

## Run the analyzer first

In EDIT MODE, scan the draft before you edit:

```
node <skill-dir>/scripts/analyze.mjs --json <path-to-draft>
```

You can also pipe the draft through stdin. Add `--ste` when REGISTER applies. GENERATE MODE has no draft to scan. Skip this step and write from the sections above.

The script never edits and never decides that a hit is wrong. It gives candidates in seven categories, and you judge each one:

- **cliche_filler**: delete it, state the point directly, or use something specific to the context. Never use a more elaborate synonym.
- **forced_closure**: keep it only if it does interpretive work that the text before it did not do.
- **transition_overuse**: cut it where adjacency or a repeated noun already carries the link.
- **sentence_length_monotony**: vary only where the thought structure supports it. Repetition can be right.
- **paragraph_opener_repetition**: vary if accidental. Keep if deliberate parallelism.
- **passive_voice_heuristic**: fix only where the passive hides the actor without a purpose. Expect false positives (adjectival copulas, intentional passives). Never ban the passive globally.
- **lexical_candidates**: replace only if the word is wrong here. A hit is not proof.

A flag is a candidate to judge, not an instruction. Structure and epistemic drift are not mechanical, so the script cannot flag them. A flagged item can be exactly right.

## Learning from accepted edits

After the user accepts an EDIT MODE edit, give the before and after texts to the learner. The learner improves its cliché and filler frames from real edits. If only the in-memory version exists, write the pre-edit text to a temp file.

```
node <skill-dir>/scripts/learn.mjs --before <original> --after <edited>
```

The learner mines only multi-word frames, into a staging file. It never mines single words and never writes to the active lists. A flagged candidate stays a candidate until a separate, explicit review promotes it. Run `node scripts/promote.mjs` (a dry run), then `--apply`.

## LEXICAL POLICY

There is no static blacklist of "AI words". Do not assume a word is bad because AI often uses it. This is why `lexical_candidates` reports locations, not verdicts. Judge each word in context. A common word can be exactly right. A rare word can be painfully artificial. Replace only vague, inflated, formulaic or register-inconsistent words. Keep ordinary language where it works.

## RHYTHM

Natural rhythm follows thought, not random sentence length. Avoid long stretches of sentences with the same length, opening and structure. Do not make variation when repetition is useful. These are fine when they fit the writer and genre: short and long sentences, unequal paragraphs, asides, a conjunction at the start, deliberate repetition. Never use them as manufactured texture. Never add typos or grammar errors.

## CALIBRATED IMPERFECTION

Do not "perfect" away meaningful texture. Examples: a strong preference, an asymmetric argument, a short aside, an open reservation, dry humor, stylistic repetition. Keep it when it fits. Never add imperfection because "humans are messy". Real irregularity comes from thought, voice or context, never from manufacture.

## EPISTEMIC FIDELITY

Never make the writer sound more certain than the evidence supports. "I think this is probably the cause" must not become "This is the cause." "The results were mixed" must not become "The results demonstrate...". Do not add confidence, optimism, outrage or moral certainty unless the source text or the requested tone supports it.

## PERSONA FIDELITY

The finished text must still plausibly belong to the same person. It must not sound like a generic consultant, marketer, academic or motivational speaker. Test: would the original writer say "this still sounds like me"?

## ANTI-HUMANIZER RULES

Never humanize a text with these methods:

- inserting typos or grammar mistakes
- using rare synonyms
- banning em dashes or bullet points
- adding random slang, filler, fake uncertainty or fake opinions
- inventing personal experiences
- chopping sentences at random
- maximizing "perplexity" or "burstiness"
- making the text worse in any other way

These methods copy stereotypes of human writing. They do not improve authorship.

## OUTPUT BEHAVIOR

Return only the finished text, unless the user asks for commentary. Do not add a preface such as "Here is the revised version". Do not explain the edits unless asked. Keep the formatting when asked. A request for a light edit gets a light edit. A request for an aggressive rewrite gets a free rewrite.

Do not confuse human with casual, professional with generic, clear with over-explained, specific with decorative, or varied with random.

## FINAL INTERNAL PASS

Before you return the text, silently check the items below. Fix each failure.

- **Meaning**: did a claim, fact, number, stance or certainty change? Restore it, unless the user asked for a substantive rewrite.
- **Persona**: does the writer sound more polished, confident or enthusiastic than before? Undo the drift.
- **Structure**: did unnecessary explanation, forced balance or an obligatory conclusion stay? Remove it.
- **Specificity**: is a claim generic where grounded detail exists? Make it concrete.
- **Restraint**: did you add anything only to sound impressive or human? Delete it.
- **Rhythm**: does the same sentence or paragraph shape repeat by accident? Adjust it. In STE, repetition is correct.
- **Naturalness**: would a competent person here choose these words? If not, simplify.

The target is a text that feels chosen, not completed.

## PROVENANCE

The rules come from a review of human-versus-AI writing research, not from tests of `deslop` output. No A/B evaluation exists, and the STE register is not validated. Three findings carry the design. AI generation leaves a stylometric footprint that AI editing mostly does not (so EDIT MODE preserves). Narrative and structural features separate human from AI writing more than surface slop does (so structure comes first). Once flagged, "AI words" go in and out of fashion, but their fit to a sentence does not (so no blacklist). Citations: README.md, "Where the design comes from."
