# DESIGN.md, marcobellingeri.dev

> What the site already looks like, written down so an agent does not have to
> infer it from the CSS every time. Everything here was extracted from
> `astro-project/src/styles/global.css` and the components, not invented: if a
> rule below and the code disagree, **the code is right and this file is stale**.

## The idea in one line

A 1990s print magazine that happens to be a website. Masthead, issue numbers
(`VOL. 01 — NO. 07`), rules, seals, halftone. Not a dashboard, not a portfolio
template. When a choice is unclear, ask which one a printed magazine would make.

## Two editions, not a dark mode

The site ships two full palettes. They are not "light and dark": they are the
**day edition** and the **night edition**, and the night one is deliberately
neon rather than a dimmed version of the day one.

Selection happens in `BaseLayout.astro`, in an inline script that runs **before
the first paint** (a deferred script would repaint an already drawn page):

1. `localStorage` key `bellingeri-edition` wins whenever it is set, always.
2. Otherwise the hour in `Europe/Rome` decides: night outside 07:00–20:00.

The edition lives in `data-mode="night"` on `<html>`. Nothing else switches it.

## Colour

Ten tokens, defined once on `:root` and overridden under `html[data-mode="night"]`.
Use the token, never the hex.

| token | day | night | what it means |
|---|---|---|---|
| `--paper` | `#FAFAF7` | `#0B0710` | the page |
| `--paper-dark` | `#F0EEE7` | `#140D1E` | a raised or inset surface |
| `--ink` | `#181410` | `#F2EDFB` | text |
| `--orange` | `#FF5A1F` | `#FF2FD6` | accent, and **rules/compliance** |
| `--orange-text` | `#B8420F` | `#FF2FD6` | the accent when it has to pass contrast as text |
| `--violet` | `#6B4FFF` | `#29E7FF` | **defence** |
| `--seal` | `#1E8F5A` | `#3DF58C` | **me**: the ✳ of the seal |
| `--ia` | `#A86400` | `#FFE84D` | the **AI layer** of the Radar (MITRE ATLAS) |
| `--halftone` | `#A8A296` | `#3A2F4C` | the dot screen, borders, muted marks |
| `--rule` | `#181410` | (inherits) | printed rules |

Three of these carry meaning beyond decoration, and that meaning is the reason
the Radar is readable at a glance: **violet is defence, orange is rules, green
is me**. Gold was chosen for the AI layer precisely because it is the one hue
absent from both palettes, so a fourth category stays distinct in day and night
alike.

`--orange-text` exists because the accent orange does not carry enough contrast
as body text. Two tokens, one colour, one of them safe to read.

Two details that will save you a search. `--rule` is the only token the night
edition does not override: printed rules keep the day value and inherit. And
`--ia` never appears as `var(--ia)` anywhere, because the only thing that reads
it is JavaScript, at `pages/[lang]/radar.astro:166`, through
`getPropertyValue('--ia')` to paint the globe canvas. Grepping the CSS for it
finds the definition and no usage, which looks like a dead token and is not.

## Type

Three families, three jobs, no exceptions. All self hosted through fontsource,
so no request leaves for a font CDN.

- **Anton** for `.display`: headings and the masthead. Always uppercase, letter
  spacing `0.01em`.
- **Source Serif 4** for prose. This is a magazine, so the body is a serif.
- **JetBrains Mono** for `.mono`: data, labels, tags, timestamps, the terminal,
  anything that is a measurement rather than a sentence.

The rule that follows from this: if a string is a **number or an identifier**,
it goes in mono. If it is a sentence, it goes in serif. Mixing the two in the
same line is how the magazine look breaks.

## The constraint that governs everything: hash based CSP

The CSP has **no `unsafe-inline`**, and it lives in the `<meta>`, not in the
headers (putting a `script-src` back into `_headers` takes the site offline, and
a dedicated test prevents it).

Practical consequences, in order of how often they bite:

- **Never write `style=` from runtime JavaScript.** The CSP blocks it in
  production. Colour and layout belong in `global.css` or in a scoped `<style>`
  in the component, which Astro hashes for you.
- A new inline `<script>` needs its hash in the CSP. `npm run test:csp` runs
  against `dist/`, not the source, and will catch a missing one.
- The two `style=` matches you will find in `src/components/` are comments
  explaining not to use it. There are no runtime inline styles.

## Motion

Motion is decoration, never information. `prefers-reduced-motion` is honoured in
six places, and anything that moves has a still fallback.

The `780ms` of the `SFOGLIANDO` loader is a **closed decision**: it is a design
choice, not a performance bug, and it stays. Do not reopen it.

## Print

There is a real print stylesheet. The night edition is remapped to warm paper
(`#EDE6D6`) so a night-mode page does not print as a black rectangle, and the
chrome that has no meaning on paper is removed: utility bar, table of contents,
command palette, halftone frame, terminal overlay, loader, service nav.

If you add a floating or interactive element, add it to that list.

## Layout

No grid framework. Containers cap at `1100px` for wide sections and `1000px` for
reading ones, with `560px`–`600px` for single columns of prose. Breakpoints are
chosen per component rather than from a global scale, so read the component you
are touching instead of assuming a system.

## What not to do

- Do not add a colour. Ten tokens cover the site, and a new hue either
  duplicates an existing meaning or breaks the four way distinction the Radar
  relies on.
- Do not import another design system's tokens or type scale. The identity is
  the product here, and a generic UI kit dissolves it.
- Do not treat the night edition as "the same page, darker". It has its own
  glow, its own contrast relationships, and its own print remap.
- Do not put a sentence in mono or a number in serif.
- Do not reach for a component library. Every component in
  `astro-project/src/components/` is hand written for this site, and matching
  the existing ones is cheaper than making a third party one look like them.
