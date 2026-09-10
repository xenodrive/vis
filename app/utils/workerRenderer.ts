import RenderWorker from '../workers/render-worker?worker';
import type { RenderResult } from './renderResult';

type RenderRequest = {
  id: string;
  code: string;
  patch?: string;
  after?: string;
  lang: string;
  theme: string;
  gutterMode?: 'none' | 'single' | 'double';
  gutterLines?: string[];
  grepPattern?: string;
  lineOffset?: number;
  lineLimit?: number;
  files?: string[];
};

type RenderResponse =
  | ({ id: string; ok: true } & RenderResult)
  | { id: string; ok: false; error: string };

type PendingEntry = {
  resolve: (value: RenderResult) => void;
  reject: (reason: Error) => void;
};

let renderWorker: Worker | null = null;
const pending = new Map<string, PendingEntry>();
let requestSequence = 0;

function getWorker() {
  if (renderWorker) return renderWorker;
  const worker = new RenderWorker();
  renderWorker = worker;
  worker.onmessage = (event: MessageEvent<RenderResponse>) => {
    const data = event.data;
    const entry = pending.get(data.id);
    if (!entry) return;
    pending.delete(data.id);
    if (data.ok) entry.resolve({ html: data.html, hunks: data.hunks, preamble: data.preamble });
    else entry.reject(new Error(data.error || 'Render failed'));
  };
  worker.onerror = (error) => {
    pending.forEach((entry) => entry.reject(new Error(String(error))));
    pending.clear();
  };
  return worker;
}

export function renderWorkerResult(payload: RenderRequest) {
  const id = `${payload.id}:${++requestSequence}`;
  return new Promise<RenderResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ ...payload, id });
  });
}

export async function renderWorkerHtml(payload: RenderRequest) {
  const result = await renderWorkerResult(payload);
  return result.html;
}
