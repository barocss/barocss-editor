import type { Format, ParserRule, ConverterRule, ASTToModelRule, DocumentParser } from './types';
import { GlobalConverterRegistry } from './registry';

const registry = GlobalConverterRegistry.getInstance();

/**
 * 외부 형식을 모델로 파싱하는 규칙을 정의합니다.
 * 
 * @param stype 노드 타입 이름
 * @param format 형식 ('html', 'text', 'markdown' 등)
 * @param rule 파서 규칙
 * 
 * @example
 * ```typescript
 * defineParser('paragraph', 'html', {
 *   parseDOM: [
 *     { tag: 'p' }
 *   ]
 * });
 * ```
 */
export function defineParser(
  stype: string,
  format: Format,
  rule: ParserRule
): void {
  registry.registerParser(stype, format, rule);
}

/**
 * 전체 문서 파서를 등록합니다.
 * (Markdown, LaTeX, AsciiDoc 등 전체 문서 파싱이 필요한 형식)
 * 
 * @param format 형식 ('markdown', 'latex', 'asciidoc' 등)
 * @param parser 전체 문서 파서
 * 
 * @example
 * ```typescript
 * defineDocumentParser('markdown', {
 *   parse(document: string) {
 *     // markdown-it 등 외부 파서 사용
 *     const md = new MarkdownIt();
 *     return md.parse(document);
 *   }
 * });
 * ```
 */
export function defineDocumentParser(
  format: Format,
  parser: DocumentParser
): void {
  registry.registerDocumentParser(format, parser);
}

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
 * 
 * @example
 * ```typescript
 * defineASTConverter('heading', 'markdown', {
 *   convert(astNode, toConverter) {
 *     if (astNode.type !== 'heading_open') return null;
 *     return {
 *       stype: 'heading',
 *       attributes: { level: astNode.level },
 *       content: astNode.children.map(toConverter).filter(Boolean)
 *     };
 *   }
 * });
 * ```
 */
export function defineASTConverter(
  stype: string,
  format: Format,
  rule: ASTToModelRule
): void {
  registry.registerASTConverter(stype, format, rule);
}

/**
 * 모델을 외부 형식으로 변환하는 규칙을 정의합니다.
 * 
 * @param stype 노드 타입 이름
 * @param format 형식 ('html', 'text', 'markdown' 등)
 * @param rule 변환 규칙
 * 
 * @example
 * ```typescript
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
 * ```
 */
export function defineConverter(
  stype: string,
  format: Format,
  rule: ConverterRule
): void {
  registry.registerConverter(stype, format, rule);
}

