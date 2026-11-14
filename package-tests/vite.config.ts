import { defineConfig } from 'vite-plus';

export default defineConfig({
  test: {
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
  run: {
    tasks: {
      'test:packages': {
        command: 'vp test',
        dependsOn: [
          '@loomhelix-cms/schema#build',
          '@loomhelix-cms/render-html#build',
          '@loomhelix-cms/editor#build',
          '@loomhelix-cms/bridge#build',
          '@loomhelix-cms/cli#build',
          '@loomhelix-cms/node#build',
        ],
      },
    },
  },
});
