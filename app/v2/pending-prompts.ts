export type PendingPrompt = {
  id: string;
  sessionID: string;
  agent?: string;
  text: string;
  files: string[];
  status: 'sending' | 'accepted' | 'failed';
  error?: string;
};
