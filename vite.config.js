// Drone League build: one self-contained HTML file (all JS and CSS inlined) in dist/index.html.
// tools/postbuild.mjs then copies it to "Drone League/standalone/index.html" and writes the claude.ai artifact form.
import {defineConfig} from 'vite';
import {viteSingleFile} from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {target: 'es2020', modulePreload: {polyfill: false}, chunkSizeWarningLimit: 2000},
});
