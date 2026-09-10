import { execSync } from 'node:child_process';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const gitRevision = execSync('git rev-parse --short HEAD').toString().trim();

export default defineConfig({
  base: '/vis/',
  root: 'app',
  plugins: [vue()],
  worker: {
    format: 'es',
  },
  define: {
    __GIT_REVISION__: JSON.stringify(gitRevision),
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
