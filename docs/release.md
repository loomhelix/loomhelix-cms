# Release

This document tells how to record a change and how to release the packages. The six packages under `packages/` have
the same version, and they go to npm together. Each package has `"private": true` until the first release, so pnpm
does not publish it.

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

The six packages are a fixed group in `.changeset/config.json`. Changesets gives the new version to each package of
the group, also to a package without changes.

## Before the first release

The owner of the project makes these decisions:

1. Use two-factor authentication for each publish to the npm scope `@loomhelix-cms`.
2. Turn on the private vulnerability reporting of the repository. [security.md](security.md) sends reports there.
3. Select where to publish from: a GitHub Actions job with npm trusted publishing and provenance, or a local
   computer.

## Steps

1. Make sure that the CI of `main` is green: the check, the tests, the browser tests, and the package tests.
2. In a pull request, run `pnpm version-packages`. Changesets sets the new version in each `package.json`, and adds a
   section to each `CHANGELOG.md`. It also removes the used files in `.changeset/`.
3. For the first release, also do these steps in the same pull request:
   1. Join the new section of each `CHANGELOG.md` and the section "0.1.0 (not released)" into one section.
   2. Remove `"private": true` from the six packages.
   3. Change the status line of the README.
4. After the merge, get a clean copy of `main`. Run `pnpm install`, `pnpm ready`, `pnpm test:browser`, and
   `pnpm test:packages`.
5. Run `pnpm -r publish --access public`. pnpm writes the versions in place of `workspace:*` and `catalog:`, and it
   uses the `publishConfig` of each package.
6. Add a tag with the new version, for example `v0.2.0`. Make a GitHub release with the section of the changelog.
