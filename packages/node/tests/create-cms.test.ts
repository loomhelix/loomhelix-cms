import type { IncomingMessage } from 'node:http';
import { describe, expect, it, vi } from 'vite-plus/test';
import { createCms, createFolderStore, type CmsOptions } from '../src/index.ts';
import { startTestSite, TEMPLATES } from './test-site.ts';

async function answer(
  request: { readonly path: string; readonly headers?: Record<string, string> },
  site: { readonly options?: Partial<CmsOptions>; readonly withNext?: boolean },
) {
  const started = await startTestSite(site);
  try {
    const response = await fetch(`${started.origin}${request.path}`, {
      headers: request.headers ?? {},
    });
    return { status: response.status, text: await response.text() };
  } finally {
    await started.close();
  }
}

describe('createCms', () => {
  it.each([
    [404, true],
    [403, false],
  ])('answers %j to the editor when canEdit gives %j', async (status, canEdit) => {
    const { status: actual } = await answer(
      { path: '/cms/unknown' },
      { options: { canEdit: async () => canEdit } },
    );

    expect(actual).toBe(status);
  });

  it('gives each request to canEdit', async () => {
    const options = {
      canEdit: (request: IncomingMessage) => request.headers.cookie === 'editor=yes',
    };
    const signedIn = await answer(
      { path: '/cms/unknown', headers: { cookie: 'editor=yes' } },
      { options },
    );
    const signedOut = await answer({ path: '/cms/unknown' }, { options });

    expect([signedIn.status, signedOut.status]).toStrictEqual([404, 403]);
  });

  it.each([
    ['/about', true, 'next'],
    ['/cmsx', true, 'next'],
    ['/about', false, 'The page does not exist.'],
    ['/cms/unknown', true, 'The editor has nothing at this address.'],
  ])('answers %j with next %j: %j', async (path, withNext, text) => {
    expect((await answer({ path }, { withNext })).text).toBe(text);
  });

  it('gives an error of canEdit to next', async () => {
    const options = {
      canEdit: () => {
        throw new Error('The session store is down.');
      },
    };

    expect(await answer({ path: '/cms' }, { options, withNext: true })).toStrictEqual({
      status: 500,
      text: 'next: The session store is down.',
    });
  });

  it('answers 500 to an error and reports it when there is no next', async () => {
    const options = {
      canEdit: () => {
        throw new Error('The session store is down.');
      },
    };

    const report = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(await answer({ path: '/cms' }, { options })).toStrictEqual({
      status: 500,
      text: 'The server cannot answer this request.',
    });
    expect(report).toHaveBeenCalledWith(new Error('The session store is down.'));
    report.mockRestore();
  });

  it('refuses options without canEdit', async () => {
    const options = {
      schemaFile: 'blocks.json',
      templates: TEMPLATES,
      store: createFolderStore('.'),
    };

    await expect(createCms(options as unknown as CmsOptions)).rejects.toThrow(
      'createCms needs the option "canEdit"',
    );
  });

  it('refuses templates that do not match the schema', async () => {
    const { Landing } = TEMPLATES;

    await expect(startTestSite({ options: { templates: { Landing } } })).rejects.toThrow(
      'the templates have no "Text"',
    );
  });
});
