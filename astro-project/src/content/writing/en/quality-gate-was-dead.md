---
lang: en
title: "My quality gate wasn't strict. It was dead."
date: 2026-08-11
description: "An LLM-as-a-judge gate failed every content PR for weeks. It looked like a high bar. It was a 400 from the API, and the error message only named half the problem."
tags: [testing, ai, devops, api]
edicola: "Il gate morto"
---

There is a job in my CI called `judge`. It reads the monthly issue my content pipeline writes, scores it against a rubric with five criteria, and blocks the merge if anything comes back at 2 out of 5 or lower. An LLM grading an LLM, with a written policy about what counts as broken.

It went red on a content PR this week. My first thought was that the piece was weak. My second thought, about four minutes later, was worse: this gate had been red on every content PR for a while, and I had been reading that as a high bar.

It wasn't a high bar. The job never reached the rubric at all.

```
Error: anthropic messages -> 400: output_config.format.schema:
For 'integer' type, properties maximum, minimum are not supported
```

The judge asks the model for structured output, and the schema it sends had this in it:

```js
voto: { type: "integer", minimum: 1, maximum: 5 },
```

Which is correct JSON Schema, and which the structured output layer rejects. The request never made it to the model. The job exited 1 before scoring a single word.

A gate that cannot go green is not enforcing anything. It has the same effect on your pipeline as `continue-on-error`, except it also makes you feel virtuous while it does nothing.

## The error message named half the problem

The obvious fix is to delete `minimum` and `maximum` and move on. I nearly did. What stopped me was noticing that the schema had a second kind of constraint in it:

```js
motivo: { type: "string", maxLength: 300 },
```

Length constraints are rejected too. `maxLength`, `minLength`, `pattern`, `minItems`, all of it. My schema had three of them, and the 400 mentioned none, because validation stops at the first failure. If I had fixed what the message named, I would have pushed, waited for CI, and collected the next 400. Then the one after that.

This is a general property of error messages, not a quirk of one API: they report the first thing that broke, not the set of things that are broken. The fix that only addresses what the message says is a fix sized to the message, not to the defect.

The other thing worth knowing here: the Python and TypeScript SDKs strip unsupported constraints for you before the request goes out. My pipeline is zero-dependency and calls the API with native `fetch`, so nobody was stripping anything. If your SDK has been quietly saving you, you will find out the day you drop it.

## So the test is about the contract

I could have written a test asserting no `minimum` on integers. It would have passed, and it would have been useless three weeks later when someone adds a `pattern` to a string.

Instead the accepted and rejected keywords are written down once, and every schema I send to the API gets checked against them:

```js
const RIFIUTATE = new Map([
  ["minimum", "numeric constraint"],
  ["maximum", "numeric constraint"],
  ["maxLength", "length constraint"],
  ["pattern", "string constraint"],
  // ...
]);

export function keywordRifiutate(schema, path = "$") { /* walks the tree */ }
```

It walks nested schemas, and it knows that inside `properties` the keys are my field names rather than schema keywords, so a field genuinely called `pattern` doesn't trip it.

On first run it found sixteen violations across the judge schema. Not two. My generation schema, checked at the same time, was already clean, which I would not have bet on.

There is a second check next to it that lists keywords the contract doesn't mention. It fails rather than allowing them, which sounds aggressive for something the API might accept fine. The reason is that I want the moment where somebody adds an unfamiliar keyword to be the moment somebody reads the docs, instead of the moment CI goes red for a reason nobody connects to the schema.

## Where the constraint went

The rubric still runs on a 1 to 5 scale. That range now lives in the two places the API can't reject it.

The prompt describes it, with each score defined. And the code treats an out-of-range score the way it already treats a missing one:

```js
const fuoriScala = (v) => !Number.isInteger(v) || v < 1 || v > 5;
```

Fail closed. If the model returns a 7, the rubric is unreadable, and an unreadable rubric doesn't promote anything. That was already the policy for a criterion the model forgot to fill in. A score outside the scale is the same class of problem, so it gets the same answer.

Moving a constraint out of a schema usually means giving it up. Here it just meant enforcing it somewhere with a worse reputation and better reach.

## What I'd check on your own pipeline

Grep your CI history for a job that has never been green. Not "was red today", never green at all, or not since some commit that had nothing to do with it. That job is not protecting you, and it is currently costing you the specific kind of comfort that comes from thinking it is.

Mine ran for weeks. It was the most reassuring line in the workflow file.
