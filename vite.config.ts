import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  base:
    process.env.VITE_BASE_PATH ||
    (mode === 'pages' ? '/modern-survival-guide/' : './'),
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact',
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
}));
