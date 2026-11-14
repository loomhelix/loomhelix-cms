import type { Block, BlockReference } from './types.ts';

export function isBlockReference(item: Block | BlockReference): item is BlockReference {
  return Object.hasOwn(item, 'document');
}
