import type { INode } from '@barocss/datastore';

/**
 * 지원하는 문서 형식
 */
export type Format =
  | 'html'           // HTML 마크업
  | 'text'           // Plain text
  | 'markdown'       // Markdown
  | 'markdown-gfm'   // GitHub Flavored Markdown
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

/**
 * DOM 기반 파싱 규칙 (HTML, XML)
 */
export interface ParseDOMRule {
  /**
   * 매칭할 태그 이름
   */
  tag?: string;
  
  /**
   * 매칭할 속성 (key-value 쌍)
   */
  attrs?: Record<string, string | null>;
  
  /**
   * 우선순위 (높을수록 먼저 매칭)
   */
  priority?: number;
  
  /**
   * 매칭 여부를 결정하는 커스텀 함수
   */
  getAttrs?: (node: HTMLElement | Element) => Record<string, any> | null | false;
}

/**
 * 파서 규칙
 */
export interface ParserRule {
  /**
   * DOM 기반 파싱 규칙 (HTML, XML)
   */
  parseDOM?: ParseDOMRule[];
  
  /**
   * 단순 텍스트 파싱 (제한적 사용)
   */
  parseText?: (text: string) => INode | null;
  
  /**
   * 우선순위 (높을수록 먼저 매칭)
   */
  priority?: number;
}

/**
 * 전체 문서 파서 인터페이스
 * (Markdown, LaTeX, AsciiDoc 등은 전체 문서 파싱 필요)
 */
export interface DocumentParser {
  /**
   * 전체 문서를 파싱하여 AST로 변환
   * 
   * @param document 전체 문서 문자열
   * @returns AST 노드 배열
   */
  parse(document: string): any[];
}

/**
 * AST → Model 변환 규칙
 * (전체 문서 파서가 AST를 생성한 후, 각 노드 타입별로 변환)
 */
export interface ASTToModelRule {
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
  
  /**
   * 우선순위 (높을수록 먼저 매칭)
   */
  priority?: number;
}

/**
 * 모델 → 외부 형식 변환 규칙
 */
export interface ConverterRule {
  /**
   * 모델 노드를 외부 형식으로 변환
   * format은 defineConverter의 두 번째 인자로 이미 지정되어 있으므로,
   * convert 함수는 해당 format으로 변환하는 로직만 구현하면 됩니다.
   * 
   * @param node 모델 노드
   * @returns 변환된 문자열 또는 객체
   */
  convert: (node: INode) => string | any;
  
  /**
   * 우선순위 (높을수록 먼저 매칭)
   */
  priority?: number;
}

