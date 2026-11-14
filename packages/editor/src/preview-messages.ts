export type BridgeMessage =
  | { readonly type: 'lhcms:ready' }
  | { readonly type: 'lhcms:select'; readonly blockId: string };

export type EditorMessage =
  | { readonly type: 'lhcms:highlight'; readonly blockId: string | null }
  | { readonly type: 'lhcms:hover'; readonly blockId: string | null }
  | { readonly type: 'lhcms:scroll-to'; readonly blockId: string };

export function readBridgeMessage(data: unknown): BridgeMessage | undefined {
  if (typeof data !== 'object' || data === null) {
    return undefined;
  }
  const { type, blockId } = data as Readonly<Record<string, unknown>>;
  if (type === 'lhcms:ready') {
    return { type };
  }
  if (type === 'lhcms:select' && typeof blockId === 'string') {
    return { type, blockId };
  }
  return undefined;
}
