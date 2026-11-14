import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: ['src/index.ts'],
    platform: 'node',
    dts: { generator: 'tsgo' },
  },
  run: {
    tasks: {
      test: {
        command: 'vp test',
        dependsOn: ['@loomhelix-cms/editor#build', '@loomhelix-cms/bridge#build'],
      },
    },
  },
});
