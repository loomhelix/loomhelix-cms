import { isLink, type Mark as MarkName, type RichText, type Span } from '@loomhelix-cms/schema';
import { Fragment, Schema, Slice, type Mark, type Node } from 'prosemirror-model';

const MARK_NAMES: readonly MarkName[] = ['bold', 'italic'];
const LINE_BREAKS = /[\r\n]+/g;

export const richTextSchema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'text*', parseDOM: [{ tag: 'p' }], toDOM: () => ['p', 0] },
    text: {},
  },
  marks: {
    bold: { parseDOM: [{ tag: 'strong' }], toDOM: () => ['strong', 0] },
    italic: { parseDOM: [{ tag: 'em' }], toDOM: () => ['em', 0] },
    link: {
      attrs: { href: {} },
      inclusive: false,
      parseDOM: [{ tag: 'a[href]', getAttrs: (element) => linkAttributes(element) }],
      toDOM: (mark) => ['a', { href: linkOf(mark) }, 0],
    },
  },
});

export function toProseMirror(value: unknown): Node {
  const paragraphs = Array.isArray(value) ? value.map(toParagraph) : [];
  return richTextSchema.node(
    'doc',
    null,
    paragraphs.length > 0 ? paragraphs : [richTextSchema.node('paragraph')],
  );
}

export function fromProseMirror(document: Node): RichText | undefined {
  const paragraphs = document.children
    .filter((paragraph) => paragraph.childCount > 0)
    .map((paragraph) => paragraph.children.map(toSpan));
  return paragraphs.length > 0 ? paragraphs : undefined;
}

export function toPlainTextSlice(text: string, marks: readonly Mark[]): Slice {
  const paragraphs = text
    .split(LINE_BREAKS)
    .filter((line) => line !== '')
    .map((line) => richTextSchema.node('paragraph', null, richTextSchema.text(line, marks)));
  return paragraphs.length > 0 ? new Slice(Fragment.from(paragraphs), 1, 1) : Slice.empty;
}

function toParagraph(paragraph: unknown): Node {
  return richTextSchema.node(
    'paragraph',
    null,
    Array.isArray(paragraph) ? paragraph.flatMap(toTextNodes) : [],
  );
}

function toTextNodes(span: unknown): Node[] {
  if (typeof span !== 'object' || span === null) {
    return [];
  }
  const { text, marks, link } = span as Readonly<Record<string, unknown>>;
  if (typeof text !== 'string' || text === '') {
    return [];
  }
  return [
    richTextSchema.text(text.replaceAll(LINE_BREAKS, ' '), [
      ...toMarks(marks),
      ...toLinkMarks(link),
    ]),
  ];
}

function toMarks(marks: unknown): Mark[] {
  if (!Array.isArray(marks)) {
    return [];
  }
  return MARK_NAMES.filter((name) => marks.includes(name)).map((name) =>
    richTextSchema.marks[name].create(),
  );
}

function toLinkMarks(link: unknown): Mark[] {
  return isLink(link) ? [richTextSchema.marks.link.create({ href: link })] : [];
}

function toSpan(node: Node): Span {
  const marks = MARK_NAMES.filter((name) => node.marks.some((mark) => mark.type.name === name));
  const link = node.marks.find((mark) => mark.type === richTextSchema.marks.link);
  return {
    text: node.textContent,
    ...(marks.length > 0 ? { marks } : {}),
    ...(link === undefined ? {} : { link: linkOf(link) }),
  };
}

function linkOf(mark: Mark): string {
  return String(mark.attrs['href']);
}

function linkAttributes(element: HTMLElement): { href: string } | false {
  const href = element.getAttribute('href');
  return isLink(href) ? { href } : false;
}
