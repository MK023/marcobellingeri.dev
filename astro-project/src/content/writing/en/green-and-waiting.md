---
lang: en
title: "A week of green runs, and the pipeline was waiting for me"
date: 2026-09-08
description: "The magazine pipeline ran every morning for a week and reported success every time. It had produced nothing since the first of the month, because it was parked at a gate only I can open, and none of my alarms treats that as a state worth reporting."
tags: [devops, automation, monitoring, postgres]
edicola: "Eight green runs, no article"
---

On 1 September at 10:57 UTC the monthly ingest ran. It opened issue number 3 of the magazine, picked the vertical from the source registry, wrote 19 candidate sources into Postgres with `stage = 'discovery'`, and opened a GitHub issue telling me it was my turn.

Every morning after that, the daily job ran and succeeded. Eight consecutive green runs, from the first of the month to the eighth. The article count for September stayed at zero the whole time.

## The gate was doing its job

The daily job does not decide anything by itself. It asks the database which stage to run, and the answer depends on a view:

```sql
SELECT id, issue_id, source_url, tier, independent
FROM signals
WHERE stage = 'verify' AND (tier = 1 OR tier = 2 AND independent);
```

Nothing satisfies that view until I sit in Supabase Studio and tag the sources by hand. Tier 1 is a primary source, a regulator or the organisation that ran the thing. Tier 2 counts only when it is independent of whoever it describes, which rules out a consultancy writing up its own project as a case study.

That judgement is mine on purpose. It is the editorial bar of the magazine, and I did not want a model deciding what counts as proof of anything.

So the decision function found a draft issue with no verified signals, returned `niente`, and printed its reason to stderr:

```
advance: signal in attesa di verifica in Studio
```

Then it exited zero, which is correct. There was nothing for it to do.

## What my alarms actually watch

I have three, and I was fairly pleased with them.

A cron that fails opens a GitHub issue on its own. A cron that never starts is caught by a daily watchman that asks the GitHub API when each schedule last fired, because a schedule that GitHub has quietly disabled produces no failure to report. And because a watchman inside the same failure domain is not a watchman, that job also checks in with a Sentry monitor that alarms on silence from outside GitHub.

Between them they cover a job that breaks and a job that never runs. Neither of those happened. What happened was a job that ran, succeeded, and did nothing, for seven days, because it was waiting for a person who had not noticed.

## The information was already there

The part I find annoying is that nothing was hidden. The reason is written every single morning, in the run log, in Italian, on stderr. The job knows exactly why it is idle and says so out loud.

What it does not know is how long it has been saying it. `niente` on the second of the month and `niente` on the eighth are the same string, and the only thing that separates them is a week of my attention going somewhere else. No alarm reads that log line, and no counter turns it into a duration.

Green means the machine is healthy. I had been reading it as "the work is moving", and those are different claims.

## How it ended

On the eighth I opened Studio and tagged 11 of the 19 sources: two from the regulator as tier 1, nine analyst reports as tier 2 and independent. I left out a vendor case study, which fails the independence test by construction, and seven security bulletins whose scraped body is only a title.

After that the pipeline did the rest in a few minutes. Generate wrote the piece from eight sources, embed rebuilt the chunks, export produced the two markdown files, and the judge on the pull request failed me for weak attribution, which is a story for another post.

The September issue went out a week late. Nothing had broken, and every run had been green.

The next thing I build is not another alarm. It is a counter: the daily job already knows it is blocked, so it can also know since when, and say it where I actually look.
