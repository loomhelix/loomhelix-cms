import { css } from 'lit';

export const editorStyles = css`
  :host {
    display: block;
    height: 100%;
    font:
      14px/1.4 system-ui,
      sans-serif;
    color: #1f1f1f;
  }
  [hidden] {
    display: none;
  }
  .layout {
    display: grid;
    grid-template-columns: 360px 1fr;
    height: 100%;
  }
  .phone-bar {
    display: none;
  }
  .view-switch {
    display: flex;
  }
  .view-switch button {
    border: 1px solid #767676;
    background: #ffffff;
  }
  .view-switch button:first-child {
    border-radius: 6px 0 0 6px;
  }
  .view-switch button:last-child {
    border-left: 0;
    border-radius: 0 6px 6px 0;
  }
  .view-switch button[aria-pressed='true'] {
    background: #1f1f1f;
    color: #ffffff;
  }
  .panel {
    display: grid;
    align-content: start;
    gap: 16px;
    padding: 16px;
    overflow: auto;
    border-right: 1px solid #d9d9d9;
    background: #fafafa;
  }
  label {
    display: grid;
    gap: 4px;
    font-weight: 600;
  }
  select,
  input,
  button {
    font: inherit;
    padding: 6px 8px;
  }
  button.primary {
    border: 1px solid #1d4ed8;
    border-radius: 6px;
    background: #2563eb;
    color: #ffffff;
  }
  button.primary:disabled {
    border-color: #a3a3a3;
    background: #d4d4d4;
    color: #525252;
  }
  button.link {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    text-decoration: underline;
  }
  form {
    display: grid;
    gap: 12px;
    padding: 12px;
    border: 1px solid #d9d9d9;
    border-radius: 8px;
    background: #ffffff;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .hint {
    margin: 0;
    font-weight: 400;
    color: #6b6b6b;
  }
  .error {
    margin: 0;
    color: #b42318;
  }
  .status {
    margin: 0;
    color: #276749;
  }
  .tree h2 {
    margin: 0 0 8px;
    font-size: 14px;
  }
  .slot {
    display: grid;
    gap: 4px;
  }
  li > .slot {
    margin: 4px 0 0 12px;
    padding-left: 8px;
    border-left: 2px solid #e5e5e5;
  }
  .slot-name {
    margin: 0;
    font-size: 12px;
    color: #6b6b6b;
  }
  ol {
    display: grid;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .block {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border: 1px solid #d9d9d9;
    border-radius: 6px;
    background: #ffffff;
  }
  .block.selected {
    border-color: #2563eb;
    box-shadow: 0 0 0 1px #2563eb;
  }
  .block-name {
    display: grid;
    flex: 1;
    min-width: 0;
    border: 0;
    background: none;
    text-align: left;
    font-weight: 600;
  }
  .summary {
    overflow: hidden;
    font-size: 12px;
    font-weight: 400;
    color: #6b6b6b;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .block > button:not(.block-name) {
    min-width: 32px;
    min-height: 32px;
    border: 0;
    border-radius: 4px;
    background: none;
  }
  .block > button:not(.block-name):hover:enabled {
    background: #f0f0f0;
  }
  .block-error {
    padding: 0 6px;
    font-weight: 700;
    color: #b42318;
  }
  .add {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .add button {
    padding: 4px 8px;
    border: 1px dashed #a3a3a3;
    border-radius: 6px;
    background: none;
    font-size: 12px;
  }
  .shared summary {
    font-size: 12px;
    color: #6b6b6b;
  }
  .shared .add {
    margin-top: 4px;
  }
  .fields {
    display: grid;
    gap: 12px;
  }
  .fields h2 {
    margin: 0;
    font-size: 16px;
  }
  .fields > .link {
    justify-self: start;
  }
  .field {
    display: grid;
    gap: 4px;
    margin: 0;
    padding: 0;
    border: 0;
  }
  .field legend,
  .field-label {
    padding: 0;
    font-weight: 600;
  }
  .field-error:empty {
    display: none;
  }
  .format-buttons {
    display: flex;
    gap: 4px;
  }
  .format-buttons button {
    padding: 2px 8px;
    border: 1px solid #d9d9d9;
    border-radius: 4px;
    background: #ffffff;
  }
  .format-buttons button[aria-pressed='true'] {
    border-color: #2563eb;
    background: #dbeafe;
  }
  .link-form {
    display: grid;
    gap: 8px;
    padding: 8px;
    border: 1px solid #d9d9d9;
    border-radius: 6px;
    background: #ffffff;
  }
  .link-form input {
    font-weight: 400;
  }
  .ProseMirror {
    position: relative;
    min-height: 72px;
    padding: 6px 8px;
    border: 1px solid #767676;
    border-radius: 2px;
    background: #ffffff;
    white-space: pre-wrap;
    overflow-wrap: break-word;
    font-variant-ligatures: none;
    font-feature-settings: 'liga' 0;
  }
  .ProseMirror p {
    margin: 0 0 8px;
  }
  .ProseMirror p:last-child {
    margin-bottom: 0;
  }
  textarea {
    padding: 6px 8px;
    font: inherit;
    resize: vertical;
  }
  [aria-invalid='true'] {
    border-color: #b42318;
  }
  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
  }
  .choice {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 400;
  }
  lhcms-record-field,
  lhcms-image-field {
    display: grid;
    gap: 4px;
  }
  .record-choice {
    margin: 0;
    font-weight: 400;
  }
  .record-results {
    display: grid;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .record-results button {
    width: 100%;
    border: 1px solid #d9d9d9;
    border-radius: 6px;
    background: #ffffff;
    text-align: left;
  }
  .thumbnail {
    max-width: 100%;
    max-height: 120px;
    border: 1px solid #e5e5e5;
    border-radius: 4px;
    object-fit: contain;
  }
  .preview {
    display: grid;
    min-height: 0;
  }
  iframe {
    width: 100%;
    height: 100%;
    border: 0;
  }
  .empty {
    place-self: center;
    color: #6b6b6b;
  }
  @media (max-width: 720px) {
    .layout {
      grid-template-columns: 1fr;
      grid-template-rows: auto minmax(0, 1fr);
    }
    .phone-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 16px;
      border-bottom: 1px solid #d9d9d9;
      background: #ffffff;
    }
    .layout[data-phone-view='edit'] > .preview,
    .layout[data-phone-view='preview'] > .panel,
    .panel .save {
      display: none;
    }
    .panel {
      border-right: 0;
    }
    button,
    input,
    select {
      min-height: 40px;
    }
    .block > button:not(.block-name) {
      min-width: 40px;
      min-height: 40px;
    }
    input,
    select,
    textarea,
    .ProseMirror {
      font-size: 16px;
    }
  }
`;
