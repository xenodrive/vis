import { type Ref, type WatchSource, onBeforeUnmount, ref, toRaw, watch } from 'vue';
import { renderWorkerResult } from './workerRenderer';
import type { RenderedHunk } from './renderResult';

export type CodeRenderParams = {
  code: string;
  lang: string;
  theme: string;
  patch?: string;
  after?: string;
  gutterMode?: 'none' | 'single' | 'double';
  gutterLines?: string[];
  grepPattern?: string;
  lineOffset?: number;
  lineLimit?: number;
};

export type CodeRenderResult = {
  html: Ref<string>;
  hunks: Ref<RenderedHunk[]>;
  preamble: Ref<string>;
  error: Ref<string>;
};

export function useCodeRender(params: WatchSource<CodeRenderParams | null>): CodeRenderResult {
  const html = ref('');
  const hunks = ref<RenderedHunk[]>([]);
  const preamble = ref('');
  const error = ref('');
  let requestId = 0;

  watch(
    params,
    (p) => {
      requestId += 1;
      const current = requestId;

      if (!p) {
        html.value = '';
        hunks.value = [];
        preamble.value = '';
        error.value = '';
        return;
      }

      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      renderWorkerResult({
        id,
        code: p.code,
        lang: p.lang,
        theme: p.theme,
        patch: p.patch,
        after: p.after,
        gutterMode: p.gutterMode ?? 'none',
        gutterLines: p.gutterLines ? toRaw(p.gutterLines) : undefined,
        grepPattern: p.grepPattern,
        lineOffset: p.lineOffset,
        lineLimit: p.lineLimit,
      })
        .then((result) => {
          if (current !== requestId) return;
          html.value = result.html;
          hunks.value = result.hunks ?? [];
          preamble.value = result.preamble ?? '';
          error.value = '';
        })
        .catch((err) => {
          if (current !== requestId) return;
          error.value = err instanceof Error ? err.message : 'Render failed';
        });
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    requestId += 1;
  });

  return { html, hunks, preamble, error };
}
