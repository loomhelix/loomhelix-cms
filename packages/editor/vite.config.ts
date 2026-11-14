import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: { editor: 'src/index.ts' },
    platform: 'browser',
    deps: {
      alwaysBundle: [/.*/],
      onlyBundle: [
        'lit',
        'lit-html',
        'lit-element',
        '@lit/reactive-element',
        'prosemirror-commands',
        'prosemirror-history',
        'prosemirror-keymap',
        'prosemirror-model',
        'prosemirror-state',
        'prosemirror-transform',
        'prosemirror-view',
        'orderedmap',
        'rope-sequence',
        'w3c-keyname',
      ],
    },
    minify: true,
    dts: { generator: 'oxc' },
  },
});
