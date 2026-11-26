# STE register

Read this file when REGISTER in SKILL.md says STE applies.

This file is a short own-wording summary of the writing style. It is not the ASD-STE100 standard. It does not include the standard text or the approved-word dictionary. Both are copyrighted. For a formal claim of STE conformance, use the official standard and a checker that has the dictionary.

## When STE applies

Use STE for internal technical English: tickets, commits, pull requests, docs, agent prompts, memory files, runbooks and similar text. Use it also when the user asks for it.

Do not use STE for essays, fiction, marketing copy or any text where the writer's voice is the product. Those texts keep the normal deslop rules.

## Two levels

| Level | Text | How strict |
|---|---|---|
| Internal English | Technical text, as listed above | 80-90%. Follow every rule below. Break a rule only when the sentence gets worse. |
| Hungarian, user-facing | Chat replies and questions to a person | About 50%. Use the structure rules in Hungarian. |

The 50% level for Hungarian has these rules:

- Give the text a clear structure.
- Use one term for one concept.
- Use the active voice.
- Write mostly short sentences.
- Allow a longer compound sentence where it reads better.

No Hungarian approved-word list exists. The analyzer checks only sentence length for Hungarian text.

## Rules

Sentences:

- A procedural sentence has 20 words or fewer.
- A descriptive sentence has 25 words or fewer.
- Write one instruction in each sentence.
- Use the imperative for an instruction: "Open the file." Do not write "The file should be opened."
- Use the active voice. Name the actor.
- Keep the articles (the, a, an). Do not drop them to save space.

Words:

- Give each word one meaning.
- Give each concept one word. Do not use synonyms for one term.
- Choose the simple, common word. Write "use", not "utilize". Write "start", not "commence".
- Do not use a noun with more than three nouns before it. Break the cluster with "of", "for" or a verb.
- Do not use an -ing form as a noun. Write "Check the file", not "File checking".

Paragraphs and lists:

- Keep a descriptive paragraph to 6 sentences or fewer.
- Put steps in a numbered list. Put parallel items in a bullet list.
- Start each step with a verb.

Exempt text: paths, identifiers, commands, flags and product names. They do not count toward word limits and keep their own spelling.

## How STE overrides deslop

STE and deslop agree on most points: plain words, no filler, no hedging, no decoration. They conflict in four places. In these places, STE wins.

- **Repeated terms.** Deslop treats a repeated term as a style issue. In STE, a repeated term is the target. Do not swap it for a synonym.
- **Sentence-length monotony.** Deslop flags runs of equal-length sentences. In STE, short sentences of similar length are correct. Do not vary them.
- **Paragraph-opener repetition.** Deslop flags paragraphs that open with the same words. In STE, the same opener is fine for parallel steps.
- **Rhythm and calibrated imperfection.** Do not add asides, long sentences or variety to sound human. Keep the plain sentence.

The voice contract narrows to three items. Keep the meaning. Keep the certainty. Keep the terms. Do not change a claim or its strength to fit a limit. If a sentence is too long, split it. If a term is wrong, replace it everywhere.

All other deslop rules stay in force: the priority order, epistemic fidelity, the anti-humanizer rules and the rule against invented detail. STE never permits a typo, a fake opinion or a change of meaning.

## The analyzer

```
node <skill-dir>/scripts/analyze.mjs --ste --json <path-to-draft>
```

The `--ste` flag adds one category, `ste_sentence_length`:

- A sentence over 20 words is a hit if it looks like an instruction. Its first word is not a determiner, pronoun, conjunction, preposition or auxiliary, and does not end in -s, -ed or -ing.
- Any other sentence is a hit over 25 words.
- Code spans, paths, identifiers and flags do not count.
- Hungarian sentences use the 25-word limit only.

The check is a guess. Read each hit in context. A sentence that starts with a noun gets the stricter limit and can be a false hit. The analyzer has no check for noun clusters, passive voice beyond the existing heuristic, word choice or paragraph length. Check those by reading.
