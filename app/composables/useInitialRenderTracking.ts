import { onScopeDispose, ref, watch } from 'vue';
import type { Ref } from 'vue';
import type { MessageInfo } from '../types/message';

const SAFETY_TIMEOUT_MS = 5_000;

type UseInitialRenderTrackingOptions = {
  visibleRoots: Ref<MessageInfo[]>;
  hasAssistantMessages: (root: MessageInfo) => boolean;
  getThreadUserRenderKey: (root: MessageInfo) => string;
  getThreadAssistantRenderKey: (root: MessageInfo) => string;
  onInitialRenderComplete: () => void;
  onMessageRendered: () => void;
};

export function useInitialRenderTracking(options: UseInitialRenderTrackingOptions) {
  const pendingInitialRenderKeys = ref(new Set<string>());
  const initialRenderTrackingActive = ref(false);
  const renderedKeys = ref(new Set<string>());
  let safetyTimeoutId: ReturnType<typeof setTimeout> | undefined;

  function collectInitialRenderKeys(): Set<string> {
    const keys = new Set<string>();
    options.visibleRoots.value.forEach((root) => {
      if (root.role === 'user') keys.add(options.getThreadUserRenderKey(root));
      if (options.hasAssistantMessages(root)) keys.add(options.getThreadAssistantRenderKey(root));
    });
    return keys;
  }

  function clearSafetyTimeout() {
    if (safetyTimeoutId !== undefined) {
      clearTimeout(safetyTimeoutId);
      safetyTimeoutId = undefined;
    }
  }

  function completeTracking() {
    clearSafetyTimeout();
    pendingInitialRenderKeys.value = new Set<string>();
    initialRenderTrackingActive.value = false;
    options.onInitialRenderComplete();
  }

  function tryResolve(): boolean {
    const expected = collectInitialRenderKeys();
    for (const k of renderedKeys.value) expected.delete(k);
    pendingInitialRenderKeys.value = expected;
    if (expected.size === 0) {
      completeTracking();
      return true;
    }
    return false;
  }

  function beginInitialRenderTracking() {
    if (tryResolve()) return;
    initialRenderTrackingActive.value = true;
    clearSafetyTimeout();
    safetyTimeoutId = setTimeout(() => {
      safetyTimeoutId = undefined;
      if (initialRenderTrackingActive.value) completeTracking();
    }, SAFETY_TIMEOUT_MS);
  }

  function handleMessageRendered(renderKey: string) {
    renderedKeys.value.add(renderKey);
    options.onMessageRendered();
    if (!initialRenderTrackingActive.value) return;
    tryResolve();
  }

  watch(
    () => options.visibleRoots.value.length,
    (length, previous) => {
      if (length === 0) {
        clearSafetyTimeout();
        pendingInitialRenderKeys.value = new Set<string>();
        initialRenderTrackingActive.value = false;
        renderedKeys.value = new Set<string>();
        return;
      }
      if (previous === 0) beginInitialRenderTracking();
    },
  );

  onScopeDispose(clearSafetyTimeout);

  return {
    initialRenderTrackingActive,
    beginInitialRenderTracking,
    handleMessageRendered,
  };
}
