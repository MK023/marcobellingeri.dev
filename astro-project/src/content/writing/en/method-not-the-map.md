---
lang: en
title: "I pentested my own AI hub and shipped the method, not the map"
date: 2026-08-22
description: "A read-only audit of my own observability stack, run like an engagement. Almost every serious thing it found was inside a defence I had written hours earlier, and the worst one was inside the proofs I use to show the defences work."
tags: [ai, opentelemetry, programming, security]
edicola: "The method, not the map"
---

I ran a penetration test on my own infrastructure last week. No Burp Suite, no exploit fired at production, no CVE popped. The whole engagement came down to one habit: refusing to believe a control was working until I had watched it work.

The target is a small observability hub I built for my own AI-assisted coding. Six services in one compose file: a tunnel, an OpenTelemetry Collector taking metrics and logs from Claude Code, Prometheus, Grafana, Loki, and a status API. The public surface is three aggregate numbers. Everything else stays private. That boundary, three numbers out and nothing else, was the whole thing I was testing.

The word "pentest" carries a picture that does not match, so: I did not throw attack traffic at the live system. The platform bills by usage, there is a rate limiter and a WAF in front, and a flood of probes would have cost money and poisoned its own results. It was a read-only audit of the code and config, structured like an engagement, plus a dynamic run against the whole stack brought up locally in Docker. The interesting findings did not come from breaking in. They came from checking whether the defences hold when you run them.

## Almost everything serious was inside a defence

I expected the findings to cluster around the parts nobody had looked at. They did the opposite. Nearly every serious defect sat inside a control written days or hours earlier, usually by me, usually with a comment beside it naming what it protected against. Old code has been observed: it has run against real traffic, it has been queried back, someone has been surprised by it. A defence written yesterday has only been reasoned about, which feels like the same thing and is not.

## Allow-list, not deny-list

The first version of my privacy boundary deleted the five identity attributes Claude Code was measured sending: `user.email`, carrying a real address, plus `user.id`, `user.account_id`, `user.account_uuid` and `organization.id`. There is no flag that turns them off, and a `delete_key` for each one works right up until the client adds a sixth. This telemetry is beta and its attribute set is not a contract. At a privacy boundary a deny-list fails open on everything it has not heard of.

Keeping what is known-safe and dropping the rest turns an unknown attribute into a missing label instead of a leak. The price is that a future producer whose labels are not listed goes silent, which is the correct direction to fail.

```yaml
- context: resource
  statements:
    - keep_keys(resource.attributes, ["service.name"])
    - set(resource.attributes["service.name"], "claude-code")
```

That second line is not redundant, and finding out why cost me a measurement. `keep_keys` filters keys, not values, and `service.name` is the one attribute that becomes an index label in Loki. On 2026-08-20 a sender holding the ingest token wrote `service.name: claude-code-…victim@example.com` and the address arrived as an index label, with the cardinality that follows. The ceiling underneath is `max_global_streams_per_user`, 5000 by default, which is a limit and not a defence. One producer, one legal value, pinned.

## "Independent" is a measurement, not a comment

I had two barriers on that boundary, one in the Collector and one in Loki, which re-filters whatever reaches it. A design note of mine called them independent: break one, the other holds.

They were not, and I only know because a proof went red. `keep_keys(log.attributes, …)` governs record attributes, and Loki's `otlp_config` has three sections, all three of attributes. Scope attributes crossed both untouched. Remove Loki's list to test the isolation and a planted `scope.secret` was suddenly queryable, sitting next to the data I wanted, while identity and content stayed out. The repair reads like a no-op and is the whole fix:

```yaml
- context: scope
  statements:
    - keep_keys(scope.attributes, [])
```

The client sends no scope attributes today. The list is empty because it costs nothing now and covers whatever a future version puts there. What should have warned me is that the same hole existed twice: two days later the metrics path turned out to be leaking scope attributes as `otel_scope_*` labels past any allow-list, while the comment beside that exporter declared the boundary closed. Same shape, fixed on one path and not the other, with prose in between asserting it was fine.

## A proof that executes is not a proof that exercises

Somewhere in the log path there was a line meant to zero the trace ID on every record before storage. Written correctly, in the right place, and covered by a proof that ran it.

```yaml
# looks right, fails on every record
- set(log.trace_id.string, "")
```

The setter goes through `ParseTraceID`, which wants 32 hex characters. The empty string is not one, so the statement failed on every record, the Collector wrote `warn … failed to execute statement` and carried on, and the field reached Loki untouched. Measured on 2026-08-21 against the first real traffic: two warnings per record, around 180 per session, and a barrier that was declared and absent. The value the parser accepts is the all-zeroes ID, the OTel spec's way of saying "no trace".

The proof could not see it, because the payload never carried a trace ID. There was nothing for the broken line to fail on. Green, and blind.

Its twin is worse, because there the failure was conditional. OTTL documents that `set` does nothing at all if the value resolves to nil, so a line collapsing the log body to the event name quietly did nothing on any record without an `event.name`. Measured against the real Collector: a body containing a prompt and an address arrived in Loki verbatim. Neither proof could have caught it, because the client always sends `event.name` and the synthetic payload had to include it to satisfy a different assertion. The defence was a no-op in exactly the case it existed for. Both close the same way, by making the payload carry the thing: the privacy proof now pushes `deadbeefdeadbeefdeadbeefdeadbeef` as a trace ID and asserts it does not come back.

## The worst one was inside the proofs

Those shell proofs are the instrument this project uses to not have silent failures. During the audit I found a silent failure inside the instrument, six hours old and mine.

Two of them pinned the Collector image literally, `0.158.0`, under a comment claiming it was the same digest as production. A dependency PR had moved compose and the Railway Dockerfile to `0.159.0`, Dependabot does not read shell, and the proofs went on pulling the old image and passing. So the sentence I had written to verify that upgrade, "contract proof green on the new image", was false. The pin is no longer copied, it is read out of `docker-compose.yml`, which is the single copy, and each proof now prints the image it is running on, because a proof that does not say what it tested is asking to be trusted.

Then I wrote a CI gate so it could not happen again, and an adversarial review found the gate born broken. It counted how many proofs derive their image by searching the whole file for the string `docker-compose.yml`, comments included, so the comment describing the derivation survived the derivation: delete the real line and the count stayed at three and the gate stayed green. That is fifteen lines below a comment forbidding exactly that pattern, in a file where the same mistake had already been made three times.

The shape has siblings once you look for it. A blocking image scan went green because uninstalling pip is not the same as removing it: `ensurepip/_bundled/` keeps a second copy as a wheel, the scanner does not read inside an archive, and the vulnerable code shipped one `python -m ensurepip` away from being reinstalled. A cron watchdog read an absent metric as zero failures, so it would have reported healthy at the exact moment its own input disappeared. Each of those looks like a pass. None is evidence of the property you wanted.

## The dynamic run, and what it does not prove

So I brought the metrics path up locally with fake secrets and pushed one metric carrying identity with a valid token. The canary is deliberate: an email in `user.email`, an id in `organization.id`, and a hostile value inside `service.name` itself.

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

The email is gone, the organization id is gone, the hostile `service.name` was pinned instead of becoming a label. What stayed are the three keys I allowed.

And the value, `4242`, went all the way to the public numbers, which is the honest half. An allow-list of names does not constrain values: whoever holds the ingest token can write `claude_code.token.usage` with any number in it, and the public queries read a counter with `max_over_time(…[25h])`, so an injected spike stays stuck for twenty-five hours and does not clear by waiting or restarting. Measured on a test stack: `1e12` tokens. That one does not close here, and the reason matters. The token identifies the trusted producer, which is the only source these numbers have, so filtering the values would be a second opinion with no second source. What the project can do is stop the number arriving from somebody else, and the three public queries now carry `{job="otel-collector"}` for that.

The payload is also synthetic, so it proves the allow-list discards what I hand it, not that the client only sends that. On this same project a synthetic payload has already confirmed a query and then lied to me.

## What I did not publish, and why

There is a version of this post that lists every residual weakness in the running system by name, with the exact route and the exact window. I wrote that report. It stays in the drawer.

The obvious objection is that the repository is public, so what am I withholding. The answer is the aggregation. Every defect above is closed, and closed in the open, with the measurement that found it sitting in the commit that fixed it. A list of what is still open, in one place, with routes and timings next to each other, is a different object. It is not a disclosure, it is directions.

## Worth checking on yours

If you send telemetry from an AI coding client, read one raw record before you read your config. Identity ships by default in this class of product, the attribute set is beta, and every deny-list you write today is a list of the fields that existed this morning.

If you lean on two barriers, the useful question is not whether both are configured. It is which set of data only one of them is actually seeing. Break each on purpose and query the other back. The word "independent" in a design note is a claim, and mine survived two paths before a proof contradicted it.

And if you have proofs, ask what your last three green runs actually ran against. Mine were pulling an image production had already left behind, and they told me so in the friendliest way available: by passing.
