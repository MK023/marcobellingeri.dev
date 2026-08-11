---
lang: "en"
month: "August 2026"
date: 2026-08-01
title: "Agentic OS — Claude Code telemetry, in production"
stat: 3
problem: >
  Every Claude Code session streams its telemetry into a hub I built, and a public
  widget on this site reads three numbers back out of it. Measured against the real
  client (v2.1.220), Claude Code sends five identity attributes alongside the
  metrics, and one of them carries my actual email address. Anything that reaches
  Prometheus becomes a label, and a label is forever.
approach: >
  The first version deleted the five known attributes. That is a deny-list, and a
  deny-list at a privacy boundary fails open on everything it has not heard of yet:
  Claude Code telemetry is in beta, its attribute set is not a contract, and the
  next release can add a sixth. The Collector now keeps an allow-list of six known
  keys and drops the rest, before batching, so an unknown attribute becomes a
  missing label rather than a leak. Verified against the real client, including
  attributes no released version emits yet.
result: >
  Identity never reaches storage at all. The whole hub is five services on Railway
  with a single ingress, behind a Cloudflare Tunnel, and its public surface is three
  aggregate numbers: sessions, tokens, cost. When the hub does not answer, the site
  prints three dashes instead of a zero, because a zero would look like an answer.
lesson: >
  The cost of the trade is written down rather than hidden: a new producer whose
  labels are not on the list will watch them vanish in silence. That is the
  direction I want it to fail in. Deleting what you know about protects you until
  somebody else ships their next release.
---
