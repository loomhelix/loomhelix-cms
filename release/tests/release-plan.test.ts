import { describe, expect, it } from 'vite-plus/test';
import {
  planRelease,
  releaseNotes,
  sortByDependencies,
  versionsFromNpmView,
  type PackageManifest,
} from '../src/release-plan.ts';

function manifest(name: string, dependencies: readonly string[] = []): PackageManifest {
  return {
    folder: name,
    name: `@loomhelix-cms/${name}`,
    version: '0.2.0',
    isPrivate: false,
    dependencies,
  };
}

const SCHEMA = manifest('schema');
const RENDER_HTML = manifest('render-html', ['@loomhelix-cms/schema']);
const NODE = manifest('node', ['@loomhelix-cms/render-html', '@loomhelix-cms/schema', 'busboy']);

describe('planRelease', () => {
  it.each([
    {
      name: 'publishes and releases a version that is not on npm',
      versions: [],
      tags: [],
      expected: ['@loomhelix-cms/schema@0.2.0 publish,release'],
    },
    {
      name: 'only releases a version that is on npm without a release',
      versions: ['0.1.0', '0.2.0'],
      tags: [],
      expected: ['@loomhelix-cms/schema@0.2.0 release'],
    },
    {
      name: 'only publishes a version that has a release but is not on npm',
      versions: ['0.1.0'],
      tags: ['@loomhelix-cms/schema@0.2.0'],
      expected: ['@loomhelix-cms/schema@0.2.0 publish'],
    },
    {
      name: 'skips a version that is on npm and has a release',
      versions: ['0.2.0'],
      tags: ['@loomhelix-cms/schema@0.2.0'],
      expected: [],
    },
  ])('$name', ({ versions, tags, expected }) => {
    const plan = planRelease([SCHEMA], {
      publishedVersions: new Map([[SCHEMA.name, versions]]),
      releaseTags: new Set(tags),
    });

    expect(plan.map(({ tag, steps }) => `${tag} ${steps.join(',')}`)).toStrictEqual(expected);
  });

  it('skips a private package', () => {
    const plan = planRelease([{ ...manifest('test-site'), isPrivate: true }], {
      publishedVersions: new Map(),
      releaseTags: new Set(),
    });

    expect(plan).toStrictEqual([]);
  });
});

describe('sortByDependencies', () => {
  it.each([
    { name: 'keeps an order without dependencies', manifests: [SCHEMA], expected: ['schema'] },
    {
      name: 'puts a dependency before its dependent package',
      manifests: [NODE, RENDER_HTML, SCHEMA],
      expected: ['schema', 'render-html', 'node'],
    },
  ])('$name', ({ manifests, expected }) => {
    expect(sortByDependencies(manifests).map(({ folder }) => folder)).toStrictEqual(expected);
  });

  it('rejects packages that depend on each other', () => {
    const cycle: readonly PackageManifest[] = [
      manifest('schema', ['@loomhelix-cms/render-html']),
      RENDER_HTML,
    ];

    expect(() => sortByDependencies(cycle)).toThrow(
      'The packages @loomhelix-cms/schema, @loomhelix-cms/render-html depend on each other in a cycle.',
    );
  });
});

describe('versionsFromNpmView', () => {
  it.each([
    { name: 'a list of versions', output: '["0.1.0","0.2.0"]', expected: ['0.1.0', '0.2.0'] },
    { name: 'one version', output: '"0.1.0"', expected: ['0.1.0'] },
    { name: 'a package that is not on npm', output: '{"error":{"code":"E404"}}', expected: [] },
  ])('reads $name', ({ output, expected }) => {
    expect(versionsFromNpmView(output)).toStrictEqual(expected);
  });

  it('rejects an error that is not E404', () => {
    expect(() => versionsFromNpmView('{"error":{"code":"ETIMEDOUT"}}')).toThrow(
      'Expected a list of versions from "npm view", got {"error":{"code":"ETIMEDOUT"}}',
    );
  });
});

describe('releaseNotes', () => {
  const CHANGELOG = [
    '# @loomhelix-cms/schema',
    '',
    '## 0.2.0',
    '',
    '### Minor Changes',
    '',
    '- Add the field type `date`.',
    '',
    '## 0.1.0',
    '',
    'The first release.',
    '',
  ].join('\n');

  it.each([
    {
      name: 'a section before another section',
      version: '0.2.0',
      expected: '### Minor Changes\n\n- Add the field type `date`.',
    },
    { name: 'the last section', version: '0.1.0', expected: 'The first release.' },
  ])('gives $name', ({ version, expected }) => {
    expect(releaseNotes(CHANGELOG, version)).toBe(expected);
  });

  it('rejects a version without a section', () => {
    expect(() => releaseNotes(CHANGELOG, '0.3.0')).toThrow(
      'Expected the section "## 0.3.0" in the changelog.',
    );
  });
});
