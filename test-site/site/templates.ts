import { html, richText, type Image, type TemplatesOf } from '@loomhelix-cms/render-html';
import type schema from './blocks.ts';

export const templates = {
  Landing: ({ props, slots }) =>
    html`<!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <title>${props.title}</title>
        </head>
        <body>
          <main>${slots.main}</main>
        </body>
      </html>`,

  Hero: ({ props }) =>
    html`<section class="hero hero-${props.background}">
      <h1>${props.title}</h1>
      ${props.subtitle === undefined ? '' : html`<p>${props.subtitle}</p>`}
      ${props.image === undefined ? '' : heroImage(props.image)}
    </section>`,

  Text: ({ props }) => html`<div class="text">${richText(props.body)}</div>`,

  Columns: ({ slots }) => html`<div class="columns">${slots.items}</div>`,

  Column: ({ slots }) => html`<div class="column">${slots.content}</div>`,

  Notice: ({ props }) => html`<p class="notice notice-${props.tone}">${props.text}</p>`,

  Button: ({ props }) =>
    html`<a class="button button-${props.style}" href="${props.link}">${props.label}</a>`,
} satisfies TemplatesOf<typeof schema>;

function heroImage(image: Image) {
  return image.width === undefined || image.height === undefined
    ? html`<img class="hero-image" src="${image.src}" alt="${image.alt}" />`
    : html`<img
        class="hero-image"
        src="${image.src}"
        alt="${image.alt}"
        width="${image.width}"
        height="${image.height}"
      />`;
}
