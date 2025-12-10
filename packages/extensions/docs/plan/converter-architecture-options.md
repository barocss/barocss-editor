# Converter Architecture

## Overview

This is the architecture for the Converter that turns external HTML/text into our internal model.

## Core design principles

### Dynamic Schema and dynamic Converter

**Essential principle**:
- **Schema is dynamic**: You can define node types and marks at runtime.
- **Converter must be dynamic**: If Schema is dynamic, conversion rules must be dynamic too.
- **`defineXXX` function pattern**: Use function-based APIs for runtime registration.

**Why this matters**:
```typescript
// Create Schema dynamically
const schema = new Schema('my-schema', {
  nodes: {
    'custom-block': { /* ... */ },
    'custom-inline': { /* ... */ }
  }
});

// Therefore conversion rules must be defined dynamically too
defineASTConverter('custom-block', 'markdown', {
  convert(astNode, toConverter) { /* ... */ }
});

defineConverter('custom-block', 'html', {
  convert: (node) => { /* ... */ }
});
```

**Problem with static class-based approach**:
```typescript
// ❌ Issue: Schema is dynamic, classes are static
class MarkdownParser {
  // How do we add rules for custom-block?
  // Subclass? Modify? → messy and inflexible
}
```

**Benefit of dynamic function-based approach**:
```typescript
// ✅ Solution: add rules at runtime via defineXXX
defineASTConverter('custom-block', 'markdown', { /* ... */ });
defineConverter('custom-block', 'html', { /* ... */ });
// When Schema is created dynamically, rules are added dynamically too
```

**Takeaway**:
- If Schema is dynamic, the Converter must be dynamic.
- The `defineXXX` function pattern is the best fit to support this.

---

## Final architecture decision

### ✅ Converter lives independently (only references Schema)

**Structure**:
```
packages/
  schema/
    src/
      types.ts               # Defines model structure only (no conversion rules)
  
  converter/
    src/
      html-converter.ts      # Conversion rules and actual conversion logic
      registry.ts            # Converter registration/lookup
      rules/                 # Conversion rules
        html-rules.ts        # HTML conversion rules
        default-rules.ts     # Default conversion rules
```

**Why this separation helps**:

1. **Clear responsibility**  
   - **Schema**: model structure and validation only (no conversion rules)  
   - **Converter**: defines rules and performs conversions

2. **Keep Schema pure**  
   - Schema focuses on the data model only  
   - Conversion is an external-format concern  
   - Schema does not depend on conversion logic

3. **Converter stays independent**  
   - Can run with default rules even without a Schema instance  
   - Only references Schema node type names (loose coupling)

4. **Easy to extend**  
   - Add new formats (Markdown, RTF, etc.) without touching Schema  
   - Extensions can register custom conversion rules

5. **Reusable**  
   - Converter can be used in other projects  
   - Can use Converter without bringing in Schema

6. **Testable**  
   - Test Converter in isolation  
   - No need to load Schema to test conversion logic

---

## Converter API

### Type definitions

```typescript
type Format = 
  | 'html'           // HTML markup
  | 'text'           // Plain text
  | 'markdown'       // Markdown
  | 'json'           // JSON (model structure)
  | 'rtf'            // Rich Text Format (e.g., Word)
  | 'latex'          // LaTeX (academic docs)
  | 'asciidoc'       // AsciiDoc (tech docs)
  | 'rst'            // ReStructuredText (Python docs)
  | 'bbcode'         // BBCode (forums)
  | 'xml'            // XML
  | 'yaml'           // YAML
  | 'notion'         // Notion Block Format
  | 'slack'          // Slack Block Kit
  | 'googledocs';    // Google Docs Format

interface ParserRule {
  // DOM-based parsing (HTML, XML)
  parseDOM?: ParseDOMRule[];  // HTML/XML element matching rules
  
  // Simple text parsing (limited use)
  parseText?: (text: string) => INode | null;
  
  priority?: number;
}

/**
 * Whole-document parser interface
 * (Markdown, LaTeX, AsciiDoc, etc. need full-document parsing)
 */
interface DocumentParser {
  /**
   * Parse an entire document and return model nodes
   * 
   * @param document Entire document string
   * @param toConverter AST → Model converter (for recursive calls)
   * @returns Array of model nodes
   */
  parse(document: string, toConverter: (astNode: any) => INode | null): INode[];
}

/**
 * AST → Model conversion rule
 * (after a document parser builds an AST, convert each node type)
 */
interface ASTToModelRule {
  /**
   * Convert an AST node to a model node
   * 
   * ⚠️ Important: Check AST types inside this function.
   * External parsers differ, so handle multiple AST shapes here.
   * 
   * @param astNode AST node produced by the parser
   * @param toConverter Recursive converter (for children)
   * @returns Model node or null (if not convertible)
   */
  convert(astNode: any, toConverter: (astNode: any) => INode | null): INode | null;
  
  priority?: number;
}

interface ConverterRule {
  /**
   * Convert a model node to an external format.
   * The format is already specified in defineConverter,
   * so implement conversion to that format here.
   */
  convert: (node: INode) => string | any;
  
  priority?: number;
}
```

### Key API functions

```typescript
/**
 * Define a rule to parse an external format into the model.
 * 
 * @param stype Model node type name
 * @param format External format ('html', 'text', 'markdown', etc.)
 * @param rule Parser rule
 */
export function defineParser(
  stype: string, 
  format: Format, 
  rule: ParserRule
): void;

/**
 * Register a whole-document parser.
 * (Formats like markdown, latex, asciidoc need full parsing)
 * 
 * @param format Format ('markdown', 'latex', 'asciidoc', etc.)
 * @param parser Parser implementation
 */
export function defineDocumentParser(
  format: Format,
  parser: DocumentParser
): void;

/**
 * Define an AST → Model conversion rule.
 * (Convert AST nodes from a document parser to model nodes)
 * 
 * ⚠️ Important: the first argument is the **model stype** (result type).
 * AST shape varies by parser, so check inside convert().
 * 
 * @param stype Model node type (result stype)
 * @param format Format ('markdown', 'latex', etc.)
 * @param rule Conversion rule
 */
export function defineASTConverter(
  stype: string,  // model stype (conversion result)
  format: Format,
  rule: ASTToModelRule
): void;

/**
 * Define a rule to convert model nodes to an external format.
 * 
 * @param stype Node type name
 * @param format Format ('html', 'text', 'markdown', etc.)
 * @param rule Conversion rule
 * 
 * @example
 * // HTML conversion rule
 * defineConverter('paragraph', 'html', {
 *   convert: (node) => `<p>${node.text || ''}</p>`
 * });
 * 
 * // LaTeX conversion rule
 * defineConverter('section', 'latex', {
 *   convert: (node) => {
 *     const level = node.attributes?.level || 1;
 *     const title = convertContentToLaTeX(node.content || []);
 *     return `\\section{${title}}\n`;
 *   }
 * });
 */
export function defineConverter(
  stype: string, 
  format: Format, 
  rule: ConverterRule
): void;
```

---

## Conversion process structure

Conversion has **3 stages**:

### Stage 1: Use an external parser (Parser)

**Goal**: Turn an external format (HTML, Markdown, LaTeX, etc.) into an AST.

**Key points**:
- Use existing libraries: DOMParser, markdown-it, LaTeX parsers, etc.
- We do not reinvent these parsers.
- Pick the right parser for each format.

**Examples**:
```typescript
// HTML: browser DOMParser
const parser = new DOMParser();
const doc = parser.parseFromString(html, 'text/html');

// Markdown: markdown-it
import MarkdownIt from 'markdown-it';
const md = new MarkdownIt();
const ast = md.parse(markdown);

// LaTeX: LaTeX parser
import { parse } from 'latex-parser';
const ast = parse(latex);
```

### Stage 2: AST → Node (AST Converter)

**Goal**: Convert parser-generated AST to our model Nodes.

**Key points**:
- **Rule-based**: use `defineASTConverter` per model node type.
- ⚠️ First argument is the **model stype** (result type).
- AST shape varies by parser, so check types inside `convert`.
- Use `toConverter` for recursive child conversion.

**Example**:
```typescript
// Rule: convert to model heading
defineASTConverter('heading', 'markdown', {
  convert(astNode: any, toConverter: (astNode: any) => INode | null): INode | null {
    // markdown-it: check 'heading_open'
    if (astNode.type === 'heading_open') {
      const level = parseInt(astNode.tag.slice(1)); // h1 -> 1
      return {
        stype: 'heading',
        attributes: { level },
        content: astNode.children?.map((child: any) => toConverter(child)) || []
      };
    }
    
    // Other markdown parsers: check 'heading'
    if (astNode.type === 'heading') {
      return {
        stype: 'heading',
        attributes: { level: astNode.depth },
        content: astNode.children?.map((child: any) => toConverter(child)) || []
      };
    }
    
    return null; // not convertible
  },
  priority: 100
});
```

**How it runs**:
1. Document parser builds an AST.
2. For each AST node, try all `defineASTConverter` rules.
3. `convert` checks the AST type and returns a model node if it matches.
4. `toConverter` recursively converts children.

### Stage 3: Node → Format (Converter)

**Goal**: Convert model Nodes to a target format.

**Key points**:
- **Rule-based**: use `defineConverter` per node type.
- Same pattern for every format.
- Convert node attributes/content into format-specific syntax.
- **⚠️ Use `convert` method name** (format is already chosen in `defineConverter`).

**Example**:
```typescript
// Convert heading to Markdown syntax
defineConverter('heading', 'markdown', {
  convert: (node: INode) => {
    const level = node.attributes?.level || 1;
    const text = node.text || '';
    return `${'#'.repeat(level)} ${text}\n`;
  }
});

// Convert heading to HTML syntax
defineConverter('heading', 'html', {
  convert: (node: INode) => {
    const level = node.attributes?.level || 1;
    const text = node.text || '';
    return `<h${level}>${text}</h${level}>`;
  }
});

// Convert heading to LaTeX syntax
defineConverter('heading', 'latex', {
  convert: (node: INode) => {
    const level = node.attributes?.level || 1;
    const text = node.text || '';
    const section = ['section', 'subsection', 'subsubsection'][level - 1] || 'section';
    return `\\${section}{${text}}`;
  }
});
```

---

## End-to-end examples

### Markdown → Model → HTML

```typescript
// Stage 1: external parser (markdown-it)
import MarkdownIt from 'markdown-it';
const md = new MarkdownIt();
const ast = md.parse('# Hello World');

// Stage 2: AST → Node (using defineASTConverter rules)
const nodes = convertASTToModel(ast, 'markdown');
// Result: [{ stype: 'heading', attributes: { level: 1 }, text: 'Hello World' }]

// Stage 3: Node → HTML (using defineConverter rules)
const html = convertNodesToFormat(nodes, 'html');
// Result: '<h1>Hello World</h1>'
```

### HTML → Model → Markdown

```typescript
// Stage 1: external parser (DOMParser)
const parser = new DOMParser();
const doc = parser.parseFromString('<h1>Hello World</h1>', 'text/html');

// Stage 2: AST → Node (using defineASTConverter rules)
const nodes = convertDOMToModel(doc.body, 'html');
// Result: [{ stype: 'heading', attributes: { level: 1 }, text: 'Hello World' }]

// Stage 3: Node → Markdown (using defineConverter rules)
const markdown = convertNodesToFormat(nodes, 'markdown');
// Result: '# Hello World\n'
```

---

## Important notes

### 1. About the `sid` field

**You do not need to add `sid` when returning `INode` in conversion rules.**

- DataStore creates `sid` automatically when you call `dataStore.deserializeNodes()` or `dataStore.createNode()`.
- Conversion rules should return pure data: include `stype`, `attributes`, `content`, `text`, etc.
- Conversion rules never use `sid`; `convert` does not look at it.

### 2. How to build nodes

**Prefer plain JS objects**:

```typescript
defineASTConverter('section', 'latex', {
  convert(astNode, toConverter) {
    return {
      stype: 'section',
      attributes: { level: 1 },
      content: [{
        stype: 'inline-text',
        text: astNode.content
      }]
    };
  }
});
```

**Advantages**:
- ✅ No extra dependency: `@barocss/converter` need not depend on `@barocss/model`.
- ✅ Simple and clear: return plain data structures only.
- ✅ Keep conversion rules as pure functions.

### 3. The `convert` method name

**Use `convert` consistently; the format is already specified in `defineConverter`.**

```typescript
// ✅ Correct
defineConverter('section', 'latex', {
  convert: (node: INode): string => {
    // LaTeX conversion logic
  }
});

// ❌ Unnecessary: format is already set, no need for toLaTeX-style names
defineConverter('section', 'latex', {
  toLaTeX: (node: INode): string => { /* ... */ }
});
```

---

## References

- [LaTeX Converter sample code](./converter-latex-sample.md) — full LaTeX conversion example
- [Copy/Paste/Cut spec](./copy-paste-cut-spec.md) — clipboard integration example
