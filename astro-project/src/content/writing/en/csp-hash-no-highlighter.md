---
lang: en
title: "A hash-based CSP has no room for a syntax highlighter"
date: 2026-08-28
description: "My Content Security Policy allows scripts by exact hash and nothing else. That works right up until a Markdown plugin decides to colour your code with inline styles, and then you find out what the policy actually costs."
tags: [security, astro, webdev, css]
edicola: "A CSP that hashes itself"
---

The Content Security Policy on this site allows scripts by SHA-256 hash. Not `unsafe-inline`, not a nonce, not a wildcard. A list of exact digests, and anything whose bytes don't match one of them does not run.

That is the strong version of the policy, and it is strong for a boring reason: a hash is a statement about content that nobody can forge. If an injection lands in my HTML, it does not matter that it sits in a `<script>` tag on my own origin. Its hash isn't on the list, so it's inert.

The cost of that arrived the first time I put a fenced code block in an article.

## What a hash can and cannot cover

Astro computes these hashes during the build and writes them into a `<meta http-equiv>`. It knows the bytes of every script it bundles, so it can digest them and emit a policy that matches.

The limit is in that sentence. It hashes what it bundles. Anything that produces markup at render time, after the policy has been written, is invisible to it.

There is exactly one script on this site that Astro doesn't bundle, and it earns its exception. The anti-FOUC snippet that reads the stored theme has to run before first paint, so it is `is:inline` and Astro leaves it alone. Its hash is maintained by hand:

```js
scriptDirective: {
  resources: ["'self'", 'https://challenges.cloudflare.com'],
  hashes: ['sha256-WV81hIAeXjEdgj/cFIXtOf53g8pIquCjmXQuCHOehlw='],
},
```

Which is fine for one script that changes twice a year. It stops being fine as a general strategy the moment something starts generating markup on every page.

## Shiki was the first casualty

Astro ships Shiki for Markdown syntax highlighting and turns it on by default. It is genuinely good. It also colours code by wrapping every token in a `<span>` with an inline `style` attribute.

Under `style-src 'self'` with no `unsafe-inline`, every one of those attributes is blocked. Code blocks render as undifferentiated grey text.

The obvious repair is to allow them, and the way you allow a `style=` attribute specifically is `'unsafe-hashes'`. I read the spec on that keyword twice, because the name is doing a lot of honest work. It permits hashed content in attribute position, and attribute position is where a large share of real-world injection lands. Adding it to make code look nice would mean weakening the exact property I built the policy for, on behalf of a feature nobody asked me for.

So I turned it off:

```js
markdown: {
  syntaxHighlight: false,
},
```

Code blocks now emit plain `<pre><code>`, which the policy has no objection to. The colour lives in a stylesheet, keyed off classes, served from `'self'`, and no hash is involved because it is not inline anything.

I want to be precise about what I gave up, because "just disable it" is a suspiciously comfortable ending. I lost per-token semantic colour. What I have is monospace with sensible contrast, and I decided that a code block being legible matters more than a keyword being purple. If a piece ever genuinely needs highlighting, the way in is a build-time transform that emits classes instead of styles, not a relaxed policy.

## The rule that fell out of it

The interesting part wasn't the config flag. It was noticing that Shiki is not a special case, it is the first instance of a class, and the class is "anything that writes style into an attribute".

My own code does this constantly if I let it. A one-line margin tweak in a component is easier to write as `style="margin-left:8px"` than as a class and a rule in a stylesheet. It also passes the build, looks correct in `astro preview`, and dies silently in production, because preview does not serve the real policy.

So that stopped being allowed, and the ban is written where the temptation is:

```css
/* Qui e non come style= inline: un attributo style richiederebbe 'unsafe-hashes' nella CSP. */
#copy-email-btn{ margin-left:8px; }
```

Eight pixels of margin, with a comment explaining why it lives in a stylesheet. It looks like over-documentation until you picture the version of me who is in a hurry, sees a naked eight-pixel rule with no explanation, and decides it would read better inline.

## The test is on the built output, not the source

None of that survives on discipline. It survives because a test reads the built HTML and fails on anything it finds.

For every page in `dist/`, it extracts the inline scripts, hashes each one, and asserts the digest appears in the policy. When it fails it hands you the fix:

```
Script inline senza hash nella CSP.
Aggiungi 'sha256-…' a security.csp.scriptDirective.hashes in astro.config.mjs.
```

Then two assertions for the class Shiki introduced me to. No `style=` attribute anywhere. No inline `on…=` handler anywhere. Both name the same reason in their failure message, that allowing them would require `'unsafe-hashes'`, so whoever hits it learns the policy instead of just learning that CI is angry.

A fourth one guards a different failure. My real policy lives in the meta tag, and a CSP in the headers would be applied as an intersection with it, so a plain `script-src 'self'` written there would cancel every hash and take the site offline. That test allows exactly one directive in the headers file, `frame-ancestors`, which is ignored inside a meta tag by specification and therefore has to live there.

Two more of them exist only to keep the suite honest. One asserts the build produced pages at all. The other asserts that somewhere in `dist/` at least one inline script was found, because the day my regex stops matching, every per-page assertion starts passing on an empty list and the whole file goes green while checking nothing. A test that cannot fail is not a test, and the cheapest way to catch one is to assert that its input is non-empty.

There is a trap in this design worth naming. The tests read `dist/`, so running them without rebuilding grades yesterday's output. That is why the script is:

```json
"test": "npm run build && npm run test:csp"
```

I have watched that suite pass on a stale build. It is very reassuring and completely meaningless.

## Worth checking on yours

If you have a CSP, load your site and open the console rather than reading the policy. Blocked resources report themselves there, and a policy that is silently breaking one widget on one page looks identical to a working one from the config file.

If you are on `unsafe-inline` today, the useful question isn't how to reach a hash policy in one move. It's which dependency would break first if you did. For me it was the highlighter shipped by default in my own framework, and I would not have guessed that before it happened.

And if you already run a strict policy, go find where the exception is. There usually is one, it usually has a good reason, and the good reason is usually two years old.
