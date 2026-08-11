---
lang: en
title: "Thirteen PRs in one afternoon, and the boring rule that made it possible"
date: 2026-04-15
description: "I planned six changes and expected to finish two. Six hours later thirteen were live, and the thing that kept it upright was not the speed."
tags: [ai, python, claude, programming]
edicola: "Tredici PR"
---

I sat down one afternoon with a list of six things I wanted to ship to JobSearch, the job hunting tool I wrote for my own job hunt and then kept running in production for exactly one user. Three small features, two pieces of tech debt, and one refactor I had been avoiding for a month because it deleted a safety net and replaced it with a promise.

I expected to finish two of them. Maybe three if the afternoon went well.

Six hours later thirteen pull requests were merged into `main`, every one of them green, every one of them live. I have gone back over that day more than once since, because the interesting part is not the number. Thirteen is a number I got by accident. The part worth writing down is the rule I followed without thinking about it, which is the only reason the number did not turn into an outage.

## What was actually on the table

JobSearch is a FastAPI application with PostgreSQL and Redis behind it, deployed on Render. Nothing exotic. At the time it had 394 tests and a CI pipeline with nine stages: linting, formatting, a security scanner, a dependency audit, stylelint, CodeQL, the test suite, a Docker build, and the deploy. It is a real production app with a user base of one, and that one user files very detailed bug reports.

I started by asking Claude to plan the work rather than do it. What came back was a six PR roadmap ordered by risk, cheapest and safest first, with the refactor I was scared of sitting last. I changed two things about the order and then we just started walking down it. That planning step is the only reason the afternoon had a shape at all. Without it I would have opened the scary one first, because that is what I always do.

## The rule

Every single PR went the same way, with no exceptions and no shortcuts when I got tired:

1. Branch from the latest `main`.
2. One concern per branch. Never a bug fix riding along with a feature.
3. Tests written for the change.
4. Push, wait for nine green checks, merge, delete the branch.
5. Pull `main`, then start the next one.

Written down it looks like the first page of any guide to working with git, and I know how unremarkable it sounds. It is also the whole answer. No two branches were ever open at the same time, so no two changes ever had to be reasoned about together, so no merge ever produced a surprise. When something did go wrong, and it did, the surface area of what could have caused it was one small diff, not six overlapping ones.

We never rolled anything back. Production never broke. Not because we were careful in some heroic way, but because at any moment there was only one thing in flight.

## Who did what

Claude did the typing and most of the verification. I did the decisions and the order.

That split sounds like a slogan, so here is what it looked like in practice. On two of the thirteen PRs I threw away the first proposal, not because the code was wrong but because it had quietly grown: I asked for a fix and got the fix plus a small refactor of the module around it plus a new helper that nothing else would ever call. Both times the second attempt was a third of the size and did exactly what I asked. Scope creep is the failure mode I watch for now. It arrives helpfully.

I also read every diff before merging. All thirteen. This is the part people skip when they describe pair programming with a model, and it is the part that makes the rest of it safe.

## The claim I stopped believing

Twice that afternoon Claude told me the test suite was passing, and twice it was not.

Both times the mechanism was the same. A slow test had been skipped locally, the summary line said everything else was green, and the report I got was true about what had run and silent about what had not. Running `pytest` myself took ten seconds. Believing the summary would have cost a full CI cycle each time, and worse, it would have taught me that the summary is worth believing.

That is now a habit rather than a rule: when the report is about whether we are allowed to proceed, I check the report myself. Not out of suspicion. It is just that a claim about the state of the world and the state of the world are two different objects, and only one of them blocks a merge.

## The one I was afraid of

The last PR on the list deleted about 250 lines of code whose only job was repairing JSON that Claude had just written, and replaced the whole thing with Anthropic's tool use and a forced schema. Net delta across the client and its tests was around 370 lines removed.

It went out alone, last, behind its own flag, with nothing else in flight. And it introduced a bug that took until the next morning to notice, because the bug was not in the code. It was in a prompt rule that had been surviving on ambiguity. I wrote that one up separately, in [from parsing JSON in the text to Claude's tool use](/en/writing/tool-use-jobsearch), because it deserves its own piece.

The relevant bit here is that the riskiest change was the easiest one to diagnose the next day. One PR, one concern, one diff to reread. If it had shipped in the middle of the pile with four other things, I would have spent that morning bisecting instead of thinking.

## What I would keep

Plan before you execute, even for an afternoon. Especially for an afternoon, because that is when the temptation to just start is strongest.

Keep the reviews. The model writes faster than you read, and that gap is where the mistakes live.

And keep the boring rule. One branch, one concern, wait for green. It is not a productivity technique and it does not feel fast. It is what let me work for six hours at that pace without ever being in a position where I could not explain what was running in production.
