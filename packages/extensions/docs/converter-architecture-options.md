# Converter 아키텍처

## 개요

외부 HTML/텍스트를 내부 모델로 변환하는 Converter의 아키텍처입니다.

## 핵심 설계 원칙

### 동적 Schema와 동적 Converter

**중요한 설계 원칙**:
- **Schema는 동적으로 생성 가능**: 런타임에 노드 타입과 마크를 정의할 수 있음
- **Converter도 동적으로 정의**: Schema가 동적이므로, 변환 규칙도 동적으로 정의해야 함
- **`defineXXX` 함수 패턴**: 동적 정의를 위한 함수 기반 API

**이유**:
```typescript
// Schema를 동적으로 생성
const schema = new Schema('my-schema', {
  nodes: {
    'custom-block': { /* ... */ },
    'custom-inline': { /* ... */ }
  }
});

// 따라서 변환 규칙도 동적으로 정의해야 함
defineASTConverter('custom-block', 'markdown', {
  convert(astNode, toConverter) { /* ... */ }
});

defineConverter('custom-block', 'html', {
  convert: (node) => { /* ... */ }
});
```

**정적 클래스 기반 접근의 문제**:
```typescript
// ❌ 문제: Schema가 동적으로 생성되는데, 클래스는 정적
class MarkdownParser {
  // custom-block에 대한 규칙을 어떻게 추가?
  // 클래스를 상속? 수정? → 복잡하고 유연하지 않음
}
```

**동적 함수 기반 접근의 장점**:
```typescript
// ✅ 해결: defineXXX 함수로 런타임에 규칙 추가
defineASTConverter('custom-block', 'markdown', { /* ... */ });
defineConverter('custom-block', 'html', { /* ... */ });
// Schema가 동적으로 생성되면, 변환 규칙도 동적으로 추가 가능
```

**결론**: 
- Schema가 동적이므로 Converter도 동적이어야 함
- `defineXXX` 함수 패턴이 이를 지원하는 최적의 방법

---

## 최종 아키텍처 결정

### ✅ Converter 패키지 독립 (Schema 참조만)

**구조**:
```
packages/
  schema/
    src/
      types.ts               # 모델 구조만 정의 (변환 규칙 없음)
  
  converter/
    src/
      html-converter.ts      # 변환 규칙 정의 및 실제 변환 로직
      registry.ts            # Converter 등록/조회
      rules/                 # 변환 규칙 정의
        html-rules.ts        # HTML 변환 규칙
        default-rules.ts     # 기본 변환 규칙
```

**이유**:

1. **명확한 책임 분리**:
   - **Schema**: 모델 구조와 검증만 담당 (변환 규칙 없음)
   - **Converter**: 변환 규칙 정의 및 실제 변환 로직 담당

2. **Schema의 순수성 유지**:
   - Schema는 "데이터 모델"에만 집중
   - 변환은 "외부 형식 처리"이므로 Schema의 책임이 아님
   - Schema가 변환 로직에 의존하지 않음

3. **Converter의 독립성**:
   - Converter가 Schema 없이도 동작 가능 (기본 규칙 사용)
   - Schema의 노드 타입 이름만 참조 (느슨한 결합)

4. **확장성**:
   - 새로운 변환 형식 추가가 쉬움 (Markdown, RTF 등)
   - Schema 변경 없이 Converter만 확장 가능
   - Extension에서 커스텀 변환 규칙 등록 가능

5. **재사용성**:
   - Converter를 다른 프로젝트에서도 사용 가능
   - Schema와 독립적으로 Converter만 사용 가능

6. **테스트 용이성**:
   - Converter만 독립적으로 테스트 가능
   - Schema 없이도 Converter 테스트 가능

---

## Converter API

### 타입 정의

```typescript
type Format = 
  | 'html'           // HTML 마크업
  | 'text'           // Plain text
  | 'markdown'        // Markdown
  | 'json'           // JSON (모델 구조)
  | 'rtf'            // Rich Text Format (Microsoft Word 등)
  | 'latex'          // LaTeX (학술 문서)
  | 'asciidoc'       // AsciiDoc (기술 문서)
  | 'rst'            // ReStructuredText (Python 문서화)
  | 'bbcode'         // BBCode (포럼 등)
  | 'xml'            // XML
  | 'yaml'           // YAML
  | 'notion'         // Notion Block Format
  | 'slack'          // Slack Block Kit
  | 'googledocs';    // Google Docs Format

interface ParserRule {
  // DOM 기반 파싱 (HTML, XML)
  parseDOM?: ParseDOMRule[];  // HTML/XML DOM 요소 매칭 규칙
  
  // 단순 텍스트 파싱 (제한적 사용)
  parseText?: (text: string) => INode | null;
  
  priority?: number;
}

/**
 * 전체 문서 파서 인터페이스
 * (Markdown, LaTeX, AsciiDoc 등은 전체 문서 파싱 필요)
 */
interface DocumentParser {
  /**
   * 전체 문서를 파싱하여 모델 노드 배열로 변환
   * 
   * @param document 전체 문서 문자열
   * @param toConverter AST → Model 변환 함수 (재귀적 변환용)
   * @returns 모델 노드 배열
   */
  parse(document: string, toConverter: (astNode: any) => INode | null): INode[];
}

/**
 * AST → Model 변환 규칙
 * (전체 문서 파서가 AST를 생성한 후, 각 노드 타입별로 변환)
 */
interface ASTToModelRule {
  /**
   * AST 노드를 모델 노드로 변환
   * 
   * ⚠️ 중요: AST 타입 체크는 이 함수 내부에서 수행합니다.
   * 외부 파서의 AST 구조를 모르기 때문에, 여러 AST 타입을 체크할 수 있습니다.
   * 
   * @param astNode 파서가 생성한 AST 노드
   * @param toConverter 재귀적 변환 함수 (자식 노드 변환용)
   * @returns 모델 노드 또는 null (변환 불가)
   */
  convert(astNode: any, toConverter: (astNode: any) => INode | null): INode | null;
  
  priority?: number;
}

interface ConverterRule {
  /**
   * 모델 노드를 외부 형식으로 변환
   * format은 defineConverter의 두 번째 인자로 이미 지정되어 있으므로,
   * convert 함수는 해당 format으로 변환하는 로직만 구현하면 됩니다.
   */
  convert: (node: INode) => string | any;
  
  priority?: number;
}
```

### 핵심 API 함수

```typescript
/**
 * 외부 형식을 모델로 파싱하는 규칙을 정의합니다.
 * 
 * @param stype 노드 타입 이름
 * @param format 형식 ('html', 'text', 'markdown' 등)
 * @param rule 파서 규칙
 */
export function defineParser(
  stype: string, 
  format: Format, 
  rule: ParserRule
): void;

/**
 * 전체 문서 파서를 등록합니다.
 * (Markdown, LaTeX, AsciiDoc 등 전체 문서 파싱이 필요한 형식)
 * 
 * @param format 형식 ('markdown', 'latex', 'asciidoc' 등)
 * @param parser 전체 문서 파서
 */
export function defineDocumentParser(
  format: Format,
  parser: DocumentParser
): void;

/**
 * AST → Model 변환 규칙을 정의합니다.
 * (전체 문서 파서가 생성한 AST 노드를 모델 노드로 변환)
 * 
 * ⚠️ 중요: 첫 번째 인자는 **모델의 stype**을 명시합니다.
 * AST 타입은 외부 파서에 따라 다르므로, convert 함수 내부에서 체크합니다.
 * 
 * @param stype 모델 노드 타입 (변환 결과의 stype)
 * @param format 형식 ('markdown', 'latex' 등)
 * @param rule AST → Model 변환 규칙
 */
export function defineASTConverter(
  stype: string,  // 모델의 stype (변환 결과)
  format: Format,
  rule: ASTToModelRule
): void;

/**
 * 모델을 외부 형식으로 변환하는 규칙을 정의합니다.
 * 
 * @param stype 노드 타입 이름
 * @param format 형식 ('html', 'text', 'markdown' 등)
 * @param rule 변환 규칙
 * 
 * @example
 * // HTML 변환 규칙
 * defineConverter('paragraph', 'html', {
 *   convert: (node) => `<p>${node.text || ''}</p>`
 * });
 * 
 * // LaTeX 변환 규칙
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

## 변환 프로세스 구조

변환은 **3단계**로 구성됩니다:

### 1단계: 외부 파서 사용 (Parser)

**목적**: 외부 형식(HTML, Markdown, LaTeX 등)을 AST로 변환

**특징**:
- **외부 라이브러리 사용**: DOMParser, markdown-it, LaTeX parser 등
- 우리가 직접 구현하지 않음
- 각 형식마다 적절한 외부 파서 선택

**예시**:
```typescript
// HTML: 브라우저 내장 DOMParser 사용
const parser = new DOMParser();
const doc = parser.parseFromString(html, 'text/html');

// Markdown: markdown-it 사용
import MarkdownIt from 'markdown-it';
const md = new MarkdownIt();
const ast = md.parse(markdown);

// LaTeX: LaTeX parser 사용
import { parse } from 'latex-parser';
const ast = parse(latex);
```

### 2단계: AST → Node 변환 (AST Converter)

**목적**: 외부 파서가 생성한 AST를 우리 모델의 Node로 변환

**특징**:
- **규칙 기반 변환**: `defineASTConverter`로 모델 노드 타입별 변환 규칙 정의
- **⚠️ 중요**: 첫 번째 인자는 **모델의 stype**을 명시합니다
- AST 타입은 외부 파서에 따라 다르므로, `convert` 함수 내부에서 체크
- `toConverter` 함수를 통해 재귀적으로 자식 노드 변환 가능

**예시**:
```typescript
// 모델 heading으로 변환하는 규칙
defineASTConverter('heading', 'markdown', {
  convert(astNode: any, toConverter: (astNode: any) => INode | null): INode | null {
    // markdown-it의 경우: 'heading_open' 타입 체크
    if (astNode.type === 'heading_open') {
      const level = parseInt(astNode.tag.slice(1)); // h1 -> 1
      return {
        stype: 'heading',
        attributes: { level },
        content: astNode.children?.map((child: any) => toConverter(child)) || []
      };
    }
    
    // 다른 markdown 파서의 경우: 'heading' 타입 체크
    if (astNode.type === 'heading') {
      return {
        stype: 'heading',
        attributes: { level: astNode.depth },
        content: astNode.children?.map((child: any) => toConverter(child)) || []
      };
    }
    
    return null; // 변환 불가
  },
  priority: 100
});
```

**동작 방식**:
1. 전체 문서 파서가 AST를 생성
2. 각 AST 노드에 대해 모든 `defineASTConverter` 규칙을 시도
3. `convert` 함수가 AST 타입을 체크하고, 매칭되면 모델 노드 반환
4. `toConverter`를 통해 자식 노드를 재귀적으로 변환

### 3단계: Node → Format 변환 (Converter)

**목적**: 모델 Node를 특정 형식의 문법으로 변환

**특징**:
- **규칙 기반 변환**: `defineConverter`로 노드 타입별 변환 규칙 정의
- 모든 형식에서 동일한 패턴 사용
- 노드의 속성과 내용을 형식별 문법으로 변환
- **⚠️ 중요**: `convert` 메서드 이름 사용 (format은 이미 `defineConverter`의 인자로 지정됨)

**예시**:
```typescript
// 모델 heading을 Markdown 문법으로 변환
defineConverter('heading', 'markdown', {
  convert: (node: INode) => {
    const level = node.attributes?.level || 1;
    const text = node.text || '';
    return `${'#'.repeat(level)} ${text}\n`;
  }
});

// 모델 heading을 HTML 문법으로 변환
defineConverter('heading', 'html', {
  convert: (node: INode) => {
    const level = node.attributes?.level || 1;
    const text = node.text || '';
    return `<h${level}>${text}</h${level}>`;
  }
});

// 모델 heading을 LaTeX 문법으로 변환
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

## 전체 흐름 예시

### Markdown → Model → HTML 변환

```typescript
// 1단계: 외부 파서 사용 (markdown-it)
import MarkdownIt from 'markdown-it';
const md = new MarkdownIt();
const ast = md.parse('# Hello World');

// 2단계: AST → Node 변환 (defineASTConverter 규칙 사용)
const nodes = convertASTToModel(ast, 'markdown');
// 결과: [{ stype: 'heading', attributes: { level: 1 }, text: 'Hello World' }]

// 3단계: Node → HTML 변환 (defineConverter 규칙 사용)
const html = convertNodesToFormat(nodes, 'html');
// 결과: '<h1>Hello World</h1>'
```

### HTML → Model → Markdown 변환

```typescript
// 1단계: 외부 파서 사용 (DOMParser)
const parser = new DOMParser();
const doc = parser.parseFromString('<h1>Hello World</h1>', 'text/html');

// 2단계: AST → Node 변환 (defineASTConverter 규칙 사용)
const nodes = convertDOMToModel(doc.body, 'html');
// 결과: [{ stype: 'heading', attributes: { level: 1 }, text: 'Hello World' }]

// 3단계: Node → Markdown 변환 (defineConverter 규칙 사용)
const markdown = convertNodesToFormat(nodes, 'markdown');
// 결과: '# Hello World\n'
```

---

## 중요 사항

### 1. `sid` 필드에 대해

**변환 규칙에서 반환하는 `INode` 객체에는 `sid`를 포함하지 않아도 됩니다.**

- `sid`는 DataStore가 자동 생성: `dataStore.deserializeNodes()` 또는 `dataStore.createNode()` 호출 시 자동으로 `sid`가 할당됩니다
- 변환 규칙은 순수 데이터만 반환: `stype`, `attributes`, `content`, `text` 등만 포함하면 됩니다
- 변환 규칙은 `sid`를 사용하지 않음: `convert` 함수는 `sid`를 참조하지 않습니다

### 2. 노드 생성 방식

**순수 JS 객체 방식 권장**:

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

### 3. `convert` 메서드 이름

**`defineConverter`에서 이미 `format`이 지정되어 있으므로, 메서드 이름은 `convert`로 통일합니다.**

```typescript
// ✅ 올바른 방법
defineConverter('section', 'latex', {
  convert: (node: INode): string => {
    // LaTeX 변환 로직
  }
});

// ❌ 불필요: format이 이미 지정되어 있으므로 toLaTeX 같은 이름 불필요
defineConverter('section', 'latex', {
  toLaTeX: (node: INode): string => { /* ... */ }
});
```

---

## 참고 문서

- [LaTeX Converter 샘플 코드](./converter-latex-sample.md) - 완전한 LaTeX 변환 예시
- [Copy/Paste/Cut 스펙](./copy-paste-cut-spec.md) - 클립보드 통합 예시
