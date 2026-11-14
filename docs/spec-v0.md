# loomhelix-cms specification, version 0

Version 0 is a draft. It can change at each step until version 1, which is the first stable version. The package
`@loomhelix-cms/schema` implements part 1 of version 0.

The specification has three parts, one for each layer. [architecture.md](architecture.md) describes the layers.

| Part                  | Layer        | Sections | Readers                                           |
| --------------------- | ------------ | -------- | ------------------------------------------------- |
| 1. Content format     | Schema layer | 2 to 6   | Each program that reads or writes page documents. |
| 2. Renderers          | Renderers    | 7        | Authors of renderers and templates.               |
| 3. Editor integration | Editor       | 8 to 10  | Backend developers who connect the editor.        |

Part 1 does not refer to part 2 or part 3. A program can implement part 1 alone.

## 1. Terms

| Term            | Meaning                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------- |
| Content format  | The rules for schemas, page documents, and migrations in part 1.                             |
| Block type      | A kind of block that the developer defines, for example `Hero`. It has fields and a version. |
| Page type       | The type of the root block of a page, for example `Landing`.                                 |
| Type            | A block type or a page type.                                                                 |
| Block           | One instance of a type, with an id, values for the fields, and blocks in the slots.          |
| Slot            | A named list of blocks in a block, for example the columns of a `Columns` block.             |
| Root block      | The block at the top of a document. Its type is a page type or a block type.                 |
| Schema          | The JSON file that defines all types of a site.                                              |
| Page document   | The JSON content of one page: the root block and the blocks in its slots.                    |
| Block document  | A document with a block type at the root, for example a footer. It has no page and no path.  |
| Block reference | A block in a slot that shows a block document. Many pages can show the same block document.  |
| Template        | The code that renders one type, in the stack of the site.                                    |
| Renderer        | The code that renders page documents in one stack. The templates of a site are a renderer.   |
| Editor          | The web component that the client uses to edit a page.                                       |
| Storage adapter | The part of the editor that reads and saves page documents.                                  |
| Bridge          | A small script on the page in the preview. It connects the page to the editor.               |

The key words "must", "must not", and "can" have their usual meanings: a requirement, a prohibition, and a
permission.

In this specification, a letter is a character from `A` to `Z` or from `a` to `z`. A digit is a character from `0` to
`9`.

## Part 1. Content format

### 2. Schema

The developer writes one schema file for each site. The editor reads it from the address in `schema-url`.

```json
{
  "formatVersion": 0,
  "pages": {
    "Landing": {
      "label": "Landing page",
      "version": 1,
      "slots": {
        "main": { "allow": ["Hero", "Text", "Columns"] }
      }
    }
  },
  "blocks": {
    "Hero": {
      "label": "Hero banner",
      "version": 2,
      "fields": {
        "title": { "type": "text", "label": "Title", "maxLength": 80 },
        "subtitle": { "type": "text", "multiline": true, "optional": true },
        "image": { "type": "image" },
        "background": {
          "type": "choice",
          "options": ["light", "dark", { "name": "brand", "label": "Brand color" }],
          "default": "light"
        }
      },
      "migrations": [
        { "from": 1, "operations": [{ "op": "renameField", "from": "heading", "to": "title" }] }
      ]
    },
    "Text": {
      "version": 1,
      "fields": {
        "body": { "type": "richText" }
      }
    },
    "Columns": {
      "version": 1,
      "slots": {
        "items": { "label": "Columns", "allow": ["Column"] }
      }
    },
    "Column": {
      "version": 1,
      "slots": {
        "content": { "allow": ["Text"] }
      }
    }
  }
}
```

| Property        | Required | Value                                                              |
| --------------- | -------- | ------------------------------------------------------------------ |
| `formatVersion` | yes      | `0`.                                                               |
| `pages`         | yes      | An object with one or more page types. Each key is a type name.    |
| `blocks`        | yes      | An object with the block types. Each key is a type name.           |
| `removedTypes`  | no       | A list of the names of removed types. Section 4.2 gives the rules. |

The schema keeps the page types and the block types in two objects. As a result, the editor finds the types for a
new page in `pages`, and a slot can contain only types from `blocks`.

#### 2.1. Type

A page type and a block type have the same properties:

| Property     | Required | Value                                                                          |
| ------------ | -------- | ------------------------------------------------------------------------------ |
| `version`    | yes      | An integer of 1 or more. Increase it when old blocks need a migration.         |
| `fields`     | no       | An object of field definitions. Each key is a field name. The default is `{}`. |
| `slots`      | no       | An object of slot definitions. Each key is a slot name. The default is `{}`.   |
| `label`      | no       | The name of the type in the editor. The default is the key.                    |
| `migrations` | no       | A list of migrations. Section 4 gives the rules.                               |
| `oldNames`   | no       | A list of the earlier names of the type. Section 4.1 gives the rules.          |

A type name, a field name, and a slot name must start with a letter and contain only letters and digits. A type
name must be unique in the schema: the same name cannot be in `pages` and in `blocks`. The type name `LegacyHtml` is
reserved.

#### 2.2. Page type

The editor creates a page from a page type. Each page type has three built-in fields. Do not define them in
`fields`.

| Field         | Required | Value                                                                               |
| ------------- | -------- | ----------------------------------------------------------------------------------- |
| `title`       | yes      | The title of the page. A `text` value without line breaks.                          |
| `description` | no       | The description of the page for search engines. A `text` value without line breaks. |
| `path`        | yes      | The address of the page on the site. It follows the path rules in section 3.4.      |

A page type can define more fields, for example an image for link previews.

#### 2.3. Field definition

| Property    | Field types | Required | Value                                                                                    |
| ----------- | ----------- | -------- | ---------------------------------------------------------------------------------------- |
| `type`      | all         | yes      | One of `text`, `richText`, `link`, `image`, `choice`, `number`, `boolean`, and `record`. |
| `label`     | all         | no       | The name of the field in the editor. The default is the key.                             |
| `optional`  | all         | no       | `true` if the field can be empty. The default is `false`.                                |
| `default`   | all         | no       | The value of the field in a new block. It follows section 3.1.                           |
| `multiline` | `text`      | no       | `true` if the text can contain line breaks. The default is `false`.                      |
| `maxLength` | `text`      | no       | The maximum number of Unicode code points.                                               |
| `options`   | `choice`    | yes      | A list of one or more options. Each option name occurs one time.                         |
| `integer`   | `number`    | no       | `true` if the number must be an integer. The default is `false`.                         |
| `min`       | `number`    | no       | The smallest value of the field.                                                         |
| `max`       | `number`    | no       | The largest value of the field.                                                          |
| `source`    | `record`    | yes      | The name of a data source of the site, for example `products`.                           |

The default of a `boolean` field is `false`. A new block gets this value if the field has no `default`.

An option is an option name, or an object with the option name in `name` and the label of the option in `label`.
An option name starts with a letter and contains only letters, digits, and hyphens. The editor shows the label of
each option, and the default label is the name. The block stores only the name.

```json
{ "type": "choice", "options": ["light", { "name": "dark", "label": "Dark background" }] }
```

A `record` field selects a record from the data of the site, for example a product of the shop. The block stores
the id of the record, and the site reads the record with this id when it renders the page. The name of a source
starts with a letter and contains only letters, digits, and hyphens. The site gives the records of each source to
the editor (section 8).

A `choice` field also gives the design options of a block, for example the background `light`, `dark`, or `brand`.
The block stores the name of the option, and the template selects the styles for each option. The content does not
contain colors, sizes, or CSS classes. As a result, a new design changes only the templates.

#### 2.4. Slot definition

| Property | Required | Value                                                                                    |
| -------- | -------- | ---------------------------------------------------------------------------------------- |
| `allow`  | yes      | A list of one or more block type names. The slot can contain only blocks of these types. |
| `label`  | no       | The name of the slot in the editor. The default is the key.                              |
| `min`    | no       | The smallest number of blocks in the slot. An integer of 1 or more.                      |
| `max`    | no       | The largest number of blocks in the slot. An integer of 1 or more.                       |

For example, a slot with `"min": 2, "max": 4` must contain from 2 to 4 blocks. Without `min`, a slot can be empty.
The editor does not let the client add a block to a slot that has `max` blocks.

A block in a slot can have slots too. A page document can have no more than 32 levels of blocks. The root block is
at level 1, and a block in a slot is one level below its parent block. A page with 32 levels has about 100 levels of
JSON nesting. Some JSON parsers have a lower limit by default. For example, `System.Text.Json` in .NET allows 64
levels, so set its `MaxDepth` to 128 or more.

A block reference (section 3.6) is at the level of a block in its slot. Section 5.1 counts the levels of the
documents that it shows.

#### 2.5. Schema rules

A program that reads a schema must reject the schema if one of these conditions is true:

- The schema does not follow the JSON Schema file for schemas (section 6).
- The same type name is in `pages` and in `blocks`.
- A type has the name `LegacyHtml`.
- A page type defines the field `title`, `description`, or `path`.
- An `allow` list contains a name that is not a key of `blocks`.
- A `default` value does not follow section 3.1.
- A name in `oldNames` is a key of `pages` or `blocks`, or it is in the `oldNames` of two types.
- A name in `removedTypes` is a key of `pages` or `blocks`, or it is in `oldNames`.
- An option name occurs more than one time in the `options` of a field.
- A slot or a `number` field has a `max` that is smaller than its `min`.
- A type does not have one migration for each version from 1 to `version - 1`, or it has a migration from a
  different version.

### 3. Page document

```json
{
  "formatVersion": 0,
  "root": {
    "id": "p1",
    "type": "Landing",
    "version": 1,
    "props": { "title": "Fresh coffee on Linden Street", "path": "/" },
    "slots": {
      "main": [
        {
          "id": "b1",
          "type": "Text",
          "version": 1,
          "props": {
            "body": [[{ "text": "Fresh " }, { "text": "coffee", "marks": ["bold"] }]]
          }
        },
        {
          "id": "b2",
          "type": "Columns",
          "version": 1,
          "props": {},
          "slots": {
            "items": [
              {
                "id": "b3",
                "type": "Column",
                "version": 1,
                "props": {},
                "slots": {
                  "content": [
                    {
                      "id": "b4",
                      "type": "Text",
                      "version": 1,
                      "props": { "body": [[{ "text": "Open every day" }]] }
                    }
                  ]
                }
              }
            ]
          }
        }
      ]
    }
  }
}
```

- `formatVersion` is `0`.
- `root` is the root block. The id of the root block is the page id.

Each block is an object with these properties:

| Property  | Required | Value                                                                          |
| --------- | -------- | ------------------------------------------------------------------------------ |
| `id`      | yes      | The id of the block. The editor creates it, and it never changes.              |
| `type`    | yes      | The name of the type of the block.                                             |
| `version` | yes      | The version of the type that wrote the block.                                  |
| `props`   | yes      | One value for each field. An optional field without a value is not in `props`. |
| `slots`   | no       | An object. Each key is a slot name, and each value is a list of blocks.        |

An id is a non-empty string of letters, digits, hyphens, and underscores. Each id is unique in the document. A slot
that is not in `slots` has no blocks. The order of the blocks in a slot is the order on the page. A slot can also
contain block references (section 3.6).

#### 3.1. Field values

| Field type | Value                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| `text`     | A string. If `multiline` is not `true`, it contains no line breaks. It is not longer than `maxLength`.      |
| `richText` | A list of paragraphs that follows section 3.3.                                                              |
| `link`     | A string that follows the link rules in section 3.2.                                                        |
| `image`    | An object with `src`, a link with the scheme `http` or `https` or no scheme, and `alt`, a string.           |
| `choice`   | One of the strings in `options`.                                                                            |
| `number`   | A number. If `integer` is `true`, it is an integer. It is not smaller than `min` and not larger than `max`. |
| `boolean`  | `true` or `false`.                                                                                          |
| `record`   | The id of a record of the `source`: a non-empty string without control characters.                          |

A line break is the character U+000A or U+000D. A control character is a character from U+0000 to U+001F or from
U+007F to U+009F.

An `image` value can also have `width` and `height`: the size of the image in pixels, integers of 1 or more. A value
has both of them or neither of them, and no other properties. A template can put the size into the `img` element,
so that the page does not move when the image loads.

#### 3.2. Link rules

These rules prevent links that run scripts, for example `javascript:alert(1)`. A link must follow all of them:

- It is not empty.
- It contains no whitespace, no control characters, and no backslashes.
- It does not start with `//`.
- If it starts with a scheme, the scheme is `http`, `https`, `mailto`, or `tel`.

A scheme starts with a letter and contains only letters, digits, `+`, `-`, and `.`. A link starts with a scheme if
the text before its first `:` is a scheme. The comparison of schemes ignores the case of letters, so `HTTPS` is the
scheme `https`.

A link without a scheme is a relative address, for example `/menu`, `menu.html`, `#top`, or `?page=2`.

#### 3.3. Formatted text

A `richText` value is a list of one or more paragraphs. A paragraph is a list of one or more spans. A span is an
object with these properties:

| Property | Required | Value                                                             |
| -------- | -------- | ----------------------------------------------------------------- |
| `text`   | yes      | A non-empty string without line breaks.                           |
| `marks`  | no       | A list with `bold`, `italic`, or both. Each mark occurs one time. |
| `link`   | no       | A link that follows section 3.2.                                  |

A span has no other properties.

```json
[
  [{ "text": "Fresh " }, { "text": "coffee", "marks": ["bold"] }, { "text": " every day." }],
  [{ "text": "See the " }, { "text": "menu", "link": "/menu" }, { "text": "." }]
]
```

The value does not contain HTML. A renderer converts the paragraphs, the marks, and the links to the markup of its
stack.

#### 3.4. Path rules

A path is the address of a page on the site, for example `/` or `/menu/coffee`. A path must follow all of these
rules:

- It starts with `/`.
- It contains no whitespace, no control characters, no backslashes, no `?`, and no `#`.
- It does not contain `//`.
- No segment is `.` or `..`. A segment is the text after a `/` and before the next `/` or the end.
- If it is not `/`, it does not end with `/`.

#### 3.5. Block document

The root block can also have a block type. Then the document is a block document: the content of one block and the
blocks in its slots, without a page. The site puts this content into its own pages, for example a footer or a
banner on a product page.

- A block document has the same properties as a page document: `formatVersion` and `root`.
- The root block has the fields of its block type. It has no `title`, no `description`, and no `path`.
- The id of the root block is the id of the document.

The schema needs no extra property for block documents. Each block type can be in a slot and at the root of a block
document. The type names are unique in the schema, so the type of the root block tells if the document is a page.

#### 3.6. Block reference

A slot can contain a block reference instead of a block. A block reference shows a block document in the slot. Many
pages can show the same block document, for example a banner. When the client changes the block document, all these
pages show the change, and the client does not save the pages again.

```json
{ "id": "b7", "type": "Notice", "document": "opening-hours" }
```

| Property   | Required | Value                                                                   |
| ---------- | -------- | ----------------------------------------------------------------------- |
| `id`       | yes      | The id of the block reference. It follows the same rules as a block id. |
| `type`     | yes      | The block type of the root block of the shown document.                 |
| `document` | yes      | The id of the shown document. It follows the same rules as a block id.  |

- A block reference has no other properties. It has no props and no slots, because the shown document has the
  content.
- The root block of a document cannot be a block reference.
- In a slot, a block reference counts as a block of its `type`. The `allow` list of the slot and the limits `min` and
  `max` apply to it. As a result, a program can check the slot without the shown document.
- A block document can contain block references too. Section 5.1 gives the rules that prevent a loop, for example
  a document that shows itself.

### 4. Migrations

A migration converts a block from one version of its type to the next version. The type must have one migration
for each version from 1 to `version - 1`.

```json
{ "from": 1, "operations": [{ "op": "renameField", "from": "heading", "to": "title" }] }
```

The operations run in the order of the list:

| Operation     | Properties        | Effect                                                                    |
| ------------- | ----------------- | ------------------------------------------------------------------------- |
| `renameField` | `from`, `to`      | Moves the value of the field `from` to the field `to`.                    |
| `addField`    | `field`, `value`  | Sets the field to `value` if the field has no value.                      |
| `removeField` | `field`           | Removes the field and its value.                                          |
| `mapValues`   | `field`, `values` | Replaces each value that is a key of `values` with the value of that key. |
| `renameSlot`  | `from`, `to`      | Moves the blocks of the slot `from` to the slot `to`.                     |
| `removeSlot`  | `slot`            | Removes the slot and its blocks.                                          |

- If the field or the slot `from` is not in the block, `renameField` and `renameSlot` do nothing.
- If the field or the slot `to` is in the block already, `renameField` and `renameSlot` fail.
- A migration changes only its own block. Each block in a slot gets the migrations of its own type.

The operations are data, not code. For this reason, a backend in each language can apply them with a small amount
of code. A migration cannot be a function, because a backend in a different language cannot run it.

#### 4.1. Rename a type

To rename a type, change its key in the schema, and add the earlier name to `oldNames`. The type keeps its
`version` and its `migrations`.

```json
{ "Hero": { "version": 1, "oldNames": ["Banner"] } }
```

A block with the type `Banner` loads as a block of the type `Hero` with the same version. Then the migrations of
`Hero` apply to it. The `allow` lists of the slots contain the new name only.

#### 4.2. Remove a type

To remove a type, remove it from `pages` or `blocks`, and add its name to `removedTypes`. Also remove the name from
each `allow` list.

```json
{
  "formatVersion": 0,
  "removedTypes": ["Promo"],
  "pages": { "Landing": { "version": 1 } },
  "blocks": {}
}
```

The load removes each block of a removed type from its slot, with the blocks in its slots. The load does not give an
error for a removed block. A root block of a removed type is invalid, because a document cannot be without its root
block.

### 5. Load a document

A program that reads a page document must do these steps:

1. Check the document against the JSON Schema file for page documents (section 6). Check that each id occurs one
   time, and that no block is below level 32 (section 2.4). If a check fails, reject the document.
2. Load the root block.

To load a block, the program does these steps. When the block is invalid, the steps for this block stop.

1. Find the type of the block. If the `oldNames` of a type contain the type name of the block, use that type. The
   block then gets the key of that type as its type name. The root block can have a page type or a block type. A
   block in a slot can have a block type only. If the schema has no such type, the block is invalid.
2. If the block is in a slot, and the `allow` list of the slot does not contain the type, the block is invalid.
3. If the version of the block is higher than the version of the type, the block is invalid.
4. Apply the migrations from the version of the block to the version of the type. If an operation fails, the block
   is invalid.
5. Validate the props against the fields. A required field must have a value, an unknown field is an error, and
   each value must follow section 3.1. If a check fails, the block is invalid.
6. If `slots` contains a slot that the type does not define, the block is invalid.
7. Remove from each slot the blocks with a type name in `removedTypes`.
8. Count the blocks in each slot of the type. A slot that is not in `slots` has 0 blocks. If a slot has fewer
   blocks than its `min`, or more blocks than its `max`, the block is invalid.
9. Load each block in each slot.

To load a block reference (section 3.6), the program does steps 1 and 2 only. After step 1, the reference gets the
key of its type as its type name. Steps 7 and 8 of its parent block count the reference as a block of its type. The
load does not read the shown document. Section 5.1 gives the steps for the shown documents.

An invalid block stays in the document without changes, with all blocks in its slots. A program must not delete an
invalid block when it saves the document.

The load gives two results:

- The document after the load. Each valid block has the version of its type, and its props and slots after the
  migrations.
- A list of errors, one for each invalid block. An error has the id of the block in `blockId` and a code in
  `code`.

| Code                | Step | Meaning                                                  |
| ------------------- | ---- | -------------------------------------------------------- |
| `unknownType`       | 1    | The schema has no type for the block.                    |
| `notAllowed`        | 2    | The slot does not allow the type of the block.           |
| `newerVersion`      | 3    | The block comes from a newer version of its type.        |
| `migrationFailed`   | 4    | An operation of a migration failed.                      |
| `invalidProps`      | 5    | The props do not follow the fields.                      |
| `unknownSlot`       | 6    | The block contains a slot that its type does not define. |
| `invalidBlockCount` | 8    | A slot of the block has too few or too many blocks.      |

A program can add a message for the developer to each error. The message is not part of the result.

#### 5.1. Load the shown documents

A program that renders or checks a document with block references must also load the documents that the references
show. The document that the program loads first is the main document. The program reads each other document one
time, also when many references show it. For a reference to the main document, it uses the main document.

The program does these steps for each valid block reference after the load, in the main document and in each shown
document. The load does not load the slots of an invalid block, so the program skips the references in them. When
the reference is invalid, the steps for this reference stop.

1. Read the document with the id in `document`. If the document does not exist, the reference is invalid.
2. Load the document with section 5. If the program rejects the document, or its root block is invalid, the reference
   is invalid.
3. If the type of the root block is not the type of the reference, the reference is invalid.
4. If the shown document shows the document that contains the reference, the reference is invalid. A document shows
   the documents of its references that pass steps 1 to 3, and each document that these documents show. For example,
   a reference in the document `banner` to `banner` is invalid.
5. Find the depth of the shown document: the level of its lowest block, with the blocks of the documents that it
   shows. The root block of a shown document is at the level of its reference. Only valid references count. If the
   level of the reference, minus 1, plus the depth is more than 32, the reference is invalid.

For example, a reference at level 3 shows a document with a depth of 4. The root block of the shown document is
then at level 3, and its lowest block is at level 6.

These rules make sure that a renderer always stops. No document shows itself, and a page with all its shown
documents has no more than 32 levels of blocks.

The load of the shown documents gives two results:

- The documents that the main document shows through valid references. Each document has the results of its load.
- An error for each invalid reference, in the errors of the document that contains the reference.

| Code               | Step | Meaning                                                                                       |
| ------------------ | ---- | --------------------------------------------------------------------------------------------- |
| `missingDocument`  | 1    | The shown document does not exist.                                                            |
| `invalidReference` | 2, 3 | The program rejects the shown document, or its root block is invalid or has a different type. |
| `cyclicReference`  | 4    | The shown document shows the document of the reference.                                       |
| `tooManyLevels`    | 5    | With the shown documents, the blocks go below level 32.                                       |

#### 5.2. Load the records

A program that renders a document with `record` fields must also load the records of these fields. It loads them
after section 5.1, in the main document and in each shown document. The site gives a reader for each source of the
schema. A reader is a function that takes a list of ids and gives the records with these ids. A record is an object
with the id of the record in `id`.

1. Find the valid blocks. Skip the blocks in the slots of an invalid block. Collect the ids in the `record` fields of
   these blocks for each source.
2. Call the reader of each source one time, with each id one time. Do not call the reader of a source without ids.
3. Give each `record` field the record with its id.
4. If a required field has an id without a record, the block is invalid. If an optional field has an id without a
   record, the field has no value.

| Code            | Step | Meaning                                                         |
| --------------- | ---- | --------------------------------------------------------------- |
| `missingRecord` | 4    | The site has no record for the id of a required `record` field. |

### 6. Conformance

An implementation of part 1 must pass the shared test cases. The specification also gives JSON Schema files for the
schema and the page document. Tools can use these files to check the structure of a file before they load it.

| File or folder                   | Content                                      |
| -------------------------------- | -------------------------------------------- |
| `spec/schema.schema.json`        | The JSON Schema file for schemas.            |
| `spec/page-document.schema.json` | The JSON Schema file for page documents.     |
| `spec/test-cases`                | The test cases, one JSON file for each case. |

A test case is a JSON file:

```json
{
  "description": "A slot rejects a block of a type that the slot does not allow",
  "schema": {
    "formatVersion": 0,
    "pages": { "Landing": { "version": 1, "slots": { "main": { "allow": ["Text"] } } } },
    "blocks": {
      "Text": { "version": 1, "fields": { "body": { "type": "text" } } },
      "Columns": { "version": 1 }
    }
  },
  "document": {
    "formatVersion": 0,
    "root": {
      "id": "p1",
      "type": "Landing",
      "version": 1,
      "props": { "title": "Home", "path": "/" },
      "slots": { "main": [{ "id": "b1", "type": "Columns", "version": 1, "props": {} }] }
    }
  },
  "expected": {
    "errors": [{ "blockId": "b1", "code": "notAllowed" }]
  }
}
```

| Property      | Required | Value                                                                 |
| ------------- | -------- | --------------------------------------------------------------------- |
| `description` | yes      | One sentence that tells what the test case checks.                    |
| `schema`      | yes      | The schema.                                                           |
| `document`    | no       | The page document. A test case for an invalid schema has no document. |
| `documents`   | no       | The other documents in the storage, by id.                            |
| `records`     | no       | The records of the site: a list of records for each source.           |
| `expected`    | yes      | The expected result.                                                  |

The expected result is one of these objects:

| Expected result                          | Meaning                                               |
| ---------------------------------------- | ----------------------------------------------------- |
| `{ "error": "invalidSchema" }`           | The program rejects the schema (section 2.5).         |
| `{ "error": "invalidDocument" }`         | The program rejects the document (section 5, step 1). |
| `{ "errors": [...], "document": {...} }` | The results of the load (section 5).                  |
| `{ "errors": [...], "shown": {...} }`    | The results of the loads in sections 5 and 5.1.       |

With `records`, the program also loads the records (section 5.2). A reader gives the records of its source with the
ids that it gets. The expected `document` then has the records in the `record` fields.

If the load does not change the document, the expected result has no `document`.

With `documents`, the program also loads the shown documents (section 5.1), and the expected result must have
`shown`. Each key of `shown` is the id of a shown document, and its value has the errors of that document in
`errors`.

An implementation passes a test case when its result is equal to the expected result. The order of the keys in an
object and the order of the errors do not matter. The order of the items in other lists is important.

## Part 2. Renderers

### 7. Render a page document

A renderer must follow these rules:

- Load the page document with the algorithm in section 5 before it renders the page.
- If the root block is invalid, do not render the document, and report an error. In the preview, a block document
  with an invalid root block shows the fallback of the root block instead.
- Load the records with section 5.2 before you render a document with `record` fields. Give the template the record
  of each `record` field, not the id.
- Render a block document (section 3.5) with the template of its root block only. The result is a part of a page,
  and the site puts it into its own pages.
- Render each valid block with the template of its type. Give the template the rendered blocks of each slot, in the
  order of the slot. The template puts each slot in its markup.
- Escape each value for the place where it goes: the text of an element or the value of an attribute. Do not insert
  a value as HTML.
- Put an attribute value in quotes. Do not insert a value into a `script` element, a `style` element, an event
  handler attribute such as `onclick`, or the attributes `style` and `srcdoc`. Escaping does not make these places
  safe.
- Insert only a link that follows section 3.2 into an attribute that contains an address, for example `href` or
  `src`. A `text` value can contain `javascript:`, so it cannot go into these attributes.
- Check the whole value of such an attribute, after all values are in it. Two values can make an unsafe link
  together, for example `javascript` and `:alert(1)`. In `srcset`, check the address of each candidate.
- A template must close each tag, each attribute value, and each `script` and `style` element that it opens.
  Otherwise, the template that contains it can continue the attribute without a check.
- Render a `richText` value with the markup of the stack. In HTML, a paragraph is a `p` element, and a link is
  an `a` element with the link in `href`. The mark `bold` is a `strong` element, and `italic` is an `em` element.
- On the live site, skip each invalid block, with the blocks in its slots.
- In the preview, render a fallback for each invalid block. The fallback shows the error.
- In the preview, add the attribute `data-lhcms-block` with the block id to the root element of a block. Add it to
  each block in a slot, to the root block of a block document, and to each fallback.

These rules apply to block references (section 3.6):

- Load the shown documents with section 5.1 before you render a document with block references.
- Render a valid block reference with the root block of the shown document, as if this block were in the slot.
- Treat an invalid block reference as an invalid block: skip it on the live site, and render a fallback in the
  preview.
- If the root block of a shown document is invalid after section 5.2, treat the reference as invalid. The fallback
  shows the error of the root block.
- In the preview, add `data-lhcms-block` with the id of the block reference to the root element of the shown
  document.
- Render the blocks in the slots of a shown document as on the live site, also in the preview. Skip each invalid
  block, and do not add `data-lhcms-block`. The client changes these blocks in the editor of the shown document.

If a type of the schema has no template, the renderer must report an error. It must not skip the blocks of that
type without a message.

The site tells the renderer if it renders the live site or the preview.

## Part 3. Editor integration

### 8. Storage

The editor does not keep documents. The site gives it a storage: an object with these functions.

| Function                         | Result                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------- |
| `read(id)`                       | A promise of the document, or of `undefined` if the document does not exist. |
| `write(id, document, { isNew })` | A promise that resolves when the site keeps the document.                    |
| `list()`                         | Optional. A promise of a list of documents for the page list of the editor.  |
| `lookup(source, query)`          | Optional. A promise of a list of records of a source for a `record` field.   |
| `upload(file)`                   | Optional. A promise of `{ src }`, the address of an uploaded image.          |

- `isNew` is `true` when the editor creates the document. A storage can refuse to replace a document that exists.
- The editor also reads the documents that the block references of the open document show. It checks them with
  section 5.1 and shows the errors.
- To refuse a save, `write` rejects with an `Error`. The editor shows its message to the client.
- An item of the list has `id`, `type`, and for a page `title` and `path`. Without `list`, the editor opens only the
  document of the attribute `document-id`.
- The editor also shows the block documents of the list in each slot that allows their type. The client can add a
  block reference to one of them.
- A record of the `lookup` list is an object with the id of the record in `id` and its name for the client in
  `label`.
- The `query` is `{ text }` or `{ ids }`. For `text`, `lookup` gives the records that match the text, for example by
  name. An empty text gives the first records. For `ids`, `lookup` gives the records with these ids. It does not
  give an item for an id without a record.
- The site decides how many records one search gives. Without `lookup`, the editor shows an input for the id of the
  record.
- `upload` gets the image file that the client selects. The site keeps the file and gives its address in `src`. To
  refuse a file, for example a file that is too large, `upload` rejects with an `Error`. The editor shows its
  message.
- After an upload, the editor measures the image and keeps its size in the value (section 3.1). Without `upload`,
  the client gives the address of each image.
- A site that accepts uploads must find the type of a file from its content, not from its name or from the request.
  It must not accept SVG files, because an SVG file can contain a script.
- The site keeps the documents and the records in its own storage and checks the access with its own rules. The
  editor does not send or keep documents in other places.

#### 8.1. HTTP storage

This storage is optional. The function `createHttpStorage(apiUrl)` of the editor package gives a storage that calls
the endpoints of the backend, and `apiUrl` gives their base address. The handler `createCms` of
`@loomhelix-cms/node` gives these endpoints on Node.js. The endpoints keep page documents and block documents
(section 3.5), and the addresses use the word `pages` for both.

| Request                         | Response                                                                   |
| ------------------------------- | -------------------------------------------------------------------------- |
| `GET {apiUrl}/pages`            | `200` with the list of pages.                                              |
| `GET {apiUrl}/pages/{page-id}`  | `200` with the page document, or `404` if the page does not exist.         |
| `PUT {apiUrl}/pages/{page-id}`  | `204` if the backend saved the document.                                   |
| `GET {apiUrl}/records/{source}` | `200` with the records of the source, or `404` if the source is not known. |
| `POST {apiUrl}/uploads`         | `201` with `{ "src": "/uploads/..." }`, the address of the uploaded image. |

The list of pages is a JSON object:

```json
{
  "pages": [
    { "id": "home", "type": "Landing", "title": "Fresh coffee on Linden Street", "path": "/" },
    { "id": "menu", "type": "Landing", "title": "Menu", "path": "/menu" },
    { "id": "footer", "type": "Footer" }
  ]
}
```

- `id` is the id of the document, and `type` is the type of its root block.
- For a page, `title` and `path` are the props of the root block. A block document has no title and no path.
- The page list of the editor shows the documents with a page type, in the order of the list.

These rules apply to the `PUT` request:

- If the page does not exist, the request creates it.
- The body of the request is the page document, with the type `application/json`.
- The page id in the address must be the id of the root block. If the two ids are different, the backend sends
  `400`.
- The backend must check the document with step 1 of section 5 before it saves it. A request can come from a source
  other than the editor. If the check fails, the backend sends `400`.
- The backend can save a document with invalid blocks, because a renderer does not show them on the live site.
- If the document is a page, and a different page has the same `path`, the backend sends `409`. The editor tells
  the client.
- The backend can send an `ETag` header with the page. Then the editor sends the `If-Match` header with the `PUT`
  request. If the page changed since the editor read it, the backend sends `412`, and the editor tells the client.
- When the editor creates a page, it sends the header `If-None-Match: *`. If the page exists, the backend sends
  `412`.
- The editor sends the cookies of the site with each request. The backend checks the access with its own rules.
- If the `Origin` header of a `PUT` request is not the origin of the site, the backend must send `403`. A page of a
  different site can send a request with the cookies of the site, and this check stops it.

The `records` request is the `lookup` function of section 8:

- With one or more `id` parameters, for example `?id=espresso-beans&id=decaf`, the backend gives the records with
  these ids.
- Without an `id` parameter, the backend gives the records that match the `text` parameter. Without `text`, it gives
  the first records.
- The response is a JSON object: `{ "records": [{ "id": "espresso-beans", "label": "Espresso beans 1 kg" }] }`.

The `uploads` request is the `upload` function of section 8:

- The body of the request is the file, with the type of the file in the `Content-Type` header.
- The backend finds the type from the first bytes of the file. If it does not accept the type, it sends `415`. If
  the file is too large, it sends `413`. If the backend does not accept uploads, it sends `404`.
- If the `Origin` header is not the origin of the site, the backend must send `403`, as for a `PUT` request.

### 9. Preview

The attribute `preview-url` gives the address of a page on the site that renders a page document from a request.

1. After each change, the editor sends a form `POST` request to `preview-url` into the preview frame. The form has
   one field, `document`, which contains the page document as a JSON string.
2. The backend renders the page with this document and the same templates as the live site. It reads the shown
   documents (section 5.1) from its storage.
3. The renderer follows the preview rules in section 7.
4. The page loads the bridge script.

For a block document, the backend puts the rendered block into a page with the styles of the site. As a result, the
client sees the block as it looks on the site.

The preview endpoint must check the same access as the save endpoint, and it must not save the document. A form
request works with each backend, and the page keeps its real address, styles, and scripts. The form encoding makes
the request body about 1.6 times larger than the JSON of the page. If the save endpoint limits the body size, give
the preview endpoint a limit that is two times larger.

If the `Origin` header of a preview request is not the origin of the site, the backend must send `403`. A page of a
different site can send a form to the preview endpoint without a check by the browser. Without this rule, it can show
its own content at the address of the site. The backend must also tell the browser not to keep the preview page in a
cache.

### 10. Bridge messages

The bridge and the editor send messages with `window.postMessage`. Each side must check `event.origin` against the
configured origin and ignore other messages.

| From   | To     | Type              | Data                      | Meaning                                                             |
| ------ | ------ | ----------------- | ------------------------- | ------------------------------------------------------------------- |
| bridge | editor | `lhcms:ready`     | `blockIds`: a list of ids | The page loaded.                                                    |
| bridge | editor | `lhcms:select`    | `blockId`                 | The client clicked a block on the page.                             |
| editor | bridge | `lhcms:highlight` | `blockId`, or `null`      | Mark the selected block, or remove the mark.                        |
| editor | bridge | `lhcms:hover`     | `blockId`, or `null`      | Mark the block under the pointer in the editor, or remove the mark. |
| editor | bridge | `lhcms:scroll-to` | `blockId`                 | Scroll the page to a block.                                         |

The bridge expects the editor in the parent window, at the origin of the page. In the preview, the links, the
buttons, and the forms of the page do not work. A click on a block sends `lhcms:select`, so that the client can
edit the block.

## 11. Open questions

1. Does each language have its own document, or does each text field contain all languages?
2. Can the preview update one block without a reload of the page?
3. Is `lhcms` the correct prefix for the attributes, the messages, and the editor element?
4. Which name does the content format get when it becomes a separate specification?
5. Which rules apply to the `LegacyHtml` block type, and which renderers can insert its HTML?
