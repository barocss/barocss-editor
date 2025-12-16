# Converter API

The Converter API provides format conversion between external formats (HTML, Markdown, LaTeX, Office HTML, Google Docs HTML, Notion HTML) and the Barocss Editor model format.

## Global Converter Registry

The global registry manages all conversion rules.

### GlobalConverterRegistry Class

```typescript
import { GlobalConverterRegistry } from '@barocss/converter';

const registry = GlobalConverterRegistry.getInstance();
```

#### `getInstance(): GlobalConverterRegistry`

Gets the global registry instance (singleton).

**Returns:**
- `GlobalConverterRegistry` - Registry instance

#### `registerParser(stype: string, format: Format, rule: ParserRule): void`

Registers a parser rule.

**Parameters:**
- `stype: string` - Node type name
- `format: Format` - Format ('html', 'markdown', 'latex', etc.)
- `rule: ParserRule` - Parser rule

#### `registerConverter(stype: string, format: Format, rule: ConverterRule): void`

Registers a converter rule.

**Parameters:**
- `stype: string` - Node type name
- `format: Format` - Format
- `rule: ConverterRule` - Converter rule

#### `registerASTConverter(stype: string, format: Format, rule: ASTToModelRule): void`

Registers an AST converter rule.

**Parameters:**
- `stype: string` - Model node type (conversion result stype)
- `format: Format` - Format
- `rule: ASTToModelRule` - AST converter rule

#### `registerDocumentParser(format: Format, parser: DocumentParser): void`

Registers a document parser.

**Parameters:**
- `format: Format` - Format
- `parser: DocumentParser` - Document parser

#### `getParserRules(stype: string, format: Format): ParserRule[]`

Gets parser rules for a node type and format.

**Returns:**
- `ParserRule[]` - Array of parser rules (sorted by priority)

#### `getConverterRules(stype: string, format: Format): ConverterRule[]`

Gets converter rules for a node type and format.

**Returns:**
- `ConverterRule[]` - Array of converter rules (sorted by priority)

#### `getASTConverterRules(stype: string, format: Format): ASTToModelRule[]`

Gets AST converter rules for a node type and format.

**Returns:**
- `ASTToModelRule[]` - Array of AST converter rules (sorted by priority)

#### `getDocumentParser(format: Format): DocumentParser | undefined`

Gets document parser for a format.

**Returns:**
- `DocumentParser | undefined` - Document parser or `undefined`

#### `clear(): void`

Clears all rules (for testing).

---

## Rule Definition Functions

### `defineParser(stype, format, rule)`

Defines a parser rule for converting external format to model.

**Parameters:**
- `stype: string` - Node type name
- `format: Format` - Format ('html', 'markdown', 'latex', etc.)
- `rule: ParserRule` - Parser rule

**ParserRule:**
```typescript
interface ParserRule {
  parseDOM?: ParseDOMRule[];  // DOM parsing rules
  priority?: number;           // Rule priority (higher = first)
}
```

**Example:**
```typescript
import { defineParser } from '@barocss/converter';

defineParser('paragraph', 'html', {
  parseDOM: [
    { tag: 'p' },
    { tag: 'div', attrs: { class: 'paragraph' } }
  ],
  priority: 100
});
```

### `defineConverter(stype, format, rule)`

Defines a converter rule for converting model to external format.

**Parameters:**
- `stype: string` - Node type name
- `format: Format` - Format
- `rule: ConverterRule` - Converter rule

**ConverterRule:**
```typescript
interface ConverterRule {
  convert: (node: INode, context: ConverterContext) => string;
  priority?: number;  // Rule priority (higher = first)
}
```

**Example:**
```typescript
import { defineConverter } from '@barocss/converter';

// HTML conversion
defineConverter('paragraph', 'html', {
  convert: (node) => {
    const text = node.text || '';
    const content = convertContentToHTML(node.content || []);
    return `<p>${content || text}</p>`;
  },
  priority: 100
});

// Markdown conversion
defineConverter('paragraph', 'markdown', {
  convert: (node) => {
    const text = node.text || '';
    const content = convertContentToMarkdown(node.content || []);
    return `${content || text}\n\n`;
  }
});

// LaTeX conversion
defineConverter('heading', 'latex', {
  convert: (node) => {
    const level = node.attributes?.level || 1;
    const title = convertContentToLaTeX(node.content || []);
    return `\\${'section'.repeat(level)}{${title}}\n`;
  }
});
```

### `defineASTConverter(stype, format, rule)`

Defines an AST converter rule for converting AST nodes (from document parsers) to model.

**Parameters:**
- `stype: string` - Model node type (conversion result stype)
- `format: Format` - Format
- `rule: ASTToModelRule` - AST converter rule

**ASTToModelRule:**
```typescript
interface ASTToModelRule {
  convert: (astNode: any, toConverter: (astNode: any) => INode | null) => INode | null;
  priority?: number;  // Rule priority (higher = first)
}
```

**Example:**
```typescript
import { defineASTConverter } from '@barocss/converter';

defineASTConverter('heading', 'markdown', {
  convert: (astNode, toConverter) => {
    // Check AST node type (from markdown-it or similar)
    if (astNode.type !== 'heading_open') return null;
    
    return {
      stype: 'heading',
      attributes: { level: astNode.level },
      content: astNode.children
        .map(toConverter)
        .filter(Boolean)
    };
  }
});
```

### `defineDocumentParser(format, parser)`

Defines a document parser for formats that require full document parsing (Markdown, LaTeX, etc.).

**Parameters:**
- `format: Format` - Format
- `parser: DocumentParser` - Document parser

**DocumentParser:**
```typescript
interface DocumentParser {
  parse(document: string): any;  // Returns AST
}
```

**Example:**
```typescript
import { defineDocumentParser } from '@barocss/converter';
import MarkdownIt from 'markdown-it';

defineDocumentParser('markdown', {
  parse(document: string) {
    const md = new MarkdownIt();
    return md.parse(document, {});
  }
});
```

---

## Converter Classes

### HTMLConverter

Converts between HTML and model format.

#### Constructor

```typescript
new HTMLConverter()
```

#### Methods

#### `parse(html: string, format?: Format): INode[]`

Parses HTML string to model node array.

**Parameters:**
- `html: string` - HTML string
- `format?: Format` - Format (default: 'html')

**Returns:**
- `INode[]` - Array of model nodes

**Example:**
```typescript
import { HTMLConverter } from '@barocss/converter';

const converter = new HTMLConverter();
const nodes = converter.parse('<p>Hello <strong>World</strong></p>');
// [{ stype: 'paragraph', content: [...], ... }]
```

#### `toModel(html: string): INode[]`

Converts HTML to model (alias for `parse`).

**Parameters:**
- `html: string` - HTML string

**Returns:**
- `INode[]` - Array of model nodes

#### `toHTML(model: INode | INode[]): string`

Converts model to HTML string.

**Parameters:**
- `model: INode | INode[]` - Model node(s)

**Returns:**
- `string` - HTML string

**Example:**
```typescript
const html = converter.toHTML({
  stype: 'paragraph',
  content: ['text-1']
});
// '<p>Hello World</p>'
```

### MarkdownConverter

Converts between Markdown and model format.

#### Constructor

```typescript
new MarkdownConverter()
```

#### Methods

#### `parse(markdown: string, format?: Format): INode[]`

Parses Markdown string to model node array.

**Parameters:**
- `markdown: string` - Markdown string
- `format?: Format` - Format (default: 'markdown')

**Returns:**
- `INode[]` - Array of model nodes

**Example:**
```typescript
import { MarkdownConverter } from '@barocss/converter';

const converter = new MarkdownConverter();
const nodes = converter.parse('# Heading\n\n**Bold** text');
```

#### `toModel(markdown: string): INode[]`

Converts Markdown to model (alias for `parse`).

#### `toMarkdown(model: INode | INode[]): string`

Converts model to Markdown string.

**Parameters:**
- `model: INode | INode[]` - Model node(s)

**Returns:**
- `string` - Markdown string

**Example:**
```typescript
const markdown = converter.toMarkdown({
  stype: 'document',
  content: ['heading-1', 'paragraph-1']
});
// '# Heading\n\nParagraph text\n'
```

### LatexConverter

Converts between LaTeX and model format.

#### Constructor

```typescript
new LatexConverter()
```

#### Methods

#### `parse(latex: string, format?: Format): INode[]`

Parses LaTeX string to model node array.

**Parameters:**
- `latex: string` - LaTeX string
- `format?: Format` - Format (default: 'latex')

**Returns:**
- `INode[]` - Array of model nodes

#### `toModel(latex: string): INode[]`

Converts LaTeX to model (alias for `parse`).

#### `toLatex(model: INode | INode[]): string`

Converts model to LaTeX string.

**Parameters:**
- `model: INode | INode[]` - Model node(s)

**Returns:**
- `string` - LaTeX string

---

## HTML Cleaners

HTML cleaners sanitize and normalize HTML from external sources.

### OfficeHTMLCleaner

Cleans Office HTML (Word, Excel, PowerPoint).

#### Constructor

```typescript
new OfficeHTMLCleaner()
```

#### Methods

#### `clean(html: string): string`

Cleans Office HTML.

**Parameters:**
- `html: string` - Office HTML string

**Returns:**
- `string` - Cleaned HTML string

**Example:**
```typescript
import { OfficeHTMLCleaner } from '@barocss/converter';

const cleaner = new OfficeHTMLCleaner();
const cleaned = cleaner.clean(officeHTML);
```

### GoogleDocsHTMLCleaner

Cleans Google Docs HTML.

#### Constructor

```typescript
new GoogleDocsHTMLCleaner()
```

#### Methods

#### `clean(html: string): string`

Cleans Google Docs HTML.

**Parameters:**
- `html: string` - Google Docs HTML string

**Returns:**
- `string` - Cleaned HTML string

### NotionHTMLCleaner

Cleans Notion HTML.

#### Constructor

```typescript
new NotionHTMLCleaner()
```

#### Methods

#### `clean(html: string): string`

Cleans Notion HTML.

**Parameters:**
- `html: string` - Notion HTML string

**Returns:**
- `string` - Cleaned HTML string

---

## Default Rules Registration

### `registerDefaultHTMLRules()`

Registers default HTML conversion rules.

**Example:**
```typescript
import { registerDefaultHTMLRules } from '@barocss/converter';

registerDefaultHTMLRules();
```

### `registerDefaultMarkdownRules()`

Registers default Markdown conversion rules.

**Example:**
```typescript
import { registerDefaultMarkdownRules } from '@barocss/converter';

registerDefaultMarkdownRules();
```

### `registerDefaultLatexRules()`

Registers default LaTeX conversion rules.

**Example:**
```typescript
import { registerDefaultLatexRules } from '@barocss/converter';

registerDefaultLatexRules();
```

### `registerOfficeHTMLRules()`

Registers Office HTML conversion rules.

**Example:**
```typescript
import { registerOfficeHTMLRules } from '@barocss/converter';

registerOfficeHTMLRules();
```

### `registerGoogleDocsHTMLRules()`

Registers Google Docs HTML conversion rules.

**Example:**
```typescript
import { registerGoogleDocsHTMLRules } from '@barocss/converter';

registerGoogleDocsHTMLRules();
```

### `registerNotionHTMLRules()`

Registers Notion HTML conversion rules.

**Example:**
```typescript
import { registerNotionHTMLRules } from '@barocss/converter';

registerNotionHTMLRules();
```

### `cleanOfficeHTML(html: string): string`

Cleans Office HTML (convenience function).

**Parameters:**
- `html: string` - Office HTML string

**Returns:**
- `string` - Cleaned HTML string

**Example:**
```typescript
import { cleanOfficeHTML } from '@barocss/converter';

const cleaned = cleanOfficeHTML(officeHTML);
```

---

## Format Types

```typescript
type Format = 
  | 'html'
  | 'markdown'
  | 'latex'
  | 'text'
  | 'office-html'
  | 'google-docs-html'
  | 'notion-html';
```

---

## Complete Example

### Example 1: HTML Conversion

```typescript
import { HTMLConverter, registerDefaultHTMLRules, defineParser, defineConverter } from '@barocss/converter';

// Register default rules
registerDefaultHTMLRules();

// Define custom parser
defineParser('custom-block', 'html', {
  parseDOM: [
    { tag: 'div', attrs: { 'data-custom': 'true' } }
  ]
});

// Define custom converter
defineConverter('custom-block', 'html', {
  convert: (node) => {
    return `<div data-custom="true">${node.text || ''}</div>`;
  }
});

// Create converter
const converter = new HTMLConverter();

// Convert HTML to model
const html = '<p>Hello <strong>World</strong></p>';
const model = converter.toModel(html);

// Convert model to HTML
const htmlOutput = converter.toHTML(model);
```

### Example 2: Markdown Conversion

```typescript
import { MarkdownConverter, registerDefaultMarkdownRules, defineDocumentParser, defineASTConverter } from '@barocss/converter';
import MarkdownIt from 'markdown-it';

// Register default rules
registerDefaultMarkdownRules();

// Define document parser
defineDocumentParser('markdown', {
  parse(document: string) {
    const md = new MarkdownIt();
    return md.parse(document, {});
  }
});

// Define AST converter
defineASTConverter('heading', 'markdown', {
  convert: (astNode, toConverter) => {
    if (astNode.type !== 'heading_open') return null;
    return {
      stype: 'heading',
      attributes: { level: astNode.level },
      content: astNode.children.map(toConverter).filter(Boolean)
    };
  }
});

// Create converter
const converter = new MarkdownConverter();

// Convert Markdown to model
const markdown = '# Heading\n\n**Bold** text';
const model = converter.toModel(markdown);

// Convert model to Markdown
const markdownOutput = converter.toMarkdown(model);
```

### Example 3: Office HTML Cleaning

```typescript
import { HTMLConverter, OfficeHTMLCleaner, registerOfficeHTMLRules } from '@barocss/converter';

// Register Office HTML rules
registerOfficeHTMLRules();

// Clean Office HTML
const cleaner = new OfficeHTMLCleaner();
const cleanedHTML = cleaner.clean(officeHTML);

// Convert cleaned HTML to model
const converter = new HTMLConverter();
const model = converter.toModel(cleanedHTML);
```

---

## Related

- [Architecture: Converter](../architecture/converter) - Converter architecture
- [DataStore API](./datastore-api) - Model storage
- [Model API](./model-api) - Model operations
