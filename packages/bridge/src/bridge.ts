import { readEditorMessage } from './editor-messages.ts';

const BLOCK_ATTRIBUTE = 'data-lhcms-block';
const SELECTED_OUTLINE = '2px solid #2563eb';
const HOVERED_OUTLINE = '2px dashed #2563eb';

export function startBridge(editor: Window): void {
  const blocks = findBlocks();
  let selectedId: string | null = null;
  let hoveredId: string | null = null;

  const outlineOf = (id: string): string | undefined => {
    if (id === selectedId) {
      return SELECTED_OUTLINE;
    }
    return id === hoveredId ? HOVERED_OUTLINE : undefined;
  };

  const changeOutlines = (selected: string | null, hovered: string | null): void => {
    const changedIds = new Set([selectedId, hoveredId, selected, hovered]);
    selectedId = selected;
    hoveredId = hovered;
    for (const id of changedIds) {
      const element = id === null ? undefined : blocks.get(id);
      if (id !== null && element !== undefined) {
        setOutline(element, outlineOf(id));
      }
    }
  };

  const selectBlock = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    const blockId = blockIdOf(event.target);
    if (blockId !== undefined) {
      editor.postMessage({ type: 'lhcms:select', blockId }, location.origin);
    }
  };

  const handleMessage = (event: MessageEvent): void => {
    if (event.origin !== location.origin || event.source !== editor) {
      return;
    }
    const message = readEditorMessage(event.data);
    switch (message?.type) {
      case 'lhcms:highlight':
        changeOutlines(message.blockId, hoveredId);
        break;
      case 'lhcms:hover':
        changeOutlines(selectedId, message.blockId);
        break;
      case 'lhcms:scroll-to':
        scrollToBlock(blocks.get(message.blockId));
        break;
    }
  };

  document.addEventListener('click', selectBlock, true);
  document.addEventListener('auxclick', stopEvent, true);
  document.addEventListener('submit', stopEvent, true);
  document.addEventListener('mouseover', (event) => {
    changeOutlines(selectedId, blockIdOf(event.target) ?? null);
  });
  document.documentElement.addEventListener('mouseleave', () => {
    changeOutlines(selectedId, null);
  });
  window.addEventListener('message', handleMessage);
  editor.postMessage({ type: 'lhcms:ready', blockIds: [...blocks.keys()] }, location.origin);
}

function findBlocks(): ReadonlyMap<string, HTMLElement> {
  const elements = document.querySelectorAll<HTMLElement>(`[${BLOCK_ATTRIBUTE}]`);
  return new Map(
    Array.from(elements, (element) => [element.getAttribute(BLOCK_ATTRIBUTE) ?? '', element]),
  );
}

function blockIdOf(target: EventTarget | null): string | undefined {
  if (!(target instanceof Element)) {
    return undefined;
  }
  return target.closest(`[${BLOCK_ATTRIBUTE}]`)?.getAttribute(BLOCK_ATTRIBUTE) ?? undefined;
}

function setOutline(element: HTMLElement, outline: string | undefined): void {
  if (outline === undefined) {
    element.style.removeProperty('outline');
    element.style.removeProperty('outline-offset');
    return;
  }
  element.style.setProperty('outline', outline);
  element.style.setProperty('outline-offset', '-2px');
}

function scrollToBlock(element: HTMLElement | undefined): void {
  if (element === undefined) {
    return;
  }
  const { top, bottom, height } = element.getBoundingClientRect();
  if (top >= 0 && bottom <= window.innerHeight) {
    return;
  }
  element.scrollIntoView({ block: height > window.innerHeight ? 'start' : 'center' });
}

function stopEvent(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
}
