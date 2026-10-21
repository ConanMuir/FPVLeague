// Drone League build: one self-contained HTML file (all JS and CSS inlined) in dist/index.html.
// The entry is app.html (the root index.html is the launcher for engine/ + games/); tools/postbuild.mjs renames dist/app.html
// to dist/index.html, copies it to games/drone-league/index.html and writes the claude.ai artifact form.
import {defineConfig} from 'vite';
import {viteSingleFile} from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  /* no browser tab on dev-server start (tools and agents start it headless); DL_OPEN=1 npm run dev opens app.html */
  server: {open: process.env.DL_OPEN === '1' ? '/app.html' : false},
  build: {target: 'es2020', modulePreload: {polyfill: false}, chunkSizeWarningLimit: 2000, rollupOptions: {input: 'app.html'}},
});
