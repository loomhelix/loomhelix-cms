import { describe, expect, it } from 'vite-plus/test';
import { html } from '../src/index.ts';

describe('html', () => {
  it.each<[string, unknown, string]>([
    [
      'escapes the special characters of a string',
      '<b>"Tom" & \'Jerry\'</b>',
      '&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;',
    ],
    ['puts a number as text', 42, '42'],
    ['puts nothing for undefined', undefined, ''],
    ['puts nothing for null', null, ''],
    ['puts nothing for false', false, ''],
    ['keeps the markup of a fragment', html`<em>Fresh</em>`, '<em>Fresh</em>'],
    ['joins a list of values', [html`<li>One</li>`, '<Two>'], '<li>One</li>&lt;Two&gt;'],
  ])('%s', (_, value, expected) => {
    expect(html`<p>${value}</p>`.text).toBe(`<p>${expected}</p>`);
  });

  it.each([
    '<script>alert(1)</script>',
    '"><img src=x onerror=alert(1)>',
    "' onmouseover='alert(1)",
    '</p><svg onload=alert(1)>',
    '&lt;script&gt;',
    '<!--',
  ])('keeps %j inside the text and the attribute', (payload) => {
    expect(html`<p title="${payload}">${payload}</p>`.text).toMatch(
      /^<p title="[^<>"']*">[^<>"']*<\/p>$/,
    );
  });

  it('escapes a value in a quoted attribute', () => {
    expect(html`<a href="${'/menu?size=small&milk="oat"'}" title="${"it's"}">Menu</a>`.text).toBe(
      '<a href="/menu?size=small&amp;milk=&quot;oat&quot;" title="it&#39;s">Menu</a>',
    );
  });

  it.each<[string, () => { readonly text: string }, string]>([
    [
      'an equals sign in the text of an element',
      () => html`<p>Price = ${5}</p>`,
      '<p>Price = 5</p>',
    ],
    [
      'a choice value in a class name',
      () => html`<section class="hero hero-${'dark'}"></section>`,
      '<section class="hero hero-dark"></section>',
    ],
    [
      'a value in a data attribute',
      () => html`<div data-note="${'a < b'}"></div>`,
      '<div data-note="a &lt; b"></div>',
    ],
    [
      'a value at the end of a path in an href attribute',
      () => html`<a href="/products/${'tea'}">Tea</a>`,
      '<a href="/products/tea">Tea</a>',
    ],
    [
      'an empty value in an href attribute',
      () => html`<a href="${undefined}">Menu</a>`,
      '<a href="">Menu</a>',
    ],
    [
      'a srcset with descriptors',
      () => html`<img srcset="${'/cup.jpg'} 1x, ${'/cup-large.jpg'} 2x" />`,
      '<img srcset="/cup.jpg 1x, /cup-large.jpg 2x" />',
    ],
    [
      'a value after a script element',
      () =>
        html`<script></script>
          <b>${'Hi'}</b>`,
      '<script></script><b>Hi</b>',
    ],
  ])('accepts %s', (_, render, expected) => {
    expect(render().text.replaceAll(/>\s+</g, '><')).toBe(expected);
  });

  it.each<[string, () => unknown, string]>([
    [
      'an attribute value without quotes',
      () => html`<div class=${'hero'}></div>`,
      'A value in a tag must be inside the quotes of an attribute',
    ],
    [
      'a value in a tag outside an attribute',
      () => html`<div ${'hidden'}></div>`,
      'A value in a tag must be inside the quotes of an attribute',
    ],
    [
      'a value in an event handler attribute',
      () => html`<button onclick="${'alert(1)'}"></button>`,
      'A template cannot put a value into the "onclick" attribute, because the browser runs it as a script.',
    ],
    [
      'a value in a style attribute',
      () => html`<div style="${'color: red'}"></div>`,
      'A template cannot put a value into the "style" attribute, because CSS can load addresses.',
    ],
    [
      'a value in a srcdoc attribute',
      () => html`<iframe srcdoc="${'<p>Hi</p>'}"></iframe>`,
      'because the browser reads its value as HTML.',
    ],
    [
      'a value in a script element',
      () =>
        html`<script>
          const name = ${'Tom'};
        </script>`,
      'A template cannot put a value into a script element.',
    ],
    [
      'an unsafe link in an href attribute',
      () => html`<a href="${'javascript:alert(1)'}">Menu</a>`,
      'The "href" attribute cannot get "javascript:alert(1)", because it is not a link that follows section 3.2 of the spec.',
    ],
    [
      'an unsafe link after a > in a quoted value',
      () => html`<a title="1 > 0" href="${'javascript:alert(1)'}">Menu</a>`,
      'is not a link that follows section 3.2 of the spec.',
    ],
    [
      'two values that make an unsafe link together',
      () => html`<a href="${'javascript'}${':alert(1)'}">Menu</a>`,
      'The "href" attribute cannot get "javascript:alert(1)", because it is not a link that follows section 3.2 of the spec.',
    ],
    [
      'a value and the text of the template that make an unsafe link together',
      () => html`<a href="${'javascript'}:alert(1)">Menu</a>`,
      'The "href" attribute cannot get "javascript:alert(1)"',
    ],
    [
      'an unsafe link in a srcset',
      () => html`<img srcset="${'/cup.jpg'} 1x, ${'javascript:alert(1)'} 2x" />`,
      'The "srcset" attribute cannot get',
    ],
    [
      'a template that ends inside an attribute value',
      () => html`<a href="${'javascript'}`,
      'A template must close each tag, attribute value, script element, and style element that it opens.',
    ],
    [
      'a template that ends inside a tag',
      () => html`<div class="note"`,
      'A template must close each tag',
    ],
    [
      'a template that ends inside a style element',
      () => html`<style>`,
      'A template must close each tag',
    ],
    [
      'HTML in an attribute',
      () => html`<a href="/menu" title="${html`<b>Menu</b>`}">Menu</a>`,
      'A template cannot put HTML into the "title" attribute. Put a string or a number.',
    ],
    [
      'an object',
      () => html`<p>${{ src: '/cup.jpg' }}</p>`,
      'A template cannot put a value of the type "object" into HTML. Put a string, a number, or the result of html.',
    ],
  ])('rejects %s', (_, render, message) => {
    expect(render).toThrow(message);
  });
});
