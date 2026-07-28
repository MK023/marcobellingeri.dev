# Contributing

This document **describes the convention already in use** in this repository, reconstructed
from the commit history. It does not introduce a new process: it writes down what is already
there, so that it holds even when the author is an agent rather than a person.

## Branches

Nothing is ever committed straight to `main`. Every piece of work starts on a branch:

```
<type>/<slug-in-kebab-case>
```

where `<type>` comes from the same set as the commit types: `feat`, `fix`, `chore`, `ci`,
`docs`, `test`. Real examples: `feat/magazine-export`, `fix/hsts-worker-responses`.

Dependabot branches (`dependabot/…`) do not follow this rule. GitHub generates them.

A branch lives as long as one block of work. If it runs past a week, or the diff runs past a
thousand lines, split it: a diff nobody can review has not been reviewed.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), with the subject written in
Italian:

```
<type>(<scope>): <subject in the infinitive or present tense, lowercase, no trailing period>

<body: why, not what. The diff already says what.>
```

**Types**, in order of actual frequency: `feat`, `fix`, `chore`, `docs`, `ci`, `test`.

**Scopes** used so far: `site`, `engine`, `ci`, `db`, `security`, `adr`, `gdpr`, `obs`,
`secrets`, `env`, `readme`, `audit`, `backend`. A new scope is fine; if every commit needs a
new one, the scoping is not working.

**Merge commits**: `merge: <description of the block>`. This is a deliberate departure from
the standard, since `merge` is not a Conventional Commits type, but it makes the history of
`main` read as a list of closed blocks. It stays.

One historical commit sits outside the convention (`sec: …`). For security work, use
`fix(security)` or `chore(security)`.

The commit body explains **why**, and when a choice is counterintuitive it also says what
would happen otherwise. The commit that unblocked the CSP explains why the policy moved out
of `_headers`: without that line, the first person to move it back takes the site offline.

## Pull requests

Every branch reaches `main` through a PR. `main` is protected by a ruleset that forbids
direct pushes, deletion and force-pushes. These must be green:

- **Backend CI**: unit and integration tests, gitleaks over the full history, a rebuild of
  the database from scratch with assertions on the schema, RLS and the publish gate.
- **Site CI**: `astro check` (type-check), ESLint, build, then the tests that run against
  `dist/`: the CSP hash of every inline script, `_headers` not cancelling the `<meta>`, and
  the Archive staying consistent with the issue index.

Before opening the PR, from `astro-project/`: `npm run check && npm run lint`. Those are the
only two nets watching the `.astro` files, because SonarCloud cannot parse them.

**If you touch the `is:inline` script in `BaseLayout.astro`**, its SHA hash changes and the
CSP no longer authorises it. `npm run test:csp` fails and **prints the correct hash** to paste
into `astro.config.mjs`. That is not an accident, it is the procedure: the test exists to stop
the hash and the script from drifting apart in silence.

Both workflows run on **every** PR, with no path filters. A filter would save about fifty
seconds and in exchange would permanently block every PR that only touches a `.md` file: a
required check that never starts reports nothing, and GitHub leaves it pending forever.

The site CI runs against `dist/` rather than the source, because the way this site breaks is
not by compiling, it is by serving. `astro preview` does not apply `public/_headers`, which is
how a broken CSP survived every green build until it was actually served.

## Secrets

Never in the repository. `.env` is ignored, and `doppler.yaml` holds only project and config
names. Locally, secrets come from `doppler run`; in CI, from scoped service tokens. gitleaks
runs over the full history on every push to `main`.

On Dependabot PRs gitleaks is skipped, but the skip is a leftover, not a necessity. The
historical failure came from the missing `pull-requests: read` permission, which made the
action die on **every** PR, not from the actor; the permission is now granted. The skip stays
until it is verified on a real Dependabot PR. Every merge is still covered by the scan on
`main`.
