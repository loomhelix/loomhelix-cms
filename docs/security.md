# Security

The content of a page comes from a client, and it goes into a real site. This document tells which attacks the core
of loomhelix-cms stops, and which checks your site must do itself. The core does not keep documents and does not
check access, so the security of a site always needs both parts.

## What the core stops

### The HTML renderer

The `html` tag of `@loomhelix-cms/render-html` treats each value of a template as untrusted text.

- It escapes the characters `&`, `<`, `>`, `"`, and `'` in the text of an element and in a quoted attribute value.
- It puts a string or a number only. It rejects an object, so a JSON value cannot pass as markup.
- It rejects a value outside the quotes of an attribute, and a value in a tag name or an attribute name.
- It rejects a value in a `script` element and in a `style` element.
- It rejects a value in an event handler attribute such as `onclick`, and in the attributes `style` and `srcdoc`.
- It checks the whole value of an address attribute against the link rules of section 3.2 of
  [the spec](spec-v0.md). The address attributes are `action`, `background`, `cite`, `data`, `formaction`, `href`,
  `poster`, `src`, `srcset`, and `xlink:href`. A link can have the scheme `http`, `https`, `mailto`, or `tel`, or no
  scheme. In `srcset`, each candidate is checked.
- It rejects a template that does not close a tag, an attribute value, or a `script` or `style` element.

The renderer does not show an invalid block on the live site. In the preview, it shows a fallback with the escaped
error message.

### The schema layer

`loadDocument` of `@loomhelix-cms/schema` checks each document before a renderer or the editor uses it.

- A document can have no more than 32 levels of blocks, and each id occurs one time.
- An unknown property of a document or a block rejects the whole document. An unknown field or slot makes only
  its block invalid.
- A `link` field and the links in `richText` must follow the link rules. The `src` of an image must have the scheme
  `http` or `https`, or no scheme.
- `loadDocumentSet` stops a loop of block references, for example a document that shows itself. A document with all
  its shown documents can have no more than 32 levels of blocks. As a result, a render always stops.

### The editor and the bridge

- The editor does not put content into the page as HTML. It shows each value as text.
- The rich text field keeps only links that follow the link rules, and it pastes plain text only.
- The editor shows the thumbnail of an image only when its address is valid.
- The editor and the bridge accept a `postMessage` only from the expected window and origin, and they send
  messages only to their own origin.
- In the preview, the links, the buttons, and the forms of the page do not work.
- The editor sends documents only to the storage that the site gives and to `preview-url`.

## What your site must do

1. **Check the access.** Decide who can edit, with the login of your site. Check it on the server for each `read`,
   `write`, and `list` of your storage, and for the preview.
2. **Check each document on the server.** A request can come from a source other than the editor. Before you keep a
   document, load it with `loadDocument`, and reject it if the load throws a `DocumentError`.
3. **Limit the body size.** For example, accept 1 MB for a save and 2 MB for the preview. The form encoding of the
   preview makes the body about 1.6 times larger.
4. **Stop cross-site requests.** If the `Origin` header of a save or a preview request is not the origin of your
   site, send `403`.
5. **Protect the preview.** Tell the browser not to keep it in a cache (`Cache-Control: no-store`). Let only your own
   origin show it in a frame (`X-Frame-Options: SAMEORIGIN`, or `frame-ancestors 'self'` in the CSP).
6. **Set a Content-Security-Policy** for the pages of your site. The core cannot know which scripts and styles your
   pages need.
7. **Write templates with `html` only.** Do not build HTML as a string by hand. Do not put a client value into the
   SVG attributes `values`, `from`, and `to` of `animate`, or into the `content` of `<meta http-equiv="refresh">`.
   The `html` tag does not know these attributes as addresses.
8. **Keep the schema module trusted.** `blocks.ts` is code. `createCms` and `lhcms` import it, so use only your own
   file.
9. **Check each uploaded file.** If your storage has `upload`, find the type of a file from its first bytes. Do not
   use its name or the type in the request. Accept only raster images such as PNG and JPEG. Refuse SVG and HTML files,
   because a browser runs their scripts when the file opens from your origin. Give each file a new random name, and
   limit the size.

## The optional adapter `createCms`

`createCms` of `@loomhelix-cms/node` does steps 2 to 5 for a Node.js site.

- `canEdit` is required. The handler calls it before each address under `/cms`.
- The save and the preview check the `Origin` header. The save accepts 1 MB, and the preview accepts 2 MB.
- A page id can contain only letters, digits, hyphens, and underscores, so an id cannot leave the folder of the
  folder storage.
- The editor pages and the content API get a strict Content-Security-Policy. The preview gets `no-store` and
  `X-Frame-Options: SAMEORIGIN`.
- The live pages get only `X-Content-Type-Options: nosniff`. Set your own CSP before `cms.handle`, and it stays.
- The option `uploads` accepts only PNG, JPEG, WebP, GIF, and AVIF files up to 10 MB. It finds the type from the
  first bytes of the file and refuses all other files, also SVG. The upload request needs `canEdit` and the
  `Origin` check. `createFolderUploads` gives each file a random name of 32 hexadecimal digits. It serves only names
  of this form, with the type of the file, `X-Content-Type-Options: nosniff`, and
  `Content-Security-Policy: default-src 'none'`. It sends a file as a stream, so a large file does not stay in
  memory, and it answers a known `If-None-Match` with `304`.
- A request for a live page reads one document. The map from the paths to the documents stays in memory for 5
  seconds, and the path check of a save uses it. As a result, random addresses do not make the server read the whole store.

## Report a vulnerability

Do not report a vulnerability in a public issue. Use the private vulnerability reporting of the GitHub repository.
