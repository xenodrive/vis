import { computed, nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import type { useFloatingWindows } from './useFloatingWindows';
import { StorageKeys, storageGet, storageSet } from '../utils/storageKeys';

export function useWorkspaceLayout(
  elements: {
    header: Ref<HTMLElement | undefined>;
    body: Ref<HTMLElement | undefined>;
    side: Ref<HTMLElement | undefined>;
    output: Ref<HTMLElement | undefined>;
    input: Ref<HTMLElement | undefined>;
    canvas: Ref<HTMLElement | undefined>;
  },
  fw: ReturnType<typeof useFloatingWindows>,
) {
  const inputHeight = ref<number | null>(null);
  const sidePanelWidth = ref<number | null>(null);
  const mobileQuery = window.matchMedia('(max-width: 768px)');
  const isMobile = ref(mobileQuery.matches);
  const mobileSideOpen = ref(false);
  const desktopSideCollapsed = ref(storageGet(StorageKeys.state.sidePanelCollapsed) === 'true');
  const sidePanelCollapsed = computed({
    get: () => (isMobile.value ? !mobileSideOpen.value : desktopSideCollapsed.value),
    set: (value: boolean) => {
      if (isMobile.value) mobileSideOpen.value = !value;
      else desktopSideCollapsed.value = value;
    },
  });
  const viewport = window.visualViewport!;
  function syncViewport() {
    const root = document.documentElement;
    root.style.setProperty('--viewport-height', `${viewport.height}px`);
    root.style.setProperty('--viewport-top', `${viewport.offsetTop}px`);
    root.style.setProperty('--viewport-left', `${viewport.offsetLeft}px`);
    root.style.setProperty('--viewport-width', `${viewport.width}px`);
    void nextTick(syncExtent);
  }
  function changeLayout() {
    isMobile.value = mobileQuery.matches;
    mobileSideOpen.value = false;
    void nextTick(syncExtent);
  }
  syncViewport();
  mobileQuery.addEventListener('change', changeLayout);
  viewport.addEventListener('resize', syncViewport);
  viewport.addEventListener('scroll', syncViewport);
  let resizing:
    | { axis: 'input' | 'side'; start: number; size: number; min: number; max: number }
    | undefined;
  const observer = new ResizeObserver(syncExtent);

  function syncExtent() {
    const canvas = elements.canvas.value;
    const header = elements.header.value;
    const input = elements.input.value;
    if (!canvas || !header || !input) return;
    const top = isMobile.value
      ? viewport.offsetTop
      : Math.max(0, header.getBoundingClientRect().bottom);
    const height = isMobile.value
      ? viewport.height
      : Math.max(0, input.getBoundingClientRect().top - top);
    canvas.style.setProperty('--canvas-top', `${top}px`);
    canvas.style.setProperty('--canvas-height', `${height}px`);
    fw.setExtent(canvas.getBoundingClientRect().width, height);
  }

  watch([elements.header, elements.input, elements.body], (values) => {
    observer.disconnect();
    for (const el of values) if (el) observer.observe(el);
    void nextTick(syncExtent);
  });
  watch(desktopSideCollapsed, (value) =>
    storageSet(StorageKeys.state.sidePanelCollapsed, String(value)),
  );

  function startInputResize(event: PointerEvent) {
    if (event.button !== 0 || !elements.input.value || !elements.output.value) return;
    const size = elements.input.value.getBoundingClientRect().height;
    const total = size + elements.output.value.getBoundingClientRect().height;
    const max = Math.max(120, total - 180);
    resizing = { axis: 'input', start: event.clientY, size, min: Math.min(200, max), max };
    inputHeight.value = size;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function startSidePanelResize(event: PointerEvent) {
    if (event.button !== 0 || !elements.side.value || !elements.body.value) return;
    const size = elements.side.value.getBoundingClientRect().width;
    resizing = {
      axis: 'side',
      start: event.clientX,
      size,
      min: 160,
      max: Math.max(160, elements.body.value.getBoundingClientRect().width * 0.5 - 10),
    };
    sidePanelWidth.value = size;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function move(event: PointerEvent) {
    if (!resizing) return;
    const delta =
      resizing.axis === 'input' ? resizing.start - event.clientY : event.clientX - resizing.start;
    const size = Math.max(resizing.min, Math.min(resizing.max, resizing.size + delta));
    if (resizing.axis === 'input') inputHeight.value = size;
    else sidePanelWidth.value = size;
    void nextTick(syncExtent);
  }
  function end() {
    resizing = undefined;
  }
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('resize', syncExtent);
  onBeforeUnmount(() => {
    mobileQuery.removeEventListener('change', changeLayout);
    viewport.removeEventListener('resize', syncViewport);
    viewport.removeEventListener('scroll', syncViewport);
    observer.disconnect();
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('resize', syncExtent);
  });
  return {
    isMobile,
    inputHeight,
    sidePanelWidth,
    sidePanelCollapsed,
    startInputResize,
    startSidePanelResize,
    syncExtent,
  };
}
