import {
  block,
  choice,
  defineSchema,
  image,
  link,
  page,
  slot,
  text,
  richText,
} from '@loomhelix-cms/schema';

export default defineSchema({
  pages: {
    Landing: page({
      label: 'Landing page',
      slots: {
        main: slot(['Hero', 'Text', 'Notice', 'Columns'], { label: 'Sections' }),
      },
    }),
  },
  blocks: {
    Hero: block({
      label: 'Hero banner',
      fields: {
        title: text({ label: 'Title', maxLength: 80 }),
        subtitle: text({ label: 'Subtitle', multiline: true, optional: true }),
        image: image({ label: 'Image', optional: true }),
        background: choice(
          [
            { name: 'light', label: 'Light' },
            { name: 'dark', label: 'Dark' },
            { name: 'brand', label: 'Brand color' },
          ],
          { label: 'Background', default: 'light' },
        ),
      },
    }),
    Text: block({
      label: 'Text',
      fields: { body: richText({ label: 'Text' }) },
    }),
    Columns: block({
      label: 'Columns',
      slots: { items: slot(['Column'], { label: 'Columns', min: 2, max: 3 }) },
    }),
    Column: block({
      label: 'Column',
      slots: { content: slot(['Text', 'Button'], { label: 'Content' }) },
    }),
    Notice: block({
      label: 'Notice',
      fields: {
        text: text({ label: 'Text', maxLength: 120 }),
        tone: choice(['calm', 'urgent'], { label: 'Tone', default: 'calm' }),
      },
    }),
    Button: block({
      label: 'Button',
      fields: {
        label: text({ label: 'Label', maxLength: 40 }),
        link: link({ label: 'Link' }),
        style: choice(['primary', 'secondary'], { label: 'Style', default: 'primary' }),
      },
    }),
  },
});
