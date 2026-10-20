// Drone League build: one self-contained HTML file (all JS and CSS inlined) in dist/index.html.
// The entry is app.html (the root index.html is the launcher for engine/ + games/); tools/postbuild.mjs renames dist/app.html
// to dist/index.html, copies it to games/drone-league/index.html and writes the claude.ai artifact form.
import {defineConfig} from 'vite';
import {viteSingleFile} from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  server: {open: '/app.html'},
  build: {target: 'es2020', modulePreload: {polyfill: false}, chunkSizeWarningLimit: 2000, rollupOptions: {input: 'app.html'}},
});
