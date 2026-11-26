import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/**
 * Strict Content-Security-Policy, injected into production builds only
 * (the Vite dev server relies on inline scripts for HMR).
 * - No inline/remote scripts, no eval.
 * - Network access limited to HTTPS/WSS (RPC endpoints are user-configurable).
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "worker-src 'self' blob:",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'nocta-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<!--CSP-->',
        `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cspPlugin()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  define: { 'process.env': {}, __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // The Buffer polyfill lives in the same chunk as the Solana libraries so it is
        // guaranteed to evaluate before them (they reference Buffer at module load).
        manualChunks(id: string) {
          if (id.endsWith('/src/polyfills.ts') || /node_modules\/(@solana|buffer|bn\.js|bs58|borsh|@noble|@scure|micro-key-producer)\//.test(id)) return 'solana';
          if (/node_modules\/(recharts|d3-|victory)/.test(id)) return 'charts';
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return 'react';
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
} as never);
