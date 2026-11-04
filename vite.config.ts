import { defineConfig } from 'vite';

// Relative base so the build works under a subpath (GitHub Pages: /CuantoEs/)
// as well as at a domain root.
export default defineConfig({
  base: './',
});
