import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: { bridge: 'src/index.ts' },
    platform: 'browser',
    minify: true,
    dts: false,
  },
});
