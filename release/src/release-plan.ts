export type ReleaseStep = 'publish' | 'release';

export interface PackageManifest {
  readonly folder: string;
  readonly name: string;
  readonly version: string;
  readonly isPrivate: boolean;
  readonly dependencies: readonly string[];
}

export interface ReleaseState {
  readonly publishedVersions: ReadonlyMap<string, readonly string[]>;
  readonly releaseTags: ReadonlySet<string>;
}

export interface PackageRelease {
  readonly folder: string;
  readonly name: string;
  readonly version: string;
  readonly tag: string;
  readonly steps: readonly ReleaseStep[];
}

export function releaseTag(name: string, version: string): string {
  return `${name}@${version}`;
}

export function sortByDependencies(
  manifests: readonly PackageManifest[],
): readonly PackageManifest[] {
  const sorted: PackageManifest[] = [];
  const remaining = [...manifests];
  while (remaining.length > 0) {
    const index = remaining.findIndex(({ dependencies }) =>
      dependencies.every((dependency) => !remaining.some(({ name }) => name === dependency)),
    );
    if (index === -1) {
      const names = remaining.map(({ name }) => name).join(', ');
      throw new Error(`The packages ${names} depend on each other in a cycle.`);
    }
    sorted.push(...remaining.splice(index, 1));
  }
  return sorted;
}

function stepsOf(manifest: PackageManifest, state: ReleaseState): readonly ReleaseStep[] {
  const versions = state.publishedVersions.get(manifest.name) ?? [];
  const steps: ReleaseStep[] = [];
  if (!versions.includes(manifest.version)) {
    steps.push('publish');
  }
  if (!state.releaseTags.has(releaseTag(manifest.name, manifest.version))) {
    steps.push('release');
  }
  return steps;
}

export function planRelease(
  manifests: readonly PackageManifest[],
  state: ReleaseState,
): readonly PackageRelease[] {
  return sortByDependencies(manifests.filter(({ isPrivate }) => !isPrivate))
    .map((manifest) => ({
      folder: manifest.folder,
      name: manifest.name,
      version: manifest.version,
      tag: releaseTag(manifest.name, manifest.version),
      steps: stepsOf(manifest, state),
    }))
    .filter(({ steps }) => steps.length > 0);
}

export function versionsFromNpmView(output: string): readonly string[] {
  const view: unknown = JSON.parse(output);
  if (typeof view === 'string') {
    return [view];
  }
  if (Array.isArray(view)) {
    return view;
  }
  const code = (view as { readonly error?: { readonly code?: string } }).error?.code;
  if (code === 'E404') {
    return [];
  }
  throw new Error(`Expected a list of versions from "npm view", got ${output.trim()}`);
}

export function releaseNotes(changelog: string, version: string): string {
  const lines = changelog.split('\n');
  const heading = `## ${version}`;
  const start = lines.indexOf(heading);
  if (start === -1) {
    throw new Error(`Expected the section "${heading}" in the changelog.`);
  }
  const next = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  return lines
    .slice(start + 1, next === -1 ? undefined : next)
    .join('\n')
    .trim();
}
