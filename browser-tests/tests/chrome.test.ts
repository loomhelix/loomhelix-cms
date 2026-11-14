import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { startChrome, type Browser } from '../src/chrome.ts';

const CLOSED_PORT_ADDRESS = 'http://127.0.0.1:9';

let browser: Browser;

beforeAll(async () => {
  browser = await startChrome();
});

afterAll(async () => {
  await browser.close();
});

function pageAddress(body: string): string {
  return `data:text/html,${encodeURIComponent(`<!doctype html><title>Test</title>${body}`)}`;
}

describe('startChrome', () => {
  it('opens a page and gives the value of an expression', async () => {
    const page = await browser.openPage(pageAddress('<p>Fresh coffee</p>'));
    await page.waitFor(`document.querySelector('p')`);

    expect(await page.evaluate(`document.querySelector('p').textContent`)).toBe('Fresh coffee');
    expect(page.errors).toStrictEqual([]);
    await page.close();
  });

  it('clicks at a point of the page', async () => {
    const page = await browser.openPage(
      pageAddress(
        `<button style="position: fixed; inset: 0" onclick="this.textContent = 'Ordered'">Order</button>`,
      ),
    );
    await page.waitFor(`document.querySelector('button')`);
    await page.click(100, 100);

    await page.waitFor(`document.querySelector('button').textContent === 'Ordered'`);
    await page.close();
  });

  it.each([
    {
      source: 'an exception',
      body: `<script>throw new Error('The menu is broken.')</script>`,
      error: 'Error: The menu is broken.',
    },
    {
      source: 'console.error',
      body: `<script>console.error('The menu is broken.', 2)</script>`,
      error: 'The menu is broken. 2',
    },
    {
      source: 'a failed request',
      body: `<img src="${CLOSED_PORT_ADDRESS}/menu.png" alt="">`,
      error: `${CLOSED_PORT_ADDRESS}/menu.png`,
    },
  ])('keeps the error text of $source', async ({ body, error }) => {
    const page = await browser.openPage(pageAddress(body));

    await expect.poll(() => page.errors).toStrictEqual([expect.stringContaining(error)]);
    await page.close();
  });

  it('does not keep the failed request of the browser for /favicon.ico', async () => {
    const page = await browser.openPage(
      pageAddress(
        `<img src="${CLOSED_PORT_ADDRESS}/favicon.ico" alt=""><img src="${CLOSED_PORT_ADDRESS}/menu.png" alt="">`,
      ),
    );
    await page.waitFor(`document.readyState === 'complete'`);

    await expect.poll(() => page.errors).toStrictEqual([expect.stringContaining('/menu.png')]);
    await page.close();
  });

  it('rejects an expression that throws', async () => {
    const page = await browser.openPage(pageAddress(''));

    await expect(page.evaluate(`missingFunction()`)).rejects.toThrow(
      'The page cannot evaluate missingFunction(): ReferenceError: missingFunction is not defined',
    );
    await page.close();
  });
});
