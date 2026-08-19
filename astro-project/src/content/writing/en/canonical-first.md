---
lang: en
title: "Cross-posting to dev.to without giving away your SEO"
date: 2026-08-21
description: "The canonical tag is not the hard part. The hard part is that your site has to exist, and be dated, before the copy does. I got that order wrong once and the mirror ended up seven days older than the original."
tags: [seo, webdev, devops, writing]
edicola: "Canonical-first on dev.to"
---

Every article I write lives on my own site first. A copy goes up on dev.to a day or two later, and that copy reliably gets more readers than the original does. One piece has 106 views over there. My own analytics can't honestly tell me how many humans read it here, which is a separate mess I wrote about last week.

So I am deliberately publishing my best work somewhere with more traffic than my site, under a domain I don't own. The thing that makes this a syndication strategy instead of a slow act of self-harm is one field in the dev.to API:

```js
const canonicalDi = (slug) => `https://marcobellingeri.dev/en/writing/${slug}`;
```

That is the whole trick, and it is also the least interesting part. What took me longer to learn is that canonical-first is not a field you set. It is an order you have to keep.

## What the tag actually buys you

When two URLs serve the same article, a search engine has to pick one to rank and one to treat as a duplicate. Left alone it will usually pick the one with more authority, which on any given week is dev.to and not you. `rel="canonical"` is how the copy points back and says the other one is the original.

dev.to honours this properly. Set `canonical_url` on a post and it renders the tag in the head, and it also shows a small line to readers saying the piece was originally published elsewhere, with a link. Some people click it. That link is worth more to me than the view count.

The part worth being precise about: the canonical is a hint, not a directive. Google treats it as one signal among several, and one of the others is which URL it saw first. That is where the ordering comes in.

## The house has to be older than the mirror

If dev.to publishes on Monday and your site publishes the same piece on Thursday, you have handed a crawler a strong reason to believe dev.to is the original and you are the copy, no matter what your tag says. You are asking it to disregard the evidence of its own crawl on the strength of an annotation.

So the rule my pipeline enforces is that the canonical URL must resolve, with the right date on it, before the mirror goes live. Not at the same time. Before.

This is enforced by refusing to publish. The workflow that talks to dev.to on every merge is only allowed to create drafts:

```yaml
on:
  push:
    branches: [main]
    paths: ["astro-project/src/content/writing/en/**"]
```

It runs `node engine/devto.mjs <slug>` with no `--publish` flag, ever. Merging an article deploys it to my site and leaves an unpublished draft sitting on dev.to. Nothing is live over there until a second, separate thing happens.

That second thing is a daily cron at 07:00 UTC that reads the `date` in each article's frontmatter and flips the ones whose day has arrived:

```
devto: niente in uscita oggi (2026-08-19)
DOMANI=
```

Most mornings it has nothing to do and says so. The same run also opens a GitHub issue listing anything going out tomorrow, which gives me a real 24 hour window to move a date or delete a file if a piece has aged badly since I wrote it. Nobody has to approve anything for publication to happen. Silence publishes. The one human decision is the merge, and it already happened.

## The date that lied

I would like to report that this held. In July I merged an article about source licences with `date: 2026-08-18` in its frontmatter, scheduling it for a Tuesday. In August I noticed it had been public on dev.to since the 11th.

Seven days before its own publication date.

It wasn't the draft workflow, which never passes `--publish`. It wasn't the cron, which skips future dates. It was me, publishing that one by hand from the dev.to UI weeks earlier and forgetting. The automation was innocent and had no way to notice.

What made it a real problem rather than an embarrassing one is what my own site was serving in the meantime. The article page builds its JSON-LD from that same frontmatter field:

```json
"datePublished": "2026-08-18"
```

So for seven days the canonical URL told every crawler that the original was published on the 18th, while the copy it pointed at was demonstrably live on the 11th. The one signal I control was actively arguing that my site came second.

The fix was a one line change to a date, which is the sort of fix that makes you want to check what class of thing it belongs to. It belongs to this one: the frontmatter date is not decoration. It is the claim my canonical makes about which came first, and anything that publishes outside the pipeline can make that claim false without touching the repository.

I also checked what would have happened on the 18th if I hadn't noticed. Nothing at all, as it turns out, because the cron skips pieces that are already live. The bug would have quietly persisted rather than announcing itself. Those are the ones worth going looking for.

## Re-running has to be free

The other property that matters is that pushing the same article twice must not create a second post. dev.to has no upsert, so the script builds one by asking what already exists and matching on the canonical URL:

```js
const canonicalPubblicati = (await publishedArticles()).map((a) => a.canonical_url);
```

Matching on canonical rather than on title means an edited headline updates the existing post instead of forking a duplicate, and duplicates are exactly what the canonical tag exists to prevent. A syndication script that can create two live copies of one article is doing the opposite of its job.

Editing a published piece and re-merging updates the draft body and leaves its published state alone. I have re-run the whole thing more times than I would like to admit while debugging, and it has never republished anything.

One more thing, since it belongs to the same function. The slug comes from a filename, gets interpolated into a URL, and gets used to open a file, so it is validated before either:

```js
if (!slug || !/^[a-z0-9-]+$/.test(slug)) { /* exit 1 */ }
```

Filenames in my own repository are not attacker controlled, and I validate them anyway. The check costs one line, and the day someone else can open a pull request against this repo is the day I would otherwise have to remember to add it.

## What I would check on your setup

If you already cross-post, three things are worth ten minutes.

Open the mirrored copy and view source. Confirm the canonical tag is actually there, because plenty of platforms accept the field and then drop the tag on some templates.

Then compare the two publication dates, not the two URLs. If any mirrored copy is older than the original it points at, your canonical is arguing against you right now, and no amount of correct configuration fixes an ordering you got backwards.

Then find whatever can publish outside your pipeline. A CMS button, a scheduled post, a colleague with access, you three weeks ago. Mine was me, and the automation I had spent a weekend making careful had no idea.

The tag is easy. Staying first is the work.
