import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [{ find: /^react-native$/, replacement: 'react-native-web' }],
    extensions: ['.web.jsx', '.web.js', '.jsx', '.js', '.json']
  },
  optimizeDeps: { include: ['buffer'] },
  define: { __DEV__: false, global: 'globalThis' },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1800 }
});
