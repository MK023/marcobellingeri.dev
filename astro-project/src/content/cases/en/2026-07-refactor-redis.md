---
lang: "en"
month: "July 2026"
date: 2026-07-01
title: "Redis refactor — production system"
problem: >
  The system's critical query was slow under load: the Redis cache was
  invalidated far more often than needed, wasting most of the caching benefit.
approach: >
  Analysis of the real invalidation patterns, not assumed ones. A full refactor
  of the caching strategy, proposed and carried out independently, without
  stopping the system the team used every day.
result: >
  Critical-query throughput taken to 41× the starting value, with zero downtime
  during rollout.
lesson: >
  The costliest bug is often the most boring: no single invalidation was
  "wrong", the problem was the overall discipline in managing the cache.
---
