import {
  isBlockReference,
  type Block,
  type BlockReference,
  type PageDocument,
  type TypeDefinition,
} from '@loomhelix-cms/schema';

type SlotItem = Block | BlockReference;

export interface BlockPlace {
  readonly parentId: string;
  readonly slotName: string;
  readonly index: number;
}

export interface Removal {
  readonly block: SlotItem;
  readonly place: BlockPlace;
}

export type MoveDirection = 'up' | 'down';

const ID_PART_BYTES = 4;

export function randomIdPart(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(ID_PART_BYTES)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export function defaultProps(type: TypeDefinition): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    [...type.fields].flatMap(([name, field]) =>
      field.default === undefined ? [] : [[name, field.default] as const],
    ),
  );
}

export function createBlock(id: string, typeName: string, type: TypeDefinition): Block {
  return { id, type: typeName, version: type.version, props: defaultProps(type) };
}

export function createBlockId(document: PageDocument): string {
  const ids = new Set(collectIds(document.root));
  let id = '';
  do {
    id = `block-${randomIdPart()}`;
  } while (ids.has(id));
  return id;
}

export function findItem(item: SlotItem, id: string): SlotItem | undefined {
  if (item.id === id) {
    return item;
  }
  if (isBlockReference(item)) {
    return undefined;
  }
  for (const children of Object.values(item.slots ?? {})) {
    for (const child of children) {
      const found = findItem(child, id);
      if (found !== undefined) {
        return found;
      }
    }
  }
  return undefined;
}

export function slotChildren(block: Block, slotName: string): readonly SlotItem[] {
  const slots = block.slots ?? {};
  return Object.hasOwn(slots, slotName) ? (slots[slotName] ?? []) : [];
}

export function findPlace(block: Block, id: string): BlockPlace | undefined {
  for (const [slotName, children] of Object.entries(block.slots ?? {})) {
    const index = children.findIndex((child) => child.id === id);
    if (index !== -1) {
      return { parentId: block.id, slotName, index };
    }
    for (const child of children) {
      const place = isBlockReference(child) ? undefined : findPlace(child, id);
      if (place !== undefined) {
        return place;
      }
    }
  }
  return undefined;
}

export function addBlock(
  document: PageDocument,
  parentId: string,
  slotName: string,
  block: SlotItem,
): PageDocument {
  return changeSlot(document, parentId, slotName, (children) => [...children, block]);
}

export function removeBlock(
  document: PageDocument,
  id: string,
): { readonly document: PageDocument; readonly removal: Removal } | undefined {
  const place = findPlace(document.root, id);
  const block = place === undefined ? undefined : findItem(document.root, id);
  if (place === undefined || block === undefined) {
    return undefined;
  }
  return {
    document: changeSlot(document, place.parentId, place.slotName, (children) =>
      children.toSpliced(place.index, 1),
    ),
    removal: { block, place },
  };
}

export function restoreBlock(document: PageDocument, { block, place }: Removal): PageDocument {
  return changeSlot(document, place.parentId, place.slotName, (children) =>
    children.toSpliced(place.index, 0, block),
  );
}

export function moveBlock(
  document: PageDocument,
  id: string,
  direction: MoveDirection,
): PageDocument {
  const place = findPlace(document.root, id);
  if (place === undefined) {
    return document;
  }
  const target = direction === 'up' ? place.index - 1 : place.index + 1;
  return changeSlot(document, place.parentId, place.slotName, (children) => {
    const block = children[place.index];
    const neighbor = children[target];
    if (block === undefined || neighbor === undefined) {
      return children;
    }
    return children.with(place.index, neighbor).with(target, block);
  });
}

export function setProp(
  document: PageDocument,
  blockId: string,
  name: string,
  value: unknown,
): PageDocument {
  const update = (block: Block): Block => {
    const props = Object.fromEntries(Object.entries(block.props).filter(([key]) => key !== name));
    return { ...block, props: value === undefined ? props : { ...props, [name]: value } };
  };
  return { ...document, root: changeBlock(document.root, blockId, update) };
}

function collectIds(item: SlotItem): string[] {
  if (isBlockReference(item)) {
    return [item.id];
  }
  return [
    item.id,
    ...Object.values(item.slots ?? {}).flatMap((children) => children.flatMap(collectIds)),
  ];
}

function changeSlot(
  document: PageDocument,
  parentId: string,
  slotName: string,
  change: (children: readonly SlotItem[]) => readonly SlotItem[],
): PageDocument {
  const update = (block: Block): Block => ({
    ...block,
    slots: { ...block.slots, [slotName]: change(slotChildren(block, slotName)) },
  });
  return { ...document, root: changeBlock(document.root, parentId, update) };
}

function changeBlock(block: Block, id: string, update: (block: Block) => Block): Block {
  if (block.id === id) {
    return update(block);
  }
  if (block.slots === undefined) {
    return block;
  }
  return {
    ...block,
    slots: Object.fromEntries(
      Object.entries(block.slots).map(([slotName, children]) => [
        slotName,
        children.map((child) => (isBlockReference(child) ? child : changeBlock(child, id, update))),
      ]),
    ),
  };
}
