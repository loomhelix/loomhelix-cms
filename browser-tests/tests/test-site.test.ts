import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vite-plus/test';
import { startChrome, type Browser, type Page } from '../src/chrome.ts';
import { startTestSite, type TestSite } from '@loomhelix-cms/test-site';

const EDITOR = `document.querySelector('lhcms-editor').shadowRoot`;
const PREVIEW = `${EDITOR}.querySelector('iframe').contentDocument`;
const PREVIEW_IS_READY = `${PREVIEW}.readyState === 'complete' && ${PREVIEW}.querySelector('[data-lhcms-block]') !== null`;
const FIELDS_HEADING = `${EDITOR}.querySelector('.fields h2')?.textContent.trim()`;
const STATUS = `${EDITOR}.querySelector('[role=status]')?.textContent.trim()`;
const ALERT = `${EDITOR}.querySelector('[role=alert]')?.textContent.trim()`;
const SHARED_BUTTONS = `[...${EDITOR}.querySelectorAll('.shared button')]`;

let browser: Browser;
let site: TestSite;
let page: Page;

beforeAll(async () => {
  [browser, site] = await Promise.all([startChrome(), startTestSite()]);
});

afterAll(async () => {
  await browser.close();
  await site.close();
});

afterEach(async () => {
  expect(page.errors).toStrictEqual([]);
  await page.close();
});

async function openEditor(path: string): Promise<void> {
  page = await browser.openPage(`${site.origin}${path}`);
  await page.waitFor(PREVIEW_IS_READY);
}

async function clickInPreview(selector: string): Promise<void> {
  const { x, y } = await page.evaluate<{ x: number; y: number }>(`(() => {
    const frame = ${EDITOR}.querySelector('iframe').getBoundingClientRect();
    const target = ${PREVIEW}.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
    return { x: frame.x + target.x + target.width / 2, y: frame.y + target.y + target.height / 2 };
  })()`);
  await page.click(x, y);
}

async function typeInto(fieldId: string, value: string): Promise<void> {
  await page.evaluate(`(() => {
    const input = ${EDITOR}.getElementById(${JSON.stringify(fieldId)});
    input.value = ${JSON.stringify(value)};
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  })()`);
}

async function clickButton(text: string): Promise<void> {
  await page.evaluate(
    `[...${EDITOR}.querySelectorAll('button')].find((button) => button.textContent.trim() === ${JSON.stringify(text)}).click()`,
  );
}

async function save(savedText: string): Promise<void> {
  await page.evaluate(`${EDITOR}.querySelector('button.save').click()`);
  await page.waitFor(`${STATUS} === ${JSON.stringify(savedText)}`);
}

async function textOf(path: string): Promise<string> {
  return (await fetch(`${site.origin}${path}`)).text();
}

describe('the editor of the test site', () => {
  it('opens the fields of a block after a click on the block in the preview', async () => {
    await openEditor('/cms');
    await clickInPreview('h1');
    await page.waitFor(`${FIELDS_HEADING} === 'Hero banner'`);

    expect(await page.evaluate(`${PREVIEW}.location.pathname`)).toBe('/cms/preview');
  });

  it('hides the add button of a slot that has its largest number of blocks', async () => {
    const addColumnButtons = `[...${EDITOR}.querySelectorAll('.add button')].filter((button) => button.textContent.trim() === '+ Column')`;
    await openEditor('/cms');
    const buttonsBefore = await page.evaluate<number>(`${addColumnButtons}.length`);
    await page.evaluate(`${addColumnButtons}[0].click()`);
    await page.waitFor(`${FIELDS_HEADING} === 'Column'`);
    await page.evaluate(
      `[...${EDITOR}.querySelectorAll('button')].find((button) => button.textContent.trim() === '← Blocks').click()`,
    );
    await page.waitFor(`${EDITOR}.querySelector('.tree') !== null`);

    expect([
      buttonsBefore,
      await page.evaluate<number>(`${addColumnButtons}.length`),
    ]).toStrictEqual([1, 0]);
  });

  it('adds a shared block to a slot', async () => {
    await openEditor('/cms');
    const buttonTexts = await page.evaluate(
      `${SHARED_BUTTONS}.map((button) => button.textContent.trim())`,
    );
    await page.evaluate(`${SHARED_BUTTONS}[0].click()`);
    await page.waitFor(`${PREVIEW}.querySelectorAll('.notice').length === 2`);

    expect(buttonTexts).toStrictEqual(['+ Notice: opening-hours']);
    expect(
      await page.evaluate(
        `[...${EDITOR}.querySelectorAll('.block .summary')].filter((summary) => summary.textContent === 'Shared: opening-hours').length`,
      ),
    ).toBe(2);
  });

  it('opens a shared block from the page, and goes back to the page', async () => {
    const hint = `${EDITOR}.querySelector('.hint')?.textContent.trim()`;
    await openEditor('/cms');
    await clickInPreview('.notice');
    await page.waitFor(`${FIELDS_HEADING} === 'Notice'`);
    await clickButton('Edit the shared block');
    await page.waitFor(`${EDITOR}.getElementById('field-text') !== null`);
    const sharedBlockHint = await page.evaluate(hint);
    await clickButton('← Back');
    await page.waitFor(
      `${EDITOR}.querySelector('select') !== null && ${EDITOR}.getElementById('field-text') === null && ${FIELDS_HEADING} === 'Notice'`,
    );

    expect(sharedBlockHint).toBe(
      'This is the shared block "opening-hours". A change shows on each page with it.',
    );
    expect(await page.evaluate(hint)).toBe(
      'This block shows the shared block "opening-hours". A change of the shared block shows on each page with it.',
    );
  });

  it('shows the labels of the options of a choice field', async () => {
    await openEditor('/cms');
    await clickInPreview('h1');
    await page.waitFor(`${FIELDS_HEADING} === 'Hero banner'`);

    expect(
      await page.evaluate(
        `[...${EDITOR}.querySelectorAll('.choice')].map((choice) => choice.textContent.trim())`,
      ),
    ).toStrictEqual(['Light', 'Dark', 'Brand color']);
  });

  it('shows a change in the preview, and puts it on the live page after a save', async () => {
    await openEditor('/cms');
    await clickInPreview('h1');
    await page.waitFor(`${FIELDS_HEADING} === 'Hero banner'`);
    await typeInto('field-title', 'Walnut desks');
    await page.waitFor(`${PREVIEW}.querySelector('h1').textContent === 'Walnut desks'`);
    const liveBeforeSave = await textOf('/');
    await save('The page is saved.');
    const stored = JSON.parse(await readFile(join(site.pagesFolder, 'home.json'), 'utf8'));

    expect(liveBeforeSave).not.toContain('Walnut desks');
    expect(await textOf('/')).toContain('Walnut desks');
    expect(stored.root.slots.main[0].props.title).toBe('Walnut desks');
  });

  it('keeps a change that the client makes while the page saves', async () => {
    await openEditor('/cms');
    await page.evaluate(`(() => {
      const send = window.fetch;
      window.fetch = (address, init) =>
        init?.method === 'PUT'
          ? new Promise((resolve) => {
              window.finishSave = () => resolve(send(address, init));
            })
          : send(address, init);
    })()`);
    await clickInPreview('h1');
    await page.waitFor(`${FIELDS_HEADING} === 'Hero banner'`);
    await typeInto('field-title', 'Desks of the week');
    await page.evaluate(`${EDITOR}.querySelector('button.save').click()`);
    await page.waitFor(`typeof window.finishSave === 'function'`);
    await typeInto('field-subtitle', 'Made in our workshop.');
    await page.evaluate('window.finishSave()');
    await page.waitFor(`${STATUS} === 'The page is saved.'`);

    expect(
      await page.evaluate(
        `[${EDITOR}.getElementById('field-subtitle').value, ${EDITOR}.querySelector('button.save').disabled]`,
      ),
    ).toStrictEqual(['Made in our workshop.', false]);
  });

  it('edits a block document, and puts it on each page that shows it after a save', async () => {
    const newText = 'Open every day from 8 to 18.';
    await openEditor('/edit/opening-hours');
    await typeInto('field-text', newText);
    await page.waitFor(`${PREVIEW}.body.textContent.includes('${newText}')`);
    const pagesBeforeSave = [await textOf('/visit'), await textOf('/')];
    await save('The block is saved.');

    expect(pagesBeforeSave.filter((text) => text.includes(newText))).toStrictEqual([]);
    expect([await textOf('/visit'), await textOf('/')]).toStrictEqual([
      expect.stringContaining(newText),
      expect.stringContaining(newText),
    ]);
  });
});

describe('the editor of a site without pages', () => {
  let emptySite: TestSite;

  beforeAll(async () => {
    emptySite = await startTestSite();
    const files = await readdir(emptySite.pagesFolder);
    await Promise.all(files.map((file) => rm(join(emptySite.pagesFolder, file))));
  });

  afterAll(async () => {
    await emptySite.close();
  });

  it('tells the client how to make the first page', async () => {
    page = await browser.openPage(`${emptySite.origin}/cms`);
    await page.waitFor(`${STATUS} !== undefined`);

    expect([
      await page.evaluate(STATUS),
      await page.evaluate(`${EDITOR}.querySelector('.preview .empty').textContent`),
    ]).toStrictEqual([
      'The site has no pages yet. To make a page, select "New page".',
      'No page is open.',
    ]);
  });
});

describe('the editor of a page with an invalid block reference', () => {
  let referenceSite: TestSite;

  beforeAll(async () => {
    referenceSite = await startTestSite();
    const homeFile = join(referenceSite.pagesFolder, 'home.json');
    const homeText = await readFile(homeFile, 'utf8');
    await writeFile(
      homeFile,
      homeText.replace('"type": "Notice", "document"', '"type": "Hero", "document"'),
    );
  });

  afterAll(async () => {
    await referenceSite.close();
  });

  it('shows the error of the block reference in the block tree', async () => {
    const errorTitle = `${EDITOR}.querySelector('.block-error')?.title`;
    page = await browser.openPage(`${referenceSite.origin}/cms`);
    await page.waitFor(`${errorTitle} !== undefined`);

    expect(await page.evaluate(errorTitle)).toBe(
      'The block "hours" has the type "Hero", but the root block of the document "opening-hours" has the type "Notice".',
    );
  });
});

describe('the editor of a block document with a slot', () => {
  let slotSite: TestSite;

  beforeAll(async () => {
    slotSite = await startTestSite((schema) => {
      schema.blocks.Notice.slots = { more: { allow: ['Notice'] } };
      return schema;
    });
    const closingNote = {
      formatVersion: 0,
      root: {
        id: 'closing-note',
        type: 'Notice',
        version: 1,
        props: { text: 'Closed on holidays.', tone: 'calm' },
        slots: { more: [{ id: 'hours', type: 'Notice', document: 'opening-hours' }] },
      },
    };
    await writeFile(join(slotSite.pagesFolder, 'closing-note.json'), JSON.stringify(closingNote));
  });

  afterAll(async () => {
    await slotSite.close();
  });

  it('does not add a shared block that shows the open block', async () => {
    page = await browser.openPage(`${slotSite.origin}/edit/opening-hours`);
    await page.waitFor(`${SHARED_BUTTONS}.length === 1`);
    await page.evaluate(`${SHARED_BUTTONS}[0].click()`);
    await page.waitFor(`${ALERT} !== undefined`);

    expect(await page.evaluate(ALERT)).toBe(
      'The shared block "closing-note" cannot go here, because it shows this block.',
    );
    expect(await page.evaluate(`${EDITOR}.querySelectorAll('.block').length`)).toBe(0);
  });
});

describe('the editor with a record field', () => {
  let recordSite: TestSite;

  beforeAll(async () => {
    recordSite = await startTestSite((schema) => {
      schema.blocks.Hero.fields.product = {
        type: 'record',
        source: 'products',
        label: 'Product',
        optional: true,
      };
      return schema;
    });
  });

  afterAll(async () => {
    await recordSite.close();
  });

  it('finds a product by its name, and stores its id', async () => {
    const choice = `${EDITOR}.getElementById('field-product-choice')?.textContent.trim()`;
    const results = `[...${EDITOR}.querySelectorAll('.record-results button')]`;
    page = await browser.openPage(`${recordSite.origin}/cms`);
    await page.waitFor(PREVIEW_IS_READY);
    await clickInPreview('h1');
    await page.waitFor(`${choice} === 'No record is selected.'`);
    await typeInto('field-product', 'shelf');
    await page.waitFor(`${results}.length === 1`);
    await page.evaluate(`${results}[0].click()`);
    await page.waitFor(`${choice} === 'Pine shelf'`);
    await save('The page is saved.');
    const stored = JSON.parse(await readFile(join(recordSite.pagesFolder, 'home.json'), 'utf8'));

    expect(stored.root.slots.main[0].props.product).toBe('pine-shelf');
  });
});

describe('the editor with image uploads', () => {
  const PHOTO_FILE = fileURLToPath(new URL('../fixtures/photo.png', import.meta.url));
  let uploadSite: TestSite;

  beforeAll(async () => {
    uploadSite = await startTestSite();
  });

  afterAll(async () => {
    await uploadSite.close();
  });

  it('uploads an image for the hero, measures it, and shows it on the live page', async () => {
    const thumbnail = `${EDITOR}.querySelector('lhcms-image-field .thumbnail')`;
    page = await browser.openPage(`${uploadSite.origin}/cms`);
    await page.waitFor(PREVIEW_IS_READY);
    await clickInPreview('h1');
    await page.waitFor(`${FIELDS_HEADING} === 'Hero banner'`);
    await page.chooseFiles(`${EDITOR}.getElementById('field-image-file')`, [PHOTO_FILE]);
    await page.waitFor(
      `${thumbnail}?.getAttribute('src').startsWith('/uploads/') && ${thumbnail}.complete`,
    );
    await page.waitFor(`${PREVIEW}.querySelector('.hero-image')?.getAttribute('width') === '30'`);
    await save('The page is saved.');
    const stored = JSON.parse(await readFile(join(uploadSite.pagesFolder, 'home.json'), 'utf8'));
    const { src } = stored.root.slots.main[0].props.image;
    const image = await fetch(`${uploadSite.origin}${src}`);
    const livePage = await (await fetch(`${uploadSite.origin}/`)).text();

    expect(stored.root.slots.main[0].props.image).toStrictEqual({
      src: expect.stringMatching(/^\/uploads\/[0-9a-f]{32}\.png$/),
      alt: '',
      width: 30,
      height: 20,
    });
    expect(livePage).toMatch(
      new RegExp(
        `<img\\s+class="hero-image"\\s+src="${src}"\\s+alt=""\\s+width="30"\\s+height="20"`,
      ),
    );
    expect([image.status, image.headers.get('content-type')]).toStrictEqual([200, 'image/png']);
  });

  it('puts a slow upload into the block that started it', async () => {
    const homeFile = join(uploadSite.pagesFolder, 'home.json');
    const before = JSON.parse(await readFile(homeFile, 'utf8'));
    page = await browser.openPage(`${uploadSite.origin}/cms`);
    await page.waitFor(PREVIEW_IS_READY);
    await page.evaluate(`(() => {
      const send = window.fetch;
      window.fetch = (address, init) =>
        String(address).endsWith('/uploads')
          ? new Promise((resolve) => {
              window.finishUpload = () => resolve(send(address, init));
            })
          : send(address, init);
    })()`);
    await clickInPreview('h1');
    await page.waitFor(`${FIELDS_HEADING} === 'Hero banner'`);
    await page.chooseFiles(`${EDITOR}.getElementById('field-image-file')`, [PHOTO_FILE]);
    await page.waitFor(`typeof window.finishUpload === 'function'`);
    await clickInPreview('div.text');
    await page.waitFor(`${FIELDS_HEADING} === 'Text'`);
    await page.evaluate('window.finishUpload()');
    await page.waitFor(`${EDITOR}.querySelector('button.save').disabled === false`);
    await save('The page is saved.');
    const [hero, intro] = JSON.parse(await readFile(homeFile, 'utf8')).root.slots.main;

    expect([
      hero.props.image.src === before.root.slots.main[0].props.image?.src,
      intro.props,
    ]).toStrictEqual([false, before.root.slots.main[1].props]);
  });
});

describe('the editor with number and boolean fields', () => {
  let fieldSite: TestSite;

  beforeAll(async () => {
    fieldSite = await startTestSite((schema) => {
      Object.assign(schema.blocks.Button.fields, {
        rank: { type: 'number', label: 'Rank', integer: true, min: 1, max: 5, optional: true },
        newTab: { type: 'boolean', label: 'Open in a new tab', optional: true },
      });
      return schema;
    });
  });

  afterAll(async () => {
    await fieldSite.close();
  });

  it('shows a number input with its limits and a check box', async () => {
    page = await browser.openPage(`${fieldSite.origin}/cms`);
    await page.waitFor(PREVIEW_IS_READY);
    await clickInPreview('a.button');
    await page.waitFor(`${FIELDS_HEADING} === 'Button'`);
    await typeInto('field-rank', '7');
    await page.evaluate(`${EDITOR}.getElementById('field-newTab').click()`);
    const rankError = `${EDITOR}.getElementById('field-rank-error').textContent`;
    await page.waitFor(`${rankError} === 'Enter a number from 1 to 5.'`);

    expect(
      await page.evaluate(`(() => {
        const rank = ${EDITOR}.getElementById('field-rank');
        const newTab = ${EDITOR}.getElementById('field-newTab');
        return [rank.type, rank.min, rank.max, rank.step, newTab.type, newTab.checked];
      })()`),
    ).toStrictEqual(['number', '1', '5', '1', 'checkbox', true]);
  });

  it('keeps a minus sign that replaces the number in the input', async () => {
    page = await browser.openPage(`${fieldSite.origin}/cms`);
    await page.waitFor(PREVIEW_IS_READY);
    await clickInPreview('a.button');
    await page.waitFor(`${FIELDS_HEADING} === 'Button'`);
    await typeInto('field-rank', '3');

    expect(
      await page.evaluate(`(async () => {
        const editor = document.querySelector('lhcms-editor');
        const rank = editor.shadowRoot.getElementById('field-rank');
        await editor.updateComplete;
        rank.focus();
        rank.select();
        document.execCommand('insertText', false, '-');
        await editor.updateComplete;
        return rank.validity.badInput;
      })()`),
    ).toBe(true);
  });
});
