import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  planRelease,
  releaseNotes,
  versionsFromNpmView,
  type PackageManifest,
  type PackageRelease,
} from './release-plan.ts';

const PACKAGES_FOLDER = fileURLToPath(new URL('../../packages', import.meta.url));
const MAX_LISTED_RELEASES = '1000';
const FOLDER_WITHOUT_DEV_ENGINES = tmpdir();

function runCommand(command: string, args: readonly string[], cwd?: string): string {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

function readManifest(folder: string): PackageManifest {
  const manifest = JSON.parse(readFileSync(join(PACKAGES_FOLDER, folder, 'package.json'), 'utf8'));
  return {
    folder,
    name: manifest.name,
    version: manifest.version,
    isPrivate: manifest.private === true,
    dependencies: Object.keys(manifest.dependencies ?? {}),
  };
}

function npmViewOutput(name: string): string {
  try {
    return execFileSync('npm', ['view', name, 'versions', '--json'], {
      cwd: FOLDER_WITHOUT_DEV_ENGINES,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const output = (error as { readonly stdout?: string }).stdout ?? '';
    if (output === '') {
      throw error;
    }
    return output;
  }
}

function publishedVersions(name: string): readonly string[] {
  return versionsFromNpmView(npmViewOutput(name));
}

function releaseTags(): ReadonlySet<string> {
  const output = runCommand('gh', [
    'release',
    'list',
    '--limit',
    MAX_LISTED_RELEASES,
    '--json',
    'tagName',
  ]);
  const releases: readonly { readonly tagName: string }[] = JSON.parse(output);
  return new Set(releases.map(({ tagName }) => tagName));
}

function currentPlan(): readonly PackageRelease[] {
  const manifests = readdirSync(PACKAGES_FOLDER, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map(({ name }) => readManifest(name));
  const publicNames = manifests.filter(({ isPrivate }) => !isPrivate).map(({ name }) => name);
  return planRelease(manifests, {
    publishedVersions: new Map(publicNames.map((name) => [name, publishedVersions(name)])),
    releaseTags: releaseTags(),
  });
}

function publishPackage(release: PackageRelease, archiveFolder: string): void {
  const packageFolder = join(PACKAGES_FOLDER, release.folder);
  const packOutput = runCommand(
    'pnpm',
    ['pack', '--json', '--pack-destination', archiveFolder],
    packageFolder,
  );
  const { filename }: { readonly filename: string } = JSON.parse(packOutput);
  console.log(`Publish ${release.tag}`);
  execFileSync('npm', ['publish', filename], { cwd: archiveFolder, stdio: 'inherit' });
}

function createRelease(release: PackageRelease, target: string): void {
  const changelog = readFileSync(join(PACKAGES_FOLDER, release.folder, 'CHANGELOG.md'), 'utf8');
  console.log(`Make the GitHub release ${release.tag}`);
  runCommand('gh', [
    'release',
    'create',
    release.tag,
    '--target',
    target,
    '--title',
    release.tag,
    '--notes',
    releaseNotes(changelog, release.version),
  ]);
}

function printPlan(): void {
  console.log(JSON.stringify(currentPlan()));
}

function publishPlan(): void {
  const archiveFolder = mkdtempSync(join(FOLDER_WITHOUT_DEV_ENGINES, 'lhcms-release-'));
  const target = runCommand('git', ['rev-parse', 'HEAD']).trim();
  for (const release of currentPlan()) {
    if (release.steps.includes('publish')) {
      publishPackage(release, archiveFolder);
    }
    if (release.steps.includes('release')) {
      createRelease(release, target);
    }
  }
}

const COMMANDS: Readonly<Record<string, () => void>> = { plan: printPlan, publish: publishPlan };
const commandName = process.argv[2] ?? '';
const command = COMMANDS[commandName];
if (command === undefined) {
  throw new Error(`Expected the command "plan" or "publish", got "${commandName}".`);
}
command();
