# @barocss/converter

Pluggable document format converter for converting between external formats and the Barocss Editor model format.

## Purpose

Converts documents between external formats and Barocss model format:
- **Import**: Convert external formats to model format
- **Export**: Convert model format to external formats
- **Format Support**: HTML, Markdown, LaTeX, Office HTML, Google Docs HTML, Notion HTML

## Key Exports

- `HTMLConverter` - HTML conversion
- `MarkdownConverter` - Markdown conversion
- `LaTeXConverter` - LaTeX conversion
- `OfficeHTMLConverter` - Office HTML conversion
- `GoogleDocsConverter` - Google Docs HTML conversion
- `NotionConverter` - Notion HTML conversion

## Supported Formats

### HTML

Convert HTML to/from model format:

```typescript
import { HTMLConverter } from '@barocss/converter';

const converter = new HTMLConverter();

// Import HTML to model
const model = converter.fromHTML(htmlString, schema);

// Export model to HTML
const html = converter.toHTML(model);
```

### Markdown

Convert Markdown to/from model format:

```typescript
import { MarkdownConverter } from '@barocss/converter';

const converter = new MarkdownConverter();

// Import Markdown to model
const model = converter.fromMarkdown(markdownString, schema);

// Export model to Markdown
const markdown = converter.toMarkdown(model);
```

### LaTeX

Convert LaTeX to/from model format:

```typescript
import { LaTeXConverter } from '@barocss/converter';

const converter = new LaTeXConverter();

// Import LaTeX to model
const model = converter.fromLaTeX(latexString, schema);

// Export model to LaTeX
const latex = converter.toLaTeX(model);
```

## Office HTML Cleaners

Clean and convert Office HTML (Word, Excel, PowerPoint):

```typescript
import { OfficeHTMLConverter } from '@barocss/converter';

const converter = new OfficeHTMLConverter();

// Clean Office HTML and convert to model
const model = converter.fromOfficeHTML(officeHTML, schema);
```

**Features:**
- Removes Office-specific markup
- Normalizes styles
- Converts Office elements to model nodes

## Google Docs HTML

Convert Google Docs HTML:

```typescript
import { GoogleDocsConverter } from '@barocss/converter';

const converter = new GoogleDocsConverter();

// Convert Google Docs HTML to model
const model = converter.fromGoogleDocsHTML(googleDocsHTML, schema);
```

**Features:**
- Handles Google Docs specific markup
- Preserves formatting
- Converts Google Docs elements to model nodes

## Notion HTML

Convert Notion HTML:

```typescript
import { NotionConverter } from '@barocss/converter';

const converter = new NotionConverter();

// Convert Notion HTML to model
const model = converter.fromNotionHTML(notionHTML, schema);
```

**Features:**
- Handles Notion-specific structure
- Preserves blocks and formatting
- Converts Notion elements to model nodes

## Conversion Rules

Converters use rules to map external formats to model:

```typescript
// Custom rules
const rules = {
  'h1': { stype: 'heading', attrs: { level: 1 } },
  'h2': { stype: 'heading', attrs: { level: 2 } },
  'p': { stype: 'paragraph' },
  'strong': { mark: 'bold' },
  'em': { mark: 'italic' }
};

const converter = new HTMLConverter({ rules });
```

## Registry System

Converters are registered in a registry:

```typescript
import { ConverterRegistry } from '@barocss/converter';

const registry = new ConverterRegistry();

// Register converter
registry.register('html', HTMLConverter);
registry.register('markdown', MarkdownConverter);

// Get converter
const converter = registry.get('html');
```

## Integration

Converters integrate with:
- **Schema**: Uses schema to validate converted nodes
- **DataStore**: Can directly import to DataStore
- **Model**: Converts to/from model format

## When to Use

- **Import Documents**: Convert external documents to editor format
- **Export Documents**: Export editor content to external formats
- **Format Migration**: Migrate between formats
- **Paste Handling**: Convert pasted content to model format

## Related

- [Schema](./schema) - Used for validation during conversion
- [Model](./model) - Target format for conversion
