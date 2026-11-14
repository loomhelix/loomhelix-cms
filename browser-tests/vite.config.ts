import { defineConfig } from 'vite-plus';

export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  run: {
    tasks: {
      'test:browser': {
        command: 'vp test',
        dependsOn: ['@loomhelix-cms/editor#build', '@loomhelix-cms/bridge#build'],
      },
    },
  },
});
