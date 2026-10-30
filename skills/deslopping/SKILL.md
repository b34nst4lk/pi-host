# Deslopping: strip the AI tells, from code and prose

Synthesised from [stephenturner/skill-deslop](https://github.com/stephenturner/skill-deslop)
(prose), [peteromallet/desloppify](https://github.com/peteromallet/desloppify) and
[millionco/deslop-js](https://github.com/millionco/deslop-js) (code).

"Slop" is text or code that looks finished and is not: it repeats the shape of work
without doing it. Deslopping is removal, not rewriting. The test is always the same —
would a specific human, who had to maintain this, have written it this way?

## Code slop: the tells

| Tell | What it looks like | Fix |
|---|---|---|
| Narration comments | `// loop over the entries`, `// return the result` | delete; keep only why-not-obvious |
| Ceremony | wrapper that only forwards; helper used once; `getX()/setX()` over a plain field | inline it |
| Optionality nobody sets | config flags, `options` bags, generics, params with one call site | delete the option |
| Speculative future | "for later", `TODO: support X`, abstraction with one implementation | delete, or one `shortcut:` line |
| Defensive noise | try/catch that rethrows identically, null checks on non-nullable values, `if (x)` around a value used anyway | delete, keep boundary validation |
| Re-implemented stdlib | hand-rolled clamp, deep-equal, path join, URL parse | use the platform |
| Duplicated canonical logic | the same rule in two places that must change together | one function, callers moved |
| Premature split | three 4-line private helpers so one 15-line function reads shorter | one function, split by job not by line count |
| Restating types | comments repeating a signature, cast-to-same-type round trips | delete |
| Comment banners | `// ===== Section =====` around 5 lines | delete |
| Emoji / unicode decoration in code and logs | ✅❌ arrows in machine-parsed output | plain ASCII unless already the house style |
| Test theatre | asserts on things the test itself just set, tests that pass with the body deleted | make it fail first |
| Blown-up error text | 3 sentences of apology where 1 clause is true | one clause, what failed and where |

Procedure: read the diff, name each slop instance with `file:line` and the tell from the
table, then delete. Prefer one commit per tell-class; run the gates after each. Report
`<N> tells, <M> lines deleted, gates: <result>` — deletions are the score.

Never deslop away: boundary validation, error handling that prevents data loss,
security checks, accessibility, load-bearing comments explaining a workaround.

## Prose slop: the tells

Cut filler: throat-clearing openers ("Here's the thing:"), emphasis crutches ("Let that
sink in."), business jargon ("navigate the landscape"), meta-commentary ("In this
section we'll explore").

Break formulaic structures: binary contrasts ("Not X. Y."), negative listings
("Not a X. Not a Y. A Z."), dramatic fragments ("Speed. That's it."), self-posed
questions ("The result? Devastating."), anaphora and tricolon abuse.

Kill tropes: "quietly" and other magic adverbs, "delve"/"tapestry"/"nuanced", the
"serves as" dodge, false ranges ("from X to Y" that means nothing), superficial
participles ("highlighting its importance"), invented labels ("the supervision
paradox"), stakes inflation, patronising analogies, false vulnerability.

Then: active voice with a named actor ("the team fixed it", not "the complaint becomes a
fix"); be specific — no "experts argue", no lazy "always/never/every"; match register
("you" in a blog, "we" plus citations in a paper); vary rhythm — two items beat three,
no em dashes, no fragments for emphasis, no listicle disguised as prose; trust readers —
no "let's break this down", no fractal summary (say it, then say it again, then recap).

Formatting tells: bold-first bullets, unicode arrows, em dashes, signposted
conclusions ("In conclusion"), "Despite these challenges…".

Do not dilute: no hedge stacking ("may potentially"), no both-sidesing a measured
result, no added caveat that the evidence does not support.
