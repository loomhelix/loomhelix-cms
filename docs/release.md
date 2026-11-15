# Release

This document tells how to record a change and how to release the packages. Each package under `packages/` has its
own version, and it goes to npm when its version changes. A new package has `"private": true` until its first
release, so pnpm does not publish it.

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

## How a release works

The workflow `.github/workflows/release.yml` starts after each push to `main`:

1. The job "Find the package versions to release" runs `node release/src/release.ts plan`. It finds each package
   that is not private and has a version that is not on npm or has no GitHub release.
2. If the job finds no version, the workflow stops.
3. The job "Publish the packages to npm and make the GitHub releases" waits for an approval in the GitHub
   environment `npm`. A required reviewer approves it on the page of the workflow run.
4. The job runs `pnpm ready` and `pnpm test:packages`.
5. `node release/src/release.ts publish` does these steps for each package. A package goes before the packages
   that depend on it.
   1. `pnpm pack` makes the archive. pnpm writes the versions in place of `workspace:` and `catalog:` ranges, and
      it uses the `publishConfig` of the package.
   2. `npm publish` sends the archive to npm with trusted publishing, so the job has no npm token. npm adds a
      provenance statement that links the version to the workflow run.
   3. `gh release create` adds the tag `<name>@<version>`, for example `@loomhelix-cms/schema@0.2.0`. It also
      makes a GitHub release with the section of the `CHANGELOG.md`.

If a step fails, run the workflow again. The script does only the steps that are not done.

## Before the first release of a package

A package must be on npm before it can have a trusted publisher. The owner of the npm scope `@loomhelix-cms` does
these steps one time for each new package. The npm account of the owner must use two-factor authentication.

1. Run `pnpm build`.
2. Run `pnpm pack` in the folder of the package.
3. Unpack the archive into a folder outside the project. Run each `npm` command of these steps in that folder,
   because `devEngines` of the project allows only pnpm.
4. In the `package.json` of that folder, remove `"private": true` and `scripts`, and set the version `0.0.1`. npm
   does not stage a private package. The staged version is removed later, so do not use the first real version
   here.
5. Run `npm stage publish --access public`. npm makes the package, stages the version `0.0.1`, and adds the
   placeholder version `0.0.0-stage`. Only the maintainers see the package until it has a published version.
6. Wait until `npm stage list` shows the status `staged` for the version.
7. Add the trusted publisher:
   `npm trust github <package> --repository loomhelix/loomhelix-cms --file release.yml --environment npm --allow-publish --yes`.
8. Make sure that the GitHub environment `npm` has the owner as a required reviewer, and that it allows only `main`.

Release the package in the next 2 days. A trusted publisher expires if it has no publish in its first 2 days.

After the release, do these steps:

1. Remove the staged version: `npm stage list` gives its id, and `npm stage reject <id>` removes it. Do not
   remove it before the release, because then the package has no version.
2. Remove the placeholder version: `npm unpublish <package>@0.0.0-stage`. npm permits it only in the first 72 hours
   after `npm stage publish`.
3. In the settings of the package on npmjs.com, select "Require two-factor authentication and disallow bypass 2fa
   tokens".

## Steps

1. Make sure that the CI of `main` is green: the check, the tests, the browser tests, and the package tests.
2. In a pull request, run `pnpm version-packages`. Changesets sets the new version in the `package.json` of each
   changed package, and adds a section to its `CHANGELOG.md`. It also removes the used files in `.changeset/`.
3. For the first release of a package, also do these steps in the same pull request:
   1. Remove the words "(not released)" from the first section of its `CHANGELOG.md`.
   2. Remove `"private": true` from its `package.json`.
4. Merge the pull request. Approve the job "Publish the packages to npm and make the GitHub releases" on the page of
   the workflow run.
5. Make sure that each new version is on npm and has a GitHub release.
