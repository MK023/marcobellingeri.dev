---
lang: en
title: "I made my portfolio site audit its own security headers, live, in front of you"
date: 2026-07-15
description: "A portfolio card that runs a same-origin HEAD request to audit its own security headers live, and why the real CSP has to live in two places."
tags: [security, webdev, astro]
---

My portfolio has a section that runs `curl -I` on itself while you watch. Not a screenshot of headers I pasted in last year and forgot to update. The page fetches its own URL, reads the response headers off it, and prints each one ON or missing, right there in the section. If I ever ship a build that drops a header, the page snitches on me the next time someone loads it.

I want to walk through how it works, and then the part that made me rewrite it: the real Content-Security-Policy is not in one place. It is split across two. Showing only the header would have told half the truth, on a page whose whole point is not doing that.

## The setup

The site is built with Astro, output fully static, served from Cloudflare. There is a section on the page titled like a shell command. Under it, a list of the security headers I expect the edge to send. The expected list is not hardcoded into the script, it comes from the component:

```astro
const expected = [
  'Content-Security-Policy',
  'Strict-Transport-Security',
  'X-Content-Type-Options',
  'Referrer-Policy',
  'Permissions-Policy',
];
```

Same origin, so the browser is allowed to read the response headers back. That is the whole trick. A `fetch` to any other site would get its headers hidden by CORS, but a page is allowed to look at itself.

## What I actually built

The client script does a HEAD request to the current URL and reads the headers off the response:

```js
fetch(window.location.href, { method: 'HEAD' })
  .then((res) => {
    box.replaceChildren();
    expected.forEach((name) => box.appendChild(row(name, res.headers.get(name))));
    box.appendChild(row('Content-Security-Policy (meta)', metaCsp && foldHashes(metaCsp)));
  })
```

HEAD, not GET, because I only care about the headers and there is no reason to pull the body again. For each expected header it calls `res.headers.get(name)`. If the value is there, the row renders ON and prints it. If it is null, the row goes missing and gets a different style. No allowlist of "good" values, no grading. It shows what came back.

One detail I care about more than it probably deserves: every cell is built with `document.createElement` and `textContent`, never `innerHTML`. This is a section about security headers. If I XSS my own security section by piping a header value straight into the DOM as HTML, I have earned every bit of the embarrassment. So the header values are text, and text only.

The site also scored A+ on Mozilla's HTTP Observatory, and the hero links straight to that scan so you can re-run it yourself instead of taking my word for the badge. The live card and the external scanner are checking the same thing from two sides.

## The catch: the CSP is in two places

Here is where it got interesting, and where I had to go back and change the card.

When I first wrote it, the card read the five headers off the response and stopped. Clean, done. Except the Content-Security-Policy that actually protects the page is not fully in that header. Astro hashes its own bundled scripts and styles at build time and writes them into a `<meta http-equiv>` CSP. It can only do that at build, because that is when it knows the hashes. So the meaningful part of my policy, the `script-src` full of `sha256-` hashes, lives in the HTML, not in the header the card was reading.

Why not just put the whole CSP in the Cloudflare `_headers` file and be done? Because then the browser applies both policies as an intersection, and they fight. My `_headers` file says exactly this, in a comment I left for future me:

```
# La CSP non sta qui: la genera Astro (`security.csp` in astro.config.mjs) come
# <meta http-equiv>, perché solo in build può calcolare gli hash dei propri script.
# Se una CSP vivesse anche qui, le due policy verrebbero applicate entrambe come
# intersezione: un `script-src 'self'` in questo file annullerebbe gli hash del meta
# e rimetterebbe il sito offline.
```

A `script-src 'self'` in the header would intersect with the hash-based `script-src` in the meta, and the result blocks the very scripts the hashes were meant to allow. Site offline.

So there is exactly one CSP directive that has to live in the header, and it is the one a `<meta>` tag is not allowed to express: `frame-ancestors`. Per spec, `frame-ancestors` inside a `<meta>` is ignored, so it has to be a real response header. That is the whole content of the CSP header at the edge:

```
Content-Security-Policy: frame-ancestors 'none'
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

Which means my original card, reading only headers, would have proudly printed a Content-Security-Policy of `frame-ancestors 'none'` and called it a day. Technically true. Also a lie by omission, because it hid the part of the policy that does most of the work.

So the card reads the meta too. It pulls the `<meta http-equiv="content-security-policy">` content out of the DOM and prints it as a second CSP row. The hash list is dozens of entries long and useless to look at, so it folds each run of hashes into a count:

```js
const foldHashes = (csp) =>
  csp.replace(/(?:'sha\d{3}-[A-Za-z0-9+/=]+'\s*)+/g, (run) => {
    const n = run.match(/'sha\d{3}-/g)?.length ?? 0;
    return `${n} hash `;
  });
```

The count is read from the real policy on the page, not a number I typed. If Astro emits one more inline style tomorrow, the number goes up on its own.

## What this cost me, honestly

I am mid-level. I did not know going in that `frame-ancestors` was meta-blind, or that two CSPs intersect instead of one winning. I learned both by breaking the site. There is a manual hash in my Astro config for one inline script, the anti-flash theme script that runs before first paint, because Astro leaves `is:inline` scripts alone and will not hash them for me:

```js
scriptDirective: {
  resources: ["'self'", 'https://challenges.cloudflare.com'],
  hashes: ['sha256-WV81hIAeXjEdgj/cFIXtOf53g8pIquCjmXQuCHOehlw='],
},
```

If I touch that script and forget the hash, `npm run test:csp` fails and tells me the new hash to paste. That test exists because I shipped the mismatch once and the theme script got blocked in production.

The card is not clever. It is a HEAD request, five `.get()` calls, and one `querySelector`. What I like about it is that it cannot drift. A README claiming "we set strict security headers" ages the moment someone edits a config. This section re-derives the claim from the live response every time the page loads, and it reads both halves of a policy that lives in two files, because reading one half would make the page a small liar about the one topic it is supposedly honest about.

If you want to try the pattern: same-origin HEAD, read the headers, read the meta CSP too if you have one, build the DOM with `textContent`. That is the entire thing.
