import RenderWorker from '../workers/render-worker?worker';

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
  | { id: string; ok: true; html: string }
  | { id: string; ok: false; error: string };

type PendingEntry = {
  resolve: (value: string) => void;
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
    if (data.ok) entry.resolve(data.html);
    else entry.reject(new Error(data.error || 'Render failed'));
  };
  worker.onerror = (error) => {
    pending.forEach((entry) => entry.reject(new Error(String(error))));
    pending.clear();
  };
  return worker;
}

export function renderWorkerHtml(payload: RenderRequest) {
  const id = `${payload.id}:${++requestSequence}`;
  return new Promise<string>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ ...payload, id });
  });
}
