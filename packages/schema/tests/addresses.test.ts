import { describe, expect, it } from 'vite-plus/test';
import { isImageSource, isLink, isPath } from '../src/addresses.ts';

describe('isLink', () => {
  it.each([
    '/menu',
    'menu.html',
    '#top',
    '?page=2',
    'https://example.com/menu',
    'HTTPS://example.com/menu',
    'http://example.com',
    'mailto:hello@example.com',
    'tel:+15550100',
    '/menu:coffee',
  ])('accepts %j', (link) => {
    expect(isLink(link)).toBe(true);
  });

  it.each([
    '',
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,hello',
    'ftp://example.com',
    '//example.com',
    '/our menu',
    '/menu\n',
    '\\\\server\\menu',
    '/menu\u0000',
    42,
    null,
  ])('rejects %j', (link) => {
    expect(isLink(link)).toBe(false);
  });
});

describe('isImageSource', () => {
  it.each(['/images/cup.jpg', 'https://example.com/cup.jpg', 'http://example.com/cup.jpg'])(
    'accepts %j',
    (source) => {
      expect(isImageSource(source)).toBe(true);
    },
  );

  it.each(['mailto:hello@example.com', 'tel:+15550100', 'javascript:alert(1)', ''])(
    'rejects %j',
    (source) => {
      expect(isImageSource(source)).toBe(false);
    },
  );
});

describe('isPath', () => {
  it.each(['/', '/menu', '/menu/coffee', '/menu.html', '/кофе'])('accepts %j', (path) => {
    expect(isPath(path)).toBe(true);
  });

  it.each([
    '',
    'menu',
    '/menu/',
    '//menu',
    '/menu//coffee',
    '/menu/../admin',
    '/menu/.',
    '/menu?page=2',
    '/menu#top',
    '/our menu',
    '/menu\\coffee',
    7,
  ])('rejects %j', (path) => {
    expect(isPath(path)).toBe(false);
  });
});
