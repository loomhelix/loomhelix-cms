import type { RichText, Span } from '@loomhelix-cms/schema';
import { html, type Html } from './html.ts';

export function richText(value: RichText): Html {
  return html`${value.map((paragraph) => html`<p>${paragraph.map(renderSpan)}</p>`)}`;
}

function renderSpan(span: Span): Html {
  const text = html`${span.text}`;
  const italic = span.marks?.includes('italic') === true ? html`<em>${text}</em>` : text;
  const bold = span.marks?.includes('bold') === true ? html`<strong>${italic}</strong>` : italic;
  return span.link === undefined ? bold : html`<a href="${span.link}">${bold}</a>`;
}
