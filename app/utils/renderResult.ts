export type RenderedHunk = {
  index: number;
  header: string;
  html: string;
};

export type RenderResult = {
  html: string;
  hunks?: RenderedHunk[];
  preamble?: string;
};
