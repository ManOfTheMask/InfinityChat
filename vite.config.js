import { defineConfig } from 'vite';
import { resolve } from 'path';
export default defineConfig({
  root: 'src/public',
  build: {
    outDir: resolve(__dirname, 'dist/public'),
    emptyOutDir: false,
    rollupOptions: {
      input: {
        home: resolve(__dirname, 'src/public/ts/home.ts'),
        friends: resolve(__dirname, 'src/public/ts/friends.ts'),
        profile: resolve(__dirname, 'src/public/ts/profile.ts'),
        test: resolve(__dirname, 'src/public/ts/test.ts'),
        PGPUtils: resolve(__dirname, 'src/public/jslibs/PGPUtils.js'),
      },
      output: {
        entryFileNames: 'js/[name].js',
        chunkFileNames: 'js/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  },
  publicDir: false // static assets handled by express or manually
});
