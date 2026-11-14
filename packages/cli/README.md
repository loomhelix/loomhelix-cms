# @loomhelix-cms/cli

The `lhcms` command of [loomhelix-cms](https://github.com/loomhelix/loomhelix-cms).

Status: draft. The commands can change before version 1.0.

```sh
npm install --save-dev @loomhelix-cms/cli
```

| Command                         | Action                                                            |
| ------------------------------- | ----------------------------------------------------------------- |
| `lhcms build [schema-module]`   | Write the schema as a `.json` file next to its TypeScript module. |
| `lhcms types [schema-file]`     | Write the types of the templates to a `.types.ts` file.           |
| `lhcms template <type> [file]`  | Print a first template for a page type or a block type.           |
| `lhcms check <folder> [file]`   | Print the errors of the JSON documents in a folder.               |
| `lhcms migrate <folder> [file]` | Apply the migrations to the JSON documents in a folder.           |
| `lhcms diff <old-file> [file]`  | Print the schema changes that make stored blocks invalid.         |

The default schema file is `blocks.ts`, or else `blocks.json`. The commands need Node.js 22.18 or later, because
Node.js runs `blocks.ts` without a build from this version.
