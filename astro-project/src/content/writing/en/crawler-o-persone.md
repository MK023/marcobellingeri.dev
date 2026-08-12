---
lang: en
title: "I let every AI crawler in. A month later I cannot tell you how many people read me"
date: 2026-08-12
description: "Cloudflare congratulated me on 33,561 pageviews. The free plan does not separate humans from bots, and I invited the bots myself. Here is what I actually measured, and the counter I wrote to stop guessing."
tags: [webdev, ai, privacy, cloudflare]
edicola: "crawlers or people"
---

In early August Cloudflare sent me a congratulations email. The site had passed ten thousand pageviews in its first month: 33,561, on a domain that went live on 5 July.

For about ten seconds it was good news.

Then I remembered what I had done in July, which was open `robots.txt` to every AI crawler in existence. Training included, on purpose. I have no brand to protect and my problem is not that someone copies me: it is that nobody finds me. So everyone gets in.

Which makes that number, taken as it is, good for nothing.

## Why does a pageview count not tell you how many people read you?

Because Cloudflare's free plan counts requests, not people, and it does not separate humans from bots. Inside those 33,561 are the crawlers I invited myself, and I have no way to know in what proportion.

This is a practical problem, not a philosophical one. If a client asks me tomorrow how much traffic the site gets, I do not have an answer I can defend. "Thirty-three thousand" would be a true sentence and false information, because whoever hears it understands "thirty-three thousand people". I would rather say I do not know.

And there is the opposite question, which matters more to me: is opening the gates working? If GPTBot comes through and re-reads the site every week, I did the right thing. If it never comes, I am giving away bandwidth for nothing, and I would like to know.

## Is letting AI crawlers in actually worth it?

On half the question I have a measured answer, and the two halves look nothing alike. Perplexity cites me in first position for "who is Marco Bellingeri, cloud and security engineer". ChatGPT, asked the same thing, does not cite me at all.

The monitor that measures this runs every Monday and writes the history to a database. So far, routine. The interesting part is what the model did when I asked it that question.

It did not look for me. It rewrote the question into a search query, "Marco Bellingeri AI security", and read twelve pages about the topic: the European regulation, the AI Act, the Bletchley declaration, a couple of newspapers. None of them was about a person. It answered about the subject because it never found the person.

That is a different kind of failure from "your content is not good enough". It is the engine failing to connect the question to the page, and the difference changes what is worth doing next. If the crawler never comes, rewriting articles is wasted time and the problem is access. If it comes and does not cite, the problem is that the content is not extractable, and then rewriting is the work.

To know which, I needed to count who comes through.

## How do you count crawlers without tracking people?

By looking at the `User-Agent` of every page request and recording only the family it belongs to, with no IP address, no cookie, no session, nothing that ties two requests to the same person.

The site is static and runs on Cloudflare Workers, so the Worker was the obvious place. I started from an assumption that turned out to be false: I thought every request went through it. It did not. The Worker was configured to run on five routes only, the root and four APIs. Every page of the site was served straight from static assets, and my code never saw a thing.

The fix was not "send everything through". Requests to static assets are free and unlimited; requests that invoke the Worker consume the free plan's quota of a hundred thousand a day. Sending everything through would have put my code in front of every font and every stylesheet, which is most of the volume and all of the latency that matters, in order to count things that are not pageviews.

So only HTML goes through. A pageview *is* an HTML request. The rest is what that page drags along with it.

## What NOT to keep, which is the hard part

The classification is trivial: a list of names, GPTBot, ClaudeBot, PerplexityBot, Googlebot, and a couple of rules to spot a real browser. Twenty lines. What took me time was deciding what to throw away.

A browser's `User-Agent` identifies a person far more than it looks. Combined with other signals it becomes a fingerprint. So for a person I keep one word, `human`, and drop the string.

For a crawler I already know I keep the family name and nothing else: I know who it is, the rest adds nothing.

That leaves the awkward case, the one that made me rewrite the code twice. If I do not recognise the client, what do I do? The first version called it a bot and kept its full `User-Agent`. Wrong on two counts. The first is that a person can be in there: a text browser, a webview inside an app, an accessibility tool, a `User-Agent` stripped by a privacy extension. Treating them as a bot and keeping their string is exactly the thing I said I would not do.

The second reason is that the number lies. If I put "a crawler I do not recognise" and "I could not tell what this was" in the same bucket, I then read that forty per cent of the traffic is automated and believe it, when part of that forty is my own uncertainty wearing a certainty's clothes. And that number is the one that ends up in front of a client.

Now there are two labels. A client that declares itself automated in its own `User-Agent`, by writing `bot` or `crawler` or `curl` into it, gets kept as its short product name: that is what lets me notice a new family. A client that simply does not place gets recorded as `unclassified` and nothing else.

## What does counting cost?

Little, but not nothing, and the point is knowing beforehand rather than finding out. Every page that goes through the Worker consumes one request of the free quota. At today's traffic that is around eleven hundred a day against a hundred thousand: a margin of about ninety, which is comfortable but not infinite, and there is no rate limit on those routes.

I wrote it into the project README, along with what I will do if the number gets close, in order: watch the counter, narrow the routes and accept counting less, and only then pay. A declared ceiling with an exit path next to it is acceptable debt. A ceiling discovered by accident one night is an incident.

## The line that nearly made me publish a lie

My site's privacy policy said, in Italian and in English, that it "uses no tracking or analytics".

That was true until the day before. If I had shipped the counter without touching that page, the site that sells transparency would have published a false statement about itself, and no test would have caught it: tests look at code, not at promises.

I rewrote it before shipping. It now says what it does: it counts requests one at a time, with no identifiers, no profiling, and keeps the data for three months because that is when the platform deletes it. I also removed the word "aggregate" from a first draft, because it was not true: what I write is one event per request, not a running total, and calling it aggregate would have been more reassuring and less accurate.

## What I still do not know

The counter has been on for a few hours. I generated the first data points myself, sending three test requests with fake `User-Agent` strings to check that it worked, and honestly I could not tell them apart from real traffic.

So I have nothing to tell you about crawlers yet. In a week I will know: which families come through, how often, on which pages, and above all whether GPTBot shows up at all. That answer decides whether it is worth continuing to write to be found by a model, or whether I have been writing for an audience that never came.

In the meantime I have lost the ability to say thirty-three thousand. It looks like a step backwards and it is a real step forward: before, I had a big number and no idea what was inside it. Now I have a measurement on its way, and in the meantime an honest answer.
