import type { Mark, Node, ResolvedPos } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import { richTextSchema } from './rich-text-conversion.ts';

const { link } = richTextSchema.marks;

export interface LinkRange {
  readonly from: number;
  readonly to: number;
  readonly href: string | undefined;
}

export function findLinkRange(state: EditorState): LinkRange | undefined {
  const { empty, from, to, $from } = state.selection;
  if (!empty) {
    return { from, to, href: findFirstHref(state.doc, from, to) };
  }
  const mark = findLinkMark($from.nodeAfter) ?? findLinkMark($from.nodeBefore);
  return mark === undefined ? undefined : { ...findMarkExtent($from, mark), href: hrefOf(mark) };
}

export function setLink(state: EditorState, range: LinkRange, href: string): Transaction {
  return state.tr
    .removeMark(range.from, range.to, link)
    .addMark(range.from, range.to, link.create({ href }));
}

export function removeLink(state: EditorState, range: LinkRange): Transaction {
  return state.tr.removeMark(range.from, range.to, link);
}

function findLinkMark(node: Node | null): Mark | undefined {
  return node === null ? undefined : link.isInSet(node.marks);
}

function findFirstHref(document: Node, from: number, to: number): string | undefined {
  let href: string | undefined;
  document.nodesBetween(from, to, (node) => {
    const mark = findLinkMark(node);
    if (href === undefined && mark !== undefined) {
      href = hrefOf(mark);
    }
  });
  return href;
}

function findMarkExtent($position: ResolvedPos, mark: Mark): { from: number; to: number } {
  const start = $position.start();
  let runStart: number | undefined;
  let extent = { from: $position.pos, to: $position.pos };
  $position.parent.forEach((child, offset) => {
    if (!mark.isInSet(child.marks)) {
      runStart = undefined;
      return;
    }
    runStart ??= offset;
    const runEnd = offset + child.nodeSize;
    if (runStart <= $position.parentOffset && $position.parentOffset <= runEnd) {
      extent = { from: start + runStart, to: start + runEnd };
    }
  });
  return extent;
}

function hrefOf(mark: Mark): string {
  return String(mark.attrs['href']);
}
