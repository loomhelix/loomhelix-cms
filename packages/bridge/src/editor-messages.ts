export type EditorMessage =
  | { readonly type: 'lhcms:highlight'; readonly blockId: string | null }
  | { readonly type: 'lhcms:hover'; readonly blockId: string | null }
  | { readonly type: 'lhcms:scroll-to'; readonly blockId: string };

export function readEditorMessage(data: unknown): EditorMessage | undefined {
  if (typeof data !== 'object' || data === null) {
    return undefined;
  }
  const { type, blockId } = data as Readonly<Record<string, unknown>>;
  if ((type === 'lhcms:highlight' || type === 'lhcms:hover') && isBlockIdOrNull(blockId)) {
    return { type, blockId };
  }
  if (type === 'lhcms:scroll-to' && typeof blockId === 'string') {
    return { type, blockId };
  }
  return undefined;
}

function isBlockIdOrNull(value: unknown): value is string | null {
  return typeof value === 'string' || value === null;
}
