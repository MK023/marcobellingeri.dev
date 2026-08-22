---
lang: en
title: "I pentested my own AI hub and shipped the method, not the map."
date: 2026-08-22
description: "A read-only audit of my own observability stack, run like an engagement. It found nothing exploitable, which was not the interesting part: the interesting part was watching four controls that looked green turn out to be doing nothing."
tags: [ai, programming, productivity, security]
edicola: "The method, not the map"
---

I ran a penetration test on my own infrastructure last week. No Burp Suite, no exploit fired at production, no CVE popped. The entire engagement came down to one habit: refusing to believe a control was working until I had watched it work.

The target is a small observability hub I built for my own AI-assisted coding. Six services: an OpenTelemetry Collector taking metrics and logs from Claude Code, Prometheus, Grafana, a log store, a tiny status API, and a tunnel in front. The public surface is three aggregate numbers. Everything else stays private. That boundary, three numbers out and nothing else, was the whole thing I was testing.

I want to be honest about what kind of test this was, because the word "pentest" carries a picture that does not match. I did not throw attack traffic at the live system. The platform bills by usage, there is a rate limiter and a WAF in front, and a flood of probes would have cost money and poisoned its own results. So this was a read-only audit of the code and config, structured like an engagement, recon through reporting, plus a dynamic run against the whole stack brought up locally in Docker. The interesting findings did not come from breaking in. They came from checking whether the defenses hold when you actually run them.

## The audit found nothing exploitable, which was not the interesting part

The static pass came up empty on exploitable bugs. Not because I looked lightly, but because the codebase has an unusual property: nearly every defense carries a comment naming the exact failure it prevents and the date someone measured it. Auth at the ingest, not at the tunnel. Identity stripped by an allow-list, not a deny-list. Containers non-root and pinned by digest. Secrets out of git, checked by a scanner with a planted canary so the scanner cannot pass while blind.

Reading that is reassuring and also slightly useless. A comment that says "this is safe" is a claim, and the entire point of a security review is that claims are where you start, not where you stop. So the real work was the second half: bring it up, and try to make the safe things misbehave.

## Lesson one: allow-list, not deny-list

The privacy boundary is where AI telemetry gets dangerous. The client I feed sends `user.email`, carrying a real address, on almost every log record. Always. There is no flag to turn it off. That is fine when you own all the data and a problem the instant any of it could be seen.

The naive fix is to list the identifying fields and delete them.

```yaml
# please don't do this at a privacy boundary
transform/redact:
  metric_statements:
    - context: datapoint
      statements:
        - delete_key(datapoint.attributes, "user.email")
        - delete_key(datapoint.attributes, "organization.id")
```

It works and it rots. The attribute set is beta and is not a contract. The day the client adds a sixth identifying field, a deny-list of the ones you knew passes the new one through. A deny-list at a privacy boundary fails open on everything it has not heard of.

So the config keeps a short list of known-safe fields and drops the rest.

```yaml
transform/allowlist:
  metric_statements:
    - context: resource
      statements:
        # the client picks service.name's value, so pin it, don't just filter keys
        - keep_keys(resource.attributes, ["service.name"])
        - set(resource.attributes["service.name"], "claude-code")
    - context: datapoint
      statements:
        - keep_keys(datapoint.attributes, ["model", "type", "session.id"])
```

An unknown attribute becomes a missing label instead of a leak. The cost is that a future producer whose labels are not listed goes silent, and that is the correct direction to fail.

## Lesson two: "independent" is a measurement, not a comment

I had two barriers on that boundary. One in the Collector, one in the log store, which re-filters anything that reaches it. I told myself they were independent: break one, the other holds.

They were not, and I only know that because a proof went red. The Collector allow-list filtered resource attributes and record attributes, but never scope attributes, so those crossed it untouched and only the store's list was catching them. Pull the store's list to test isolation and a planted key in the scope was suddenly queryable, sitting next to the data I wanted. Two barriers that were independent on identity and on content, and not independent on that third set.

I had written the word "independent" in a design note and believed it. The config parsed. A static shape check would have passed. Only a proof that ran, and then looked, found the gap. Now I break each barrier on purpose and confirm the other still holds, instead of trusting the label on it.

## Lesson three: a proof that executes is not a proof that exercises

This is the one I keep coming back to. Somewhere in the config there was a line meant to zero out a trace ID on every log record before storage. It was written correctly, in the right place. There was even a test that executed it.

```yaml
# looks right, fails on every record
- set(log.trace_id.string, "")
```

It failed on every single record. The setter parses the value as a trace ID, an empty string is not a valid one, so the statement errored, the pipeline logged a warning and moved on, and the field arrived at the store untouched. The value it wants is the all-zeroes ID, `"000...000"`, which is the spec's way of saying "no trace." The test that "covered" it ran the pipeline but never sent a trace ID, so there was nothing for the broken line to fail on. Green, and blind.

The fix in the config was one correct value. The fix in my head was bigger. A proof that runs is not the same as a proof that exercises the thing you care about. If the payload does not carry the attribute the control is supposed to strip, the control can be a no-op and every light stays green.

## Lesson four: green is not the same as absent

A theme kept repeating. A dependency scanner passed because it does not read inside packaged wheels, so a vulnerable copy sat in the image one command away from being reinstalled, invisible to the gate. A watchdog treated an empty result as zero failures, which means it would report "healthy" at the exact moment its own input disappeared. A privacy grep that reports "no identifying label found" when there was nothing to look at is telling you nothing and sounding like good news.

Each of these looks like a pass. None of them is evidence of the property you wanted. The counter to all of it is the same move: make the system show you the thing, do not let it stay silent and call that success.

## The dynamic run

So I brought the whole metrics path up locally with fake secrets and pushed one metric carrying identity with a valid token. The canary is deliberate: an email in `user.email`, an id in `organization.id`, and a hostile value in `service.name` itself.

```text
# auth first, before anything else gets a vote
no auth      -> 401
wrong token  -> 401
valid token  -> 200   # accepted, now let's see what survives it
```

Then read the exporter. Here is the single series it exposes, in full:

```text
claude_code_token_usage{job="claude-code",model="claude-opus-5",session_id="sess-canary",type="input"} 4242
```

The email is gone. The organization id is gone. The hostile `service.name` did not become a label, it was pinned to `claude-code`. What stayed are the three keys I allowed. And the value, `4242`, propagated all the way to the public numbers. That last part is the honest tradeoff: the token authenticates the trusted producer, so it stops someone else writing to my pipeline, but it does not turn the producer's own values into something I can second-guess. Nine checks, all green: ingest auth, the allow-list on both paths, the status API contract, the log privacy proof on real images, retention, alerting.

Two limits I will not paper over. The payload is synthetic, so it proves the allow-list discards what I hand it, not that the client only sends that. On this same project a synthetic payload has already confirmed a query and then lied to me. And a local run is not production. The real baseline still comes from running the actual client once and reading what lands.

## What I did not publish, and why

There is a version of this post that lists every residual weakness in the running system by name, with the exact route and the exact window. I wrote that report. It stays private.

A penetration test of your own live infrastructure is, read the wrong way, a map. Every "accepted risk" is also a set of directions for someone who did not have them. So the report with the target in it goes in the drawer, and what ships is the method and the lessons, with the hostnames and the specific holes filed off. If you take security seriously enough to audit your own work, take it seriously enough not to hand the audit to everyone.

That is the last lesson, and the one I would keep if I lost the rest. The useful part of a security review was never the list of what is wrong with one system. It was the set of habits that would have caught it in any of them.

## The habits, in one place

- Assume identity ships by default. Check what the client sends before your config runs.
- Allow-list at a privacy boundary. A deny-list fails open on the next release.
- If you lean on two barriers, break each one and confirm the other holds.
- A proof that executes is not a proof that exercises. Make the payload carry the thing.
- Green is not absent. Make the system show you the property, do not accept silence.
- Read the config last. Run it, and query it back.
