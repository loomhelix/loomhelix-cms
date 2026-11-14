export type Place =
  | { readonly kind: 'text' }
  | { readonly kind: 'tag' }
  | { readonly kind: 'rawText'; readonly element: string }
  | { readonly kind: 'attribute'; readonly name: string };

export interface FilledAttribute {
  readonly name: string;
  readonly value: string;
}

type State = 'text' | 'tag' | 'quotedValue' | 'rawText';

const QUOTES: ReadonlySet<string> = new Set(['"', "'"]);
const RAW_TEXT_ELEMENTS: ReadonlySet<string> = new Set(['script', 'style']);
const OPENING_TAG_PATTERN = /^<([a-z][a-z0-9-]*)/i;
const ATTRIBUTE_NAME_PATTERN = /([^\s"'<>/=]+)\s*=\s*$/;

export class TemplateScanner {
  #state: State = 'text';
  #tagText = '';
  #quote = '';
  #attributeName = '';
  #attributeValue = '';
  #hasValue = false;
  #filledAttributes: FilledAttribute[] = [];
  #rawTextElement = '';
  #rawText = '';

  read(literal: string): void {
    for (const character of literal) {
      this.#readCharacter(character);
    }
  }

  addValue(text: string): void {
    this.#attributeValue += text;
    this.#hasValue = true;
  }

  takeFilledAttributes(): readonly FilledAttribute[] {
    const attributes = this.#filledAttributes;
    this.#filledAttributes = [];
    return attributes;
  }

  isClosed(): boolean {
    return this.#state === 'text';
  }

  place(): Place {
    switch (this.#state) {
      case 'text':
        return { kind: 'text' };
      case 'tag':
        return { kind: 'tag' };
      case 'rawText':
        return { kind: 'rawText', element: this.#rawTextElement };
      case 'quotedValue':
        return this.#attributeName === ''
          ? { kind: 'tag' }
          : { kind: 'attribute', name: this.#attributeName };
    }
  }

  #readCharacter(character: string): void {
    switch (this.#state) {
      case 'text':
        if (character === '<') {
          this.#state = 'tag';
          this.#tagText = character;
        }
        return;
      case 'tag':
        this.#readTagCharacter(character);
        return;
      case 'quotedValue':
        this.#tagText += character;
        if (character === this.#quote) {
          this.#closeAttributeValue();
          return;
        }
        this.#attributeValue += character;
        return;
      case 'rawText':
        this.#readRawTextCharacter(character);
        return;
    }
  }

  #readTagCharacter(character: string): void {
    if (QUOTES.has(character)) {
      this.#attributeName = ATTRIBUTE_NAME_PATTERN.exec(this.#tagText)?.[1]?.toLowerCase() ?? '';
      this.#state = 'quotedValue';
      this.#quote = character;
      this.#attributeValue = '';
      this.#hasValue = false;
    }
    this.#tagText += character;
    if (character === '>' && this.#state === 'tag') {
      this.#closeTag();
    }
  }

  #closeAttributeValue(): void {
    this.#state = 'tag';
    if (this.#hasValue && this.#attributeName !== '') {
      this.#filledAttributes.push({ name: this.#attributeName, value: this.#attributeValue });
    }
  }

  #closeTag(): void {
    const element = OPENING_TAG_PATTERN.exec(this.#tagText)?.[1]?.toLowerCase();
    if (element !== undefined && RAW_TEXT_ELEMENTS.has(element)) {
      this.#state = 'rawText';
      this.#rawTextElement = element;
      this.#rawText = '';
      return;
    }
    this.#state = 'text';
  }

  #readRawTextCharacter(character: string): void {
    const closingTag = `</${this.#rawTextElement}`;
    this.#rawText = (this.#rawText + character).slice(-closingTag.length);
    if (this.#rawText.toLowerCase() === closingTag) {
      this.#state = 'tag';
      this.#tagText = closingTag;
    }
  }
}
