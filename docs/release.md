# Release

This document tells how to record a change and how to release the packages. Each package under `packages/` has its
own version, and it goes to npm when its version changes. Each package has `"private": true` until the first release,
so pnpm does not publish it.

## Versions

The packages use semantic versions. Before version 1.0, the minor number shows a change that can break a site:

| Change                                                 | Type    | Example        |
| ------------------------------------------------------ | ------- | -------------- |
| A change of the API or of the format that can break it | `minor` | 0.1.0 to 0.2.0 |
| A new feature or a fix that does not break the API     | `patch` | 0.2.0 to 0.2.1 |
| The first stable version                               | `major` | 0.9.0 to 1.0.0 |

Do not use `major` before the decision about version 1.0.

## Record a change

A pull request that changes a package must have a changeset. A changeset is a file in `.changeset/` with the type of
the change and a line for the changelog. A change of the tests or the documents only does not need a changeset.

The CI checks each pull request with `changeset status`. If a pull request changes `src/`, `vite.config.ts`, or
`tsconfig.json` of a package and has no changeset for it, the check fails. A change of `package.json` does not start
the check, because the release pull request changes the versions there. Add a changeset by hand when a change of
`package.json` affects the users, for example a new dependency.

1. Run `pnpm changeset`.
2. Select the packages that the change affects.
3. Select the type of the change: `patch` or `minor`.
4. Write one sentence for the changelog, for example "Add the field type `date`."
5. Commit the new file in `.changeset/` with the change.

Changesets gives a new version only to the packages of the changesets and to some packages that depend on them:

- A package depends on another package of the project with a `workspace:^` range. pnpm writes `^0.1.0` in its place
  at publish time, so a site gets one copy of a shared package, for example `@loomhelix-cms/schema`.
- A new version in the range, for example 0.1.1 for `^0.1.0`, does not change the dependent packages.
- A new version out of the range, for example 0.2.0 for `^0.1.0`, changes the dependent packages. Each of them gets
  a `patch` version with the new range.

## Before the first release

The owner of the project makes these decisions:

1. Use two-factor authentication for each publish to the npm scope `@loomhelix-cms`.
2. Select where to publish from: a GitHub Actions job with npm trusted publishing and provenance, or a local
   computer.

## Steps

1. Make sure that the CI of `main` is green: the check, the tests, the browser tests, and the package tests.
2. In a pull request, run `pnpm version-packages`. Changesets sets the new version in the `package.json` of each
   changed package, and adds a section to its `CHANGELOG.md`. It also removes the used files in `.changeset/`.
3. For the first release, also do these steps in the same pull request:
   1. Remove the words "(not released)" from the section "0.1.0" of each `CHANGELOG.md`.
   2. Remove `"private": true` from the six packages.
   3. Change the status line of the README.
4. After the merge, get a clean copy of `main`. Run `pnpm install`, `pnpm ready`, `pnpm test:browser`, and
   `pnpm test:packages`.
5. Run `pnpm -r publish --access public`. pnpm publishes each package with a version that is not on npm. It writes
   the versions in place of `workspace:` and `catalog:` ranges, and it uses the `publishConfig` of each package.
6. Add a tag for each published package, for example `@loomhelix-cms/schema@0.2.0`. Make a GitHub release for each
   tag with the section of the changelog.
