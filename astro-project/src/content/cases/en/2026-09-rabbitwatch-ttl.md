---
lang: "en"
month: "September 2026"
date: 2026-09-08
title: "The TTL index that could never expire anything"
stat: 0
problem: >
  RabbitWatch, my monitoring stack, declares a seven-day retention on metrics: a
  MongoDB TTL index, created by a dedicated script, that should delete older
  documents on its own. Reading the code before touching it, that retention could
  never have worked. The consumer writes the timestamp field as a Unix integer, at
  line 67 of consumer/metrics_consumer_mongo.py, and the TTL index is created on
  that same field, at line 23 of consumer/setup_ttl_indexes.py.
approach: >
  The MongoDB documentation is explicit, and I read it instead of inferring it: the
  indexed field must hold BSON date values, and a document whose field does not
  hold one will not expire. The field name said the right thing, the type did not.
  I looked at the two places side by side, where the value is written and where the
  index is created, because they live in different files and neither looks wrong on
  its own.
result: >
  The index exists, the TTL thread runs every sixty seconds, reads the field, finds
  a number and moves on. No error, no exception, no log line: the number of
  documents that index can expire is zero by construction. The same pass turned up
  two scripts that disagree on the configuration filename, config_consumer.yaml
  against consumer_config.yaml, and a repository with no YAML config versioned at
  all. The project never went to production, so nobody has paid for this yet.
lesson: >
  A guarantee that is declared and never measured stays a hypothesis. This defect
  makes no noise: there was nothing to notice, no alarm to ignore, only a collection
  that would have grown forever while the code claimed otherwise. The
  shape repeats, a parameter name is not its semantics, so the source to read was
  the vendor's and not the field.
---
