# LaTeX Converter sample code

## Overview

This is a full, end-to-end example for parsing and converting LaTeX. It covers Schema definition, parser, AST→Model rules, and Model→LaTeX rules.

## ⚠️ Important: about the `sid` field

Do **not** include `sid` in the `INode` objects you return from conversion rules.

- `sid` is assigned automatically by DataStore when you call `dataStore.deserializeNodes()` or `dataStore.createNode()`.
- Conversion rules should return pure data only: `stype`, `attributes`, `content`, `text`, etc.
- Conversion rules never read `sid`; `convert` does not use it.

Example:
```typescript
// ✅ Correct: return without sid
defineASTConverter('section', 'latex', {
  convert(astNode, toConverter) {
    return {
      stype: 'section',
      attributes: { level: 1 },
      content: [...]
      // sid is not included
    };
  }
});

// DataStore will assign sid automatically
const nodeIds = dataStore.deserializeNodes(nodes, rootId);
// Now every node has an sid
```

---

## 1. Define the Schema

### 1.1 Schema for LaTeX documents

```typescript
import { createSchema } from '@barocss/schema';

// Schema for LaTeX documents
export const latexSchema = createSchema('latex-document', {
  topNode: 'doc',
  nodes: {
    // Document root
    doc: {
      name: 'doc',
      group: 'document',
      content: 'block+'
    },
    
    // Section (section, subsection, subsubsection)
    section: {
      name: 'section',
      group: 'block',
      content: 'inline*',
      attributes: {
        level: {
          type: 'number',
          default: 1,
          validator: (value: number) => value >= 1 && value <= 3
        },
        label: {
          type: 'string',
          default: ''
        }
      },
      selectable: true
    },
    
    // Paragraph
    paragraph: {
      name: 'paragraph',
      group: 'block',
      content: 'inline*',
      attributes: {
        indent: {
          type: 'number',
          default: 0,
          validator: (value: number) => value >= 0
        }
      }
    },
    
    // Equation block
    equation: {
      name: 'equation',
      group: 'block',
      content: 'inline*',
      attributes: {
        label: {
          type: 'string',
          default: ''
        },
        numbered: {
          type: 'boolean',
          default: true
        }
      },
      selectable: true
    },
    
    // Lists
    itemize: {
      name: 'itemize',
      group: 'block',
      content: 'list-item+',
      selectable: true
    },
    
    enumerate: {
      name: 'enumerate',
      group: 'block',
      content: 'list-item+',
      attributes: {
        start: {
          type: 'number',
          default: 1
        }
      },
      selectable: true
    },
    
    // List item
    'list-item': {
      name: 'list-item',
      group: 'block',
      content: 'inline*'
    },
    
    // Inline text
    'inline-text': {
      name: 'inline-text',
      group: 'inline',
      text: true
    },
    
    // Bold text (\textbf{})
    'text-bold': {
      name: 'text-bold',
      group: 'inline',
      content: 'inline*'
    },
    
    // Italic text (\textit{})
    'text-italic': {
      name: 'text-italic',
      group: 'inline',
      content: 'inline*'
    },
    
    // Inline math ($...$)
    'math-inline': {
      name: 'math-inline',
      group: 'inline',
      text: true,
      atom: true,
      attributes: {
        formula: {
          type: 'string',
          required: true
        }
      }
    }
  },
  
  marks: {
    bold: {
      name: 'bold'
    },
    italic: {
      name: 'italic'
    }
  }
});
```

---

## 2. Set up the LaTeX parser

### 2.1 Use an external LaTeX parser

```typescript
// Real LaTeX parsing is complex; this is a simplified demo.
// In production, prefer a dedicated LaTeX parser library.

interface LaTeXASTNode {
  type: string;
  content?: string;
  children?: LaTeXASTNode[];
  level?: number;
  label?: string;
  numbered?: boolean;
  start?: number;
}

class SimpleLaTeXParser {
  parse(latex: string): LaTeXASTNode[] {
    const nodes: LaTeXASTNode[] = [];
    const lines = latex.split('\n');
    
    for (const line of lines) {
      // Parse section (\section{}, \subsection{}, \subsubsection{})
      const sectionMatch = line.match(/^\\(section|subsection|subsubsection)\{([^}]+)\}/);
      if (sectionMatch) {
        const level = sectionMatch[1] === 'section' ? 1 : 
                     sectionMatch[1] === 'subsection' ? 2 : 3;
        nodes.push({
          type: 'section',
          content: sectionMatch[2],
          level
        });
        continue;
      }
      
      // Equation parsing (\begin{equation}...\end{equation})
      // (simplified; real parsing is more involved)
      
      // Paragraph parsing (plain text)
      if (line.trim() && !line.startsWith('\\')) {
        nodes.push({
          type: 'paragraph',
          content: line.trim()
        });
      }
    }
    
    return nodes;
  }
}
```

### 2.2 Register the whole-document parser

```typescript
import { defineDocumentParser } from '@barocss/converter';

const latexParser = new SimpleLaTeXParser();

// Register LaTeX whole-document parser
defineDocumentParser('latex', {
  parse(document: string, toConverter: (astNode: any) => INode | null): INode[] {
    // 1) Use external parser
    const ast = latexParser.parse(document);
    
    // 2) AST → Model conversion (rules defined via defineASTConverter)
    return ast.map(node => toConverter(node)).filter(Boolean) as INode[];
  }
});
```

---

## 3. AST → Model conversion rules

### 3.1 Section conversion

```typescript
import { defineASTConverter } from '@barocss/converter';

defineASTConverter('section', 'latex', {
  convert(astNode: any, toConverter: (astNode: any) => INode | null): INode | null {
    if (astNode.type === 'section') {
      return {
        stype: 'section',
        attributes: {
          level: astNode.level || 1,
          label: astNode.label || ''
        },
        content: astNode.content ? [
          {
            stype: 'inline-text',
            text: astNode.content
          }
        ] : []
      };
    }
    return null;
  },
  priority: 100
});
```

⚠️ Reminder: do **not** include `sid` in these returned nodes.
- DataStore assigns `sid` when nodes are added.
- `_assignIdsRecursively()` runs during `dataStore.createNode()` or `dataStore.deserializeNodes()`.
- Return pure data only.

Example:
```typescript
// ✅ Correct: no sid
return {
  stype: 'section',
  attributes: { level: 1 },
  content: [...]
};

// ❌ Unnecessary: do not pre-create sid
return {
  sid: 'section-123',  // DataStore will create this
  stype: 'section',
  ...
};
```

💡 How to build nodes: plain objects vs `node`/`textNode`

Two options when building nodes inside conversion rules:

**Option 1: Plain JS objects (recommended)**
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
Pros:
- No extra dependency: `@barocss/converter` stays independent of `@barocss/model`
- Simple and clear: pure data structures
- Conversion rules remain pure functions

Cons:
- Marks and similar details are handled manually

**Option 2: Use `node`/`textNode` helpers**
```typescript
import { node, textNode } from '@barocss/model';

defineASTConverter('section', 'latex', {
  convert(astNode, toConverter) {
    return node('section', { level: 1 }, [
      textNode('inline-text', astNode.content)
    ]);
  }
});
```
Pros:
- Consistent with DSL style (`transaction` DSL)
- Easier mark handling with `textNode('inline-text', text, [mark('bold')])`
- Potentially clearer typing

Cons:
- Requires dependency on `@barocss/model`
- `node` is just a helper returning plain objects

Recommendation:
- Prefer plain objects so `@barocss/converter` stays decoupled.
- Use `textNode` only when mark handling is complex and the helper is beneficial.

### 3.2 Paragraph conversion

```typescript
defineASTConverter('paragraph', 'latex', {
  convert(astNode: any, toConverter: (astNode: any) => INode | null): INode | null {
    if (astNode.type === 'paragraph') {
      // Parse inline LaTeX like \textbf{}, \textit{}, etc.
      const content = parseInlineContent(astNode.content || '', toConverter);
      
      return {
        stype: 'paragraph',
        attributes: {
          indent: astNode.indent || 0
        },
        content
      };
    }
    return null;
  },
  priority: 100
});

// Helper to parse inline content
function parseInlineContent(text: string, toConverter: (astNode: any) => INode | null): INode[] {
  const nodes: INode[] = [];
  let currentIndex = 0;
  
  // Parse \textbf{text}
  const boldRegex = /\\textbf\{([^}]+)\}/g;
  let match;
  
  while ((match = boldRegex.exec(text)) !== null) {
    // Plain text before the match
    if (match.index > currentIndex) {
      nodes.push({
        stype: 'inline-text',
        text: text.substring(currentIndex, match.index)
      });
    }
    
    // The contents of \textbf{...}
    nodes.push({
      stype: 'text-bold',
      content: [{
        stype: 'inline-text',
        text: match[1]
      }]
    });
    
    currentIndex = match.index + match[0].length;
  }
  
  // Remaining text
  if (currentIndex < text.length) {
    nodes.push({
      stype: 'inline-text',
      text: text.substring(currentIndex)
    });
  }
  
  return nodes.length > 0 ? nodes : [{
    stype: 'inline-text',
    text: text
  }];
}
```

### 3.3 Equation conversion

```typescript
defineASTConverter('equation', 'latex', {
  convert(astNode: any, toConverter: (astNode: any) => INode | null): INode | null {
    if (astNode.type === 'equation' || 
        (astNode.type === 'env' && astNode.name === 'equation')) {
      return {
        stype: 'equation',
        attributes: {
          label: astNode.label || '',
          numbered: astNode.numbered !== false
        },
        content: astNode.content ? [
          {
            stype: 'math-inline',
            attributes: {
              formula: astNode.content
            }
          }
        ] : []
      };
    }
    return null;
  },
  priority: 100
});
```

### 3.4 Itemize/Enumerate conversion

```typescript
defineASTConverter('itemize', 'latex', {
  convert(astNode: any, toConverter: (astNode: any) => INode | null): INode | null {
    if (astNode.type === 'itemize' || 
        (astNode.type === 'env' && astNode.name === 'itemize')) {
      return {
        stype: 'itemize',
        content: (astNode.children || []).map((child: any) => toConverter(child)) || []
      };
    }
    return null;
  },
  priority: 100
});

defineASTConverter('list-item', 'latex', {
  convert(astNode: any, toConverter: (astNode: any) => INode | null): INode | null {
    if (astNode.type === 'item') {
      return {
        stype: 'list-item',
        content: (astNode.children || []).map((child: any) => toConverter(child)) || []
      };
    }
    return null;
  },
  priority: 100
});

defineASTConverter('enumerate', 'latex', {
  convert(astNode: any, toConverter: (astNode: any) => INode | null): INode | null {
    if (astNode.type === 'enumerate' || 
        (astNode.type === 'env' && astNode.name === 'enumerate')) {
      return {
        stype: 'enumerate',
        attributes: {
          start: astNode.start || 1
        },
        content: (astNode.children || []).map((child: any) => toConverter(child)) || []
      };
    }
    return null;
  },
  priority: 100
});
```

---

## 4. Model → LaTeX conversion rules

### 4.1 Section conversion

```typescript
import { defineConverter } from '@barocss/converter';

defineConverter('section', 'latex', {
  convert: (node: INode): string => {
    const level = node.attributes?.level || 1;
    const title = convertContentToLaTeX(node.content || []);
    const sectionCmd = level === 1 ? 'section' : 
                      level === 2 ? 'subsection' : 
                      'subsubsection';
    
    let result = `\\${sectionCmd}{${title}}`;
    
    if (node.attributes?.label) {
      result += `\\label{${node.attributes.label}}`;
    }
    
    return result + '\n';
  }
});
```

### 4.2 Paragraph conversion

```typescript
defineConverter('paragraph', 'latex', {
  convert: (node: INode): string => {
    const content = convertContentToLaTeX(node.content || []);
    const indent = node.attributes?.indent || 0;
    
    if (indent > 0) {
      return `\\indent${' '.repeat(indent)}${content}\n\n`;
    }
    
    return `${content}\n\n`;
  }
});
```

### 4.3 Equation conversion

```typescript
defineConverter('equation', 'latex', {
  convert: (node: INode): string => {
    const formula = node.content?.find(c => c.stype === 'math-inline')?.attributes?.formula || '';
    const label = node.attributes?.label || '';
    const numbered = node.attributes?.numbered !== false;
    
    if (numbered) {
      let result = `\\begin{equation}`;
      if (label) {
        result += `\\label{${label}}`;
      }
      result += `\n  ${formula}\n\\end{equation}\n`;
      return result;
    } else {
      return `\\begin{equation*}\n  ${formula}\n\\end{equation*}\n`;
    }
  }
});
```

### 4.4 Itemize/Enumerate conversion

```typescript
defineConverter('itemize', 'latex', {
  convert: (node: INode): string => {
    const items = (node.content || [])
      .filter(c => c.stype === 'list-item')
      .map(item => {
        const content = convertContentToLaTeX(item.content || []);
        return `  \\item ${content}`;
      })
      .join('\n');
    
    return `\\begin{itemize}\n${items}\n\\end{itemize}\n`;
  }
});

defineConverter('enumerate', 'latex', {
  convert: (node: INode): string => {
    const start = node.attributes?.start || 1;
    const items = (node.content || [])
      .filter(c => c.stype === 'list-item')
      .map(item => {
        const content = convertContentToLaTeX(item.content || []);
        return `  \\item ${content}`;
      })
      .join('\n');
    
    let result = `\\begin{enumerate}`;
    if (start !== 1) {
      result += `[start=${start}]`;
    }
    result += `\n${items}\n\\end{enumerate}\n`;
    return result;
  }
});

defineConverter('list-item', 'latex', {
  convert: (node: INode): string => {
    return convertContentToLaTeX(node.content || []);
  }
});
```

### 4.5 Inline elements conversion

```typescript
defineConverter('inline-text', 'latex', {
  convert: (node: INode): string => {
    // Escape LaTeX special characters
    return escapeLaTeX(node.text || '');
  }
});

defineConverter('text-bold', 'latex', {
  convert: (node: INode): string => {
    const content = convertContentToLaTeX(node.content || []);
    return `\\textbf{${content}}`;
  }
});

defineConverter('text-italic', 'latex', {
  convert: (node: INode): string => {
    const content = convertContentToLaTeX(node.content || []);
    return `\\textit{${content}}`;
  }
});

defineConverter('math-inline', 'latex', {
  convert: (node: INode): string => {
    const formula = node.attributes?.formula || node.text || '';
    return `$${formula}$`;
  }
});
```

### 4.6 Helper functions

```typescript
// Convert content to LaTeX
function convertContentToLaTeX(content: INode[]): string {
  return content
    .map(node => {
      const converter = globalConverterRegistry.getConverter(node.stype, 'latex');
      if (converter.length > 0 && converter[0].convert) {
        return converter[0].convert(node);
      }
      return '';
    })
    .join('');
}

// Escape LaTeX special characters
function escapeLaTeX(text: string): string {
  return text
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\$/g, '\\$')
    .replace(/\&/g, '\\&')
    .replace(/\#/g, '\\#')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/\_/g, '\\_')
    .replace(/\~/g, '\\textasciitilde{}')
    .replace(/\%/g, '\\%');
}
```

---

## 5. Usage examples

### 5.1 LaTeX → Model

```typescript
import { latexParser } from '@barocss/converter';
import { DataStore } from '@barocss/datastore';

const latex = `
\\section{Introduction}
This is a paragraph with \\textbf{bold text} and \\textit{italic text}.

\\begin{equation}
  E = mc^2
\\end{equation}

\\begin{itemize}
  \\item First item
  \\item Second item
\\end{itemize}
`;

// 1) LaTeX → Model (without sid)
const parser = globalConverterRegistry.getDocumentParser('latex');
const nodes = parser?.parse(latex, (astNode) => 
  globalConverterRegistry.convertASTToModel(astNode, 'latex')
) || [];

// nodes do not have sid yet
console.log(nodes);
// Result: [
//   { stype: 'section', attributes: { level: 1 }, content: [...] },
//   { stype: 'paragraph', content: [...] },
//   ...
// ]

// 2) Add to DataStore (sid is created here)
const dataStore = new DataStore(latexSchema);
const rootId = dataStore.getRootId();
const nodeIds = dataStore.deserializeNodes(nodes, rootId);

// Now every node has sid
console.log(nodeIds);
// Result: ['1:1', '1:2', '1:3', ...]

const sectionNode = dataStore.getNode(nodeIds[0]);
console.log(sectionNode?.sid); // '1:1' (auto-generated)
```

### 5.2 Model → LaTeX

```typescript
const nodes: INode[] = [
  {
    stype: 'section',
    attributes: { level: 1, label: 'intro' },
    content: [{
      stype: 'inline-text',
      text: 'Introduction'
    }]
  },
  {
    stype: 'paragraph',
    content: [
      { stype: 'inline-text', text: 'This is a paragraph with ' },
      {
        stype: 'text-bold',
        content: [{ stype: 'inline-text', text: 'bold text' }]
      },
      { stype: 'inline-text', text: ' and ' },
      {
        stype: 'text-italic',
        content: [{ stype: 'inline-text', text: 'italic text' }]
      }
    ]
  }
];

// Model → LaTeX
const latex = nodes
  .map(node => {
    const converter = globalConverterRegistry.getConverter(node.stype, 'latex');
    if (converter.length > 0 && converter[0].convert) {
      return converter[0].convert(node);
    }
    return '';
  })
  .join('');

console.log(latex);
// Result:
// \section{Introduction}\label{intro}
// This is a paragraph with \textbf{bold text} and \textit{italic text}
```

---

## 6. Extension example

### 6.1 Add a custom node type

```typescript
// Extend Schema with a new node type
const extendedSchema = latexSchema.extend({
  nodes: {
    'custom-theorem': {
      name: 'custom-theorem',
      group: 'block',
      content: 'inline*',
      attributes: {
        name: {
          type: 'string',
          required: true
        },
        number: {
          type: 'number',
          default: 0
        }
      }
    }
  }
});

// Add AST → Model conversion rule
// ⚠️ Note: do not include sid (DataStore creates it)
defineASTConverter('custom-theorem', 'latex', {
  convert(astNode: any, toConverter: (astNode: any) => INode | null): INode | null {
    if (astNode.type === 'theorem') {
      return {
        stype: 'custom-theorem',
        attributes: {
          name: astNode.name || '',
          number: astNode.number || 0
        },
        content: (astNode.children || []).map((child: any) => toConverter(child)) || []
        // sid is not included — DataStore.deserializeNodes() assigns it
      };
    }
    return null;
  },
  priority: 100
});

// Add Model → LaTeX conversion rule
// ⚠️ Note: do not use node.sid (not needed for conversion)
defineConverter('custom-theorem', 'latex', {
  convert: (node: INode): string => {
    const name = node.attributes?.name || 'Theorem';
    const number = node.attributes?.number || 0;
    const content = convertContentToLaTeX(node.content || []);
    return `\\begin{theorem}[${name} ${number}]\n  ${content}\n\\end{theorem}\n`;
  }
});
```

---

## 7. Notes and caveats

### 7.1 LaTeX parsing is complex

- Real-world LaTeX parsing is very involved.
- Environments (`\begin{...}...\end{...}`), commands (`\command{arg}`), formulas, and nesting add complexity.
- In production, use a specialized LaTeX parser library.

### 7.2 Special characters

- Escape LaTeX special chars: `{`, `}`, `$`, `&`, `#`, `^`, `_`, `~`, `%`.
- Math contexts vs plain text may need different handling.

### 7.3 Nested environments

- Environments can nest (`itemize` inside `enumerate`, etc.).
- Recursive parsing and conversion matter.

---

## 8. Test examples

```typescript
import { describe, it, expect } from 'vitest';

describe('LaTeX Converter', () => {
  it('should parse LaTeX section to model', () => {
    const latex = '\\section{Introduction}';
    const parser = globalConverterRegistry.getDocumentParser('latex');
    const nodes = parser?.parse(latex, (astNode) => 
      globalConverterRegistry.convertASTToModel(astNode, 'latex')
    ) || [];
    
    expect(nodes).toHaveLength(1);
    expect(nodes[0].stype).toBe('section');
    expect(nodes[0].attributes?.level).toBe(1);
  });
  
  it('should convert model section to LaTeX', () => {
    const node: INode = {
      stype: 'section',
      attributes: { level: 1 },
      content: [{ stype: 'inline-text', text: 'Introduction' }]
    };
    
    const converter = globalConverterRegistry.getConverter('section', 'latex');
    const latex = converter[0]?.convert?.(node) || '';
    
    expect(latex).toContain('\\section{Introduction}');
  });
});
```
