---
lang: en
title: "Node 22.22 runs TypeScript. Ubuntu's Node 22.22 doesn't."
date: 2026-09-16
description: "Type stripping has been on by default since Node 22.18. On my Ubuntu server, the tests that import .ts files failed while CI passed on the same major version. The version was fine. The build was not."
tags: [node, typescript, ubuntu, devops]
edicola: "The Node without TypeScript"
---

Four test files in my site's repo import TypeScript directly. `faq.test.mjs` pulls in `src/lib/faq.ts`, and three others do the same with their own modules. There is no build step and no loader in between: the script is `node --test "test/*.test.mjs"`, and type stripping has been on by default since Node 22.18.0, so Node strips the types and runs what's left.

In CI those tests pass. The workflow asks `actions/setup-node` for `node-version: "22"`, and the latest runs on `main` are green.

On my Ubuntu server, with Node 22.22.1, all four fail before a single assertion runs:

```
TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts" for .../src/lib/faq.ts
```

22.22.1 is newer than 22.18.0, so on paper the feature is there. **The version number was right. The binary behind it was a different build.**

## Same version, different binary

Node will tell you whether it strips types. The v22 docs describe `process.features.typescript` as `"strip"` by default, `"transform"` with `--experimental-transform-types`, and `false` if Node is started with `--no-experimental-strip-types`.

I did not pass that flag:

```
$ /usr/bin/node --version
v22.22.1
$ /usr/bin/node -p 'process.features.typescript'
false
```

That `node` comes from Ubuntu's `nodejs` package, version `22.22.1+dfsg+~cs22.19.15-1ubuntu1`. Asking for the feature explicitly does not bring it back:

```
$ /usr/bin/node --experimental-strip-types t.ts
node:internal/util:226
    throw new ERR_NO_TYPESCRIPT();
```

To rule out the version itself, I downloaded the official 22.22.1 build from nodejs.org, checked it against `SHASUMS256.txt`, and asked the same question. It printed `strip` and ran the same `.ts` file without complaint.

## Where TypeScript went

The package's own changelog explains most of it. The December 2024 entry, `22.12.0+dfsg-1`, says:

> dfsg-exclude amaro, build without it - it requires swc. This disables the ability to execute TypeScript files using the --experimental-strip-types flag.

The November 2025 entry, `22.21.1+dfsg+~cs22.19.0-1`, says: "we build without-amaro for now, disable strip-types".

The March 2026 Debian entry, merged into the version I have, says: "Drop 'no amaro' patch, solved upstream". The build still answers `false`, and it reports how it was compiled:

```
$ /usr/bin/node -p 'process.config.variables.node_use_amaro'
false
```

The official 22.22.1 build prints `true`.

The changelog doesn't say what "solved upstream" changed. My tests only see what the build does.

## Why CI never saw it

The `setup-node` README says the action first checks the runner's tool cache, then pulls LTS versions from the `actions/node-versions` releases and, on a miss, falls back to downloading from nodejs.org. None of those is Ubuntu's package. The four test files pass in CI, so the Node there strips types. The one on my server does not, and both report major version 22.

That is how one repository can be green in CI and red on my server without a line of code changing.

## The fix

I extracted the official Node 22.23.2 tarball into `/usr/local`. `/usr/local/bin` comes before `/usr/bin` in `PATH`, so `node` now resolves to the official build, with npm 10.9.8 bundled.

I left the Ubuntu package installed. On this machine 15 installed packages depend on `nodejs`: `handlebars` and 14 `node-*` libraries. Removing it to get the right `node` would have meant fighting apt over things that have nothing to do with my site.

Same four files, official binary:

```
# tests 42
# pass 42
# fail 0
```

## Ask Node what it can do

If a project relies on type stripping, `node --version` is not the check. This is:

```
node -p 'process.features.typescript'
```

On the two builds above it prints `strip` when the feature works and `false` when it doesn't, whatever the version string says. It belongs in a setup script next to the version check, because on my server the version check was the one that passed.
