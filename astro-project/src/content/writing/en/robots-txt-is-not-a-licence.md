---
lang: en
title: "A permissive robots.txt is not a licence"
date: 2026-08-18
description: "I audited ten sources my scraper had been reading for a month. Two passed. The one that let every crawler in granted me nothing, and the one that blocked bots would have been fine."
tags: [webdev, legal, ai, opensource]
edicola: "robots.txt is no licence"
---

I have a scraper that watches ten sites I consider adjacent to my work. It has been running since early July. The output goes into a vector store that nothing currently reads, which is the only reason this story ends without a lawyer in it.

I audited those ten sources this week, against the same bar I use for the security feeds on my site: the licence has to permit commercial reuse in writing. My site sells things. Ambiguous means no.

Two passed. Eight didn't. And the pattern in the failures was not the one I expected.

## The two questions are not the same question

Here is Simon Willison's robots.txt, which is about as welcoming as they come:

```
User-agent: ChatGPT-User
Disallow:

User-agent: *
Disallow: /admin/
Disallow: /search/
```

An explicit allow for an AI user agent. No GPTBot block, no Google-Extended block, nothing. My scraper is welcome.

Now the footer of that same site: a copyright symbol and a list of years. No licence. No terms page. Nothing that grants me the right to republish a line of it on a page that sells consulting.

And here is Troy Hunt's footer, on a site whose robots.txt blocks nothing interesting either:

> Copyright 2026, Troy Hunt. This work is licensed under a Creative Commons Attribution 4.0 International License. In other words, share generously but provide attribution.

That is a licence. It says what I may do and what I owe in return. Under my own admission rule, Troy Hunt is in and Simon Willison is out, and it has nothing to do with which of them is friendlier to crawlers.

The two questions are separate, and only one of them is the one I need answered:

- robots.txt answers "may your bot fetch this page?"
- the licence answers "may you republish what your bot fetched?"

A site can say yes to the first and stay silent on the second. Silence is not a yes. It is the absence of one, which under my rule is a no.

## Both of them, in both directions

The inverse showed up too. Julia Evans' robots.txt contains, in ASCII art large enough to be unmissable:

```
NO LLM PLZ
```

plus a `Disallow: /` for GPTBot. It could not be clearer. What it is not, technically, is a licence restriction: `/license`, `/licence`, `/copyright` and `/terms` all 404, and the footer says only "© Julia Evans."

So a lawyer might tell me that robots.txt is not a contract, and that the absence of an explicit prohibition leaves me room. I don't want that room. A person wrote NO LLM PLZ in ASCII on their own website. That is the clearest possible statement of intent, and building a business on top of the gap between what someone stated and what they happened to make enforceable is a bad way to run a business that sells trust.

I gave that verdict its own name. Not "out" for licensing reasons, but out by intent. It documents that we read the wish and honoured it, rather than losing the distinction in a spreadsheet where every rejection looks the same.

The Pragmatic Engineer's newsletter turned out to be the most precise of all of them, with a header I hadn't seen in the wild before:

```
Content-Signal: search=yes, ai-input=yes, ai-train=no
```

Retrieval yes, training no. That is a genuinely useful signal, and I am glad someone is putting it in machine-readable form. It still isn't a reuse licence, so the source is out for me, but for once I knew exactly what the author wanted.

## The failure isn't the audit, it's when I ran it

Eight sources out of ten failed, and I could tell you that finding it is the win. It isn't. The scraper ran for a month against sites that had said no in writing, and the only reason nothing was published is that the retrieval path on top of that store doesn't exist yet.

That is luck, not a control.

The licence gate belongs at the moment a source is admitted. Not at the moment its content is first served, which is where I had implicitly put it by thinking of the whole thing as "internal, for now". Internal is a property of today's architecture. The scraping happened anyway.

Two things went into the repo alongside the deletions. The verdicts, each with a verbatim quote and a link to the page I read it on, in the same compliance file I already keep for the site's public feeds. And a note, in plain sight, that the public feeds have a CI test which fails when a source has no written licence, while the internal roster has no such test, because it lives in a database and my test suite runs without network. That gate is a human reading a file. It is a declared ceiling, not a control, and writing it down as such is the difference between a limitation and a surprise.

## The short version

Check both, in both directions.

A crawler-friendly robots.txt with no licence gives you access and no rights. A hostile robots.txt on a CC BY site gives you rights you probably shouldn't take. The combination you want is a written grant, and the only way to find it is to open the licence page yourself.

The scraper never had to ask. That was the whole problem.
