# LaTeX Converter 샘플 코드

## 개요

LaTeX 형식의 문서를 파싱하고 변환하는 완전한 샘플 코드입니다.
Schema 정의부터 파서, 변환 규칙까지 모든 단계를 포함합니다.

## ⚠️ 중요: `sid` 필드에 대해

**변환 규칙에서 반환하는 `INode` 객체에는 `sid`를 포함하지 않아도 됩니다.**

- **`sid`는 DataStore가 자동 생성**: `dataStore.deserializeNodes()` 또는 `dataStore.createNode()` 호출 시 자동으로 `sid`가 할당됩니다
- **변환 규칙은 순수 데이터만 반환**: `stype`, `attributes`, `content`, `text` 등만 포함하면 됩니다
- **변환 규칙은 `sid`를 사용하지 않음**: `convert` 함수는 `sid`를 참조하지 않습니다

**예시**:
```typescript
// ✅ 올바른 방법: sid 없이 반환
defineASTConverter('section', 'latex', {
  convert(astNode, toConverter) {
    return {
      stype: 'section',
      attributes: { level: 1 },
      content: [...]
      // sid는 포함하지 않음
    };
  }
});

// DataStore에 추가할 때 sid가 자동 생성됨
const nodeIds = dataStore.deserializeNodes(nodes, rootId);
// 이제 모든 노드에 sid가 할당됨
```

---

## 1. Schema 정의

### 1.1 LaTeX 문서를 위한 Schema

```typescript
import { createSchema } from '@barocss/schema';

// LaTeX 문서를 위한 Schema 생성
export const latexSchema = createSchema('latex-document', {
  topNode: 'doc',
  nodes: {
    // 문서 루트
    doc: {
      name: 'doc',
      group: 'document',
      content: 'block+'
    },
    
    // 섹션 (section, subsection, subsubsection)
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
    
    // 단락
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
    
    // 수식 블록
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
    
    // 리스트
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
    
    // 리스트 아이템
    'list-item': {
      name: 'list-item',
      group: 'block',
      content: 'inline*'
    },
    
    // 인라인 텍스트
    'inline-text': {
      name: 'inline-text',
      group: 'inline',
      text: true
    },
    
    // 볼드 텍스트 (\textbf{})
    'text-bold': {
      name: 'text-bold',
      group: 'inline',
      content: 'inline*'
    },
    
    // 이탤릭 텍스트 (\textit{})
    'text-italic': {
      name: 'text-italic',
      group: 'inline',
      content: 'inline*'
    },
    
    // 인라인 수식 ($...$)
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

## 2. LaTeX 파서 설정

### 2.1 외부 LaTeX 파서 사용

```typescript
// LaTeX 파서는 복잡하므로, 간단한 예시로 구현
// 실제로는 latex-parser 같은 라이브러리 사용 권장

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
      // Section 파싱 (\section{}, \subsection{}, \subsubsection{})
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
      
      // Equation 파싱 (\begin{equation}...\end{equation})
      // (간단화: 실제로는 더 복잡한 파싱 필요)
      
      // Paragraph 파싱 (일반 텍스트)
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

### 2.2 전체 문서 파서 등록

```typescript
import { defineDocumentParser } from '@barocss/converter';

const latexParser = new SimpleLaTeXParser();

// LaTeX 전체 문서 파서 등록
defineDocumentParser('latex', {
  parse(document: string, toConverter: (astNode: any) => INode | null): INode[] {
    // 1. 외부 파서 사용
    const ast = latexParser.parse(document);
    
    // 2. AST → Model 변환 (defineASTConverter로 정의된 규칙 사용)
    return ast.map(node => toConverter(node)).filter(Boolean) as INode[];
  }
});
```

---

## 3. AST → Model 변환 규칙

### 3.1 Section 변환

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

**⚠️ 중요: `sid` 필드에 대해**

변환 규칙에서 반환하는 `INode` 객체에는 **`sid`를 포함하지 않아도 됩니다**.
- `sid`는 DataStore에 노드를 추가할 때 자동으로 생성됩니다
- `dataStore.createNode()` 또는 `dataStore.deserializeNodes()` 호출 시 `_assignIdsRecursively()`가 자동으로 `sid`를 할당합니다
- 변환 규칙은 순수한 데이터 구조만 반환하면 됩니다

**예시**:
```typescript
// ✅ 올바른 방법: sid 없이 반환
return {
  stype: 'section',
  attributes: { level: 1 },
  content: [...]
};

// ❌ 불필요: sid를 미리 생성할 필요 없음
return {
  sid: 'section-123',  // DataStore가 자동으로 생성
  stype: 'section',
  ...
};
```

**💡 노드 생성 방식: 순수 객체 vs `node`/`textNode` 함수**

변환 규칙에서 노드를 생성하는 방법은 두 가지가 있습니다:

**옵션 1: 순수 JS 객체 (권장)**
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

**장점**:
- ✅ 의존성 없음: `@barocss/converter`가 `@barocss/model`에 의존하지 않아도 됨
- ✅ 간단하고 직관적: 순수 데이터 구조만 반환
- ✅ 변환 규칙은 순수 함수로 유지 가능

**단점**:
- ⚠️ marks 처리 등이 수동으로 해야 함

**옵션 2: `node`/`textNode` 함수 사용**
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

**장점**:
- ✅ DSL 패턴과 일관성: `transaction` DSL과 동일한 스타일
- ✅ `textNode`로 marks 처리 편리: `textNode('inline-text', 'text', [mark('bold')])`
- ✅ 타입 체크가 더 명확할 수 있음

**단점**:
- ⚠️ `@barocss/model` 패키지 의존성 필요
- ⚠️ `node` 함수는 단순히 객체를 반환하는 헬퍼일 뿐 (실제로는 순수 객체와 동일)

**추천**: 
- **순수 객체 방식 권장**: 변환 규칙은 순수 데이터 구조만 반환하는 것이 더 적합합니다. `@barocss/converter` 패키지가 `@barocss/model`에 의존하지 않아도 되므로 패키지 구조가 더 깔끔해집니다.
- **`textNode`가 필요한 경우만**: marks 처리가 복잡한 경우에만 `textNode` 함수를 선택적으로 사용할 수 있습니다.

### 3.2 Paragraph 변환

```typescript
defineASTConverter('paragraph', 'latex', {
  convert(astNode: any, toConverter: (astNode: any) => INode | null): INode | null {
    if (astNode.type === 'paragraph') {
      // LaTeX 텍스트에서 \textbf{}, \textit{} 등을 파싱
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

// 인라인 콘텐츠 파싱 헬퍼
function parseInlineContent(text: string, toConverter: (astNode: any) => INode | null): INode[] {
  const nodes: INode[] = [];
  let currentIndex = 0;
  
  // \textbf{text} 파싱
  const boldRegex = /\\textbf\{([^}]+)\}/g;
  let match;
  
  while ((match = boldRegex.exec(text)) !== null) {
    // match 이전의 일반 텍스트
    if (match.index > currentIndex) {
      nodes.push({
        stype: 'inline-text',
        text: text.substring(currentIndex, match.index)
      });
    }
    
    // \textbf{...} 내용
    nodes.push({
      stype: 'text-bold',
      content: [{
        stype: 'inline-text',
        text: match[1]
      }]
    });
    
    currentIndex = match.index + match[0].length;
  }
  
  // 남은 텍스트
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

### 3.3 Equation 변환

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

### 3.4 Itemize/Enumerate 변환

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

## 4. Model → LaTeX 변환 규칙

### 4.1 Section 변환

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

### 4.2 Paragraph 변환

```typescript
defineConverter('paragraph', 'latex', {
  toLaTeX: (node: INode): string => {
    const content = convertContentToLaTeX(node.content || []);
    const indent = node.attributes?.indent || 0;
    
    if (indent > 0) {
      return `\\indent${' '.repeat(indent)}${content}\n\n`;
    }
    
    return `${content}\n\n`;
  }
});
```

### 4.3 Equation 변환

```typescript
defineConverter('equation', 'latex', {
  toLaTeX: (node: INode): string => {
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

### 4.4 Itemize/Enumerate 변환

```typescript
defineConverter('itemize', 'latex', {
  toLaTeX: (node: INode): string => {
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
  toLaTeX: (node: INode): string => {
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
  toLaTeX: (node: INode): string => {
    return convertContentToLaTeX(node.content || []);
  }
});
```

### 4.5 인라인 요소 변환

```typescript
defineConverter('inline-text', 'latex', {
  toLaTeX: (node: INode): string => {
    // LaTeX 특수 문자 이스케이프
    return escapeLaTeX(node.text || '');
  }
});

defineConverter('text-bold', 'latex', {
  toLaTeX: (node: INode): string => {
    const content = convertContentToLaTeX(node.content || []);
    return `\\textbf{${content}}`;
  }
});

defineConverter('text-italic', 'latex', {
  toLaTeX: (node: INode): string => {
    const content = convertContentToLaTeX(node.content || []);
    return `\\textit{${content}}`;
  }
});

defineConverter('math-inline', 'latex', {
  toLaTeX: (node: INode): string => {
    const formula = node.attributes?.formula || node.text || '';
    return `$${formula}$`;
  }
});
```

### 4.6 헬퍼 함수

```typescript
// 콘텐츠를 LaTeX로 변환
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

// LaTeX 특수 문자 이스케이프
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

## 5. 사용 예시

### 5.1 LaTeX → Model 변환

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

// 1. LaTeX → Model 변환 (sid 없이)
const parser = globalConverterRegistry.getDocumentParser('latex');
const nodes = parser?.parse(latex, (astNode) => 
  globalConverterRegistry.convertASTToModel(astNode, 'latex')
) || [];

// nodes에는 아직 sid가 없음
console.log(nodes);
// 결과: [
//   { stype: 'section', attributes: { level: 1 }, content: [...] },
//   { stype: 'paragraph', content: [...] },
//   ...
// ]

// 2. DataStore에 추가 (이때 sid가 자동으로 생성됨)
const dataStore = new DataStore(latexSchema);
const rootId = dataStore.getRootId();
const nodeIds = dataStore.deserializeNodes(nodes, rootId);

// 이제 모든 노드에 sid가 할당됨
console.log(nodeIds);
// 결과: ['1:1', '1:2', '1:3', ...]

const sectionNode = dataStore.getNode(nodeIds[0]);
console.log(sectionNode?.sid); // '1:1' (자동 생성됨)
```

### 5.2 Model → LaTeX 변환

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

// Model → LaTeX 변환
const latex = nodes
  .map(node => {
    const converter = globalConverterRegistry.getConverter(node.stype, 'latex');
    if (converter.length > 0 && converter[0].toLaTeX) {
      return converter[0].toLaTeX(node);
    }
    return '';
  })
  .join('');

console.log(latex);
// 결과:
// \section{Introduction}\label{intro}
// This is a paragraph with \textbf{bold text} and \textit{italic text}
```

---

## 6. 확장 예시

### 6.1 커스텀 노드 타입 추가

```typescript
// Schema에 새로운 노드 타입 추가
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

// AST → Model 변환 규칙 추가
// ⚠️ 주의: sid는 포함하지 않음 (DataStore가 자동 생성)
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
        // sid는 포함하지 않음 - DataStore.deserializeNodes() 호출 시 자동 생성
      };
    }
    return null;
  },
  priority: 100
});

// Model → LaTeX 변환 규칙 추가
// ⚠️ 주의: node.sid는 사용하지 않음 (변환에 불필요)
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

## 7. 주의사항

### 7.1 LaTeX 파싱의 복잡성

- 실제 LaTeX 파싱은 매우 복잡합니다
- 환경(`\begin{...}...\end{...}`), 명령어(`\command{arg}`), 수식 등 다양한 구조
- 프로덕션 환경에서는 전문 LaTeX 파서 라이브러리 사용 권장

### 7.2 특수 문자 처리

- LaTeX 특수 문자(`{`, `}`, `$`, `&`, `#`, `^`, `_`, `~`, `%`) 이스케이프 필요
- 수식 내부와 일반 텍스트의 처리 방식이 다름

### 7.3 환경 중첩

- LaTeX 환경은 중첩될 수 있음 (`itemize` 안에 `enumerate` 등)
- 재귀적 파싱과 변환이 중요

---

## 8. 테스트 예시

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

