import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        'stream/web': path.resolve(__dirname, 'src/shims/stream-web.ts'),
        'fs/promises': path.resolve(__dirname, 'src/shims/node-shims.ts'),
        'path': path.resolve(__dirname, 'src/shims/node-shims.ts'),
        'url': path.resolve(__dirname, 'src/shims/node-shims.ts'),
        'dns': path.resolve(__dirname, 'src/shims/node-shims.ts'),
        'os': path.resolve(__dirname, 'src/shims/node-shims.ts'),
      },
    },
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom')) {
                return 'vendor-react';
              }
              if (id.includes('@noble')) {
                return 'vendor-crypto';
              }
              if (id.includes('motion')) {
                return 'vendor-motion';
              }
              if (id.includes('lucide-react')) {
                return 'vendor-icons';
              }
              if (id.includes('@supabase')) {
                return 'vendor-supabase';
              }
              if (id.includes('@simplewebauthn')) {
                return 'vendor-webauthn';
              }
              return 'vendor-misc';
            }
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
      hmr: false,
      watch: null,
    },
  };
});
