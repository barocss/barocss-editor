import type { Format, ParserRule, ConverterRule, ASTToModelRule, DocumentParser } from './types';

/**
 * 전역 Converter Registry
 * 모든 변환 규칙을 중앙에서 관리합니다.
 */
export class GlobalConverterRegistry {
  private static _instance: GlobalConverterRegistry;
  
  // stype -> format -> ParserRule[]
  private _parserRules: Map<string, Map<Format, ParserRule[]>> = new Map();
  
  // stype -> format -> ConverterRule[]
  private _converterRules: Map<string, Map<Format, ConverterRule[]>> = new Map();
  
  // format -> ASTToModelRule[]
  private _astConverterRules: Map<Format, Map<string, ASTToModelRule[]>> = new Map();
  
  // format -> DocumentParser
  private _documentParsers: Map<Format, DocumentParser> = new Map();
  
  private constructor() {}
  
  static getInstance(): GlobalConverterRegistry {
    if (!GlobalConverterRegistry._instance) {
      GlobalConverterRegistry._instance = new GlobalConverterRegistry();
    }
    return GlobalConverterRegistry._instance;
  }
  
  /**
   * 파서 규칙 등록
   */
  registerParser(stype: string, format: Format, rule: ParserRule): void {
    if (!this._parserRules.has(stype)) {
      this._parserRules.set(stype, new Map());
    }
    const formatMap = this._parserRules.get(stype)!;
    if (!formatMap.has(format)) {
      formatMap.set(format, []);
    }
    const rules = formatMap.get(format)!;
    rules.push(rule);
    // 우선순위 순으로 정렬 (높은 우선순위가 먼저)
    rules.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }
  
  /**
   * 변환 규칙 등록
   */
  registerConverter(stype: string, format: Format, rule: ConverterRule): void {
    if (!this._converterRules.has(stype)) {
      this._converterRules.set(stype, new Map());
    }
    const formatMap = this._converterRules.get(stype)!;
    if (!formatMap.has(format)) {
      formatMap.set(format, []);
    }
    const rules = formatMap.get(format)!;
    rules.push(rule);
    // 우선순위 순으로 정렬 (높은 우선순위가 먼저)
    rules.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }
  
  /**
   * AST 변환 규칙 등록
   */
  registerASTConverter(stype: string, format: Format, rule: ASTToModelRule): void {
    if (!this._astConverterRules.has(format)) {
      this._astConverterRules.set(format, new Map());
    }
    const stypeMap = this._astConverterRules.get(format)!;
    if (!stypeMap.has(stype)) {
      stypeMap.set(stype, []);
    }
    const rules = stypeMap.get(stype)!;
    rules.push(rule);
    // 우선순위 순으로 정렬 (높은 우선순위가 먼저)
    rules.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }
  
  /**
   * 전체 문서 파서 등록
   */
  registerDocumentParser(format: Format, parser: DocumentParser): void {
    this._documentParsers.set(format, parser);
  }
  
  /**
   * 파서 규칙 조회
   */
  getParserRules(stype: string, format: Format): ParserRule[] {
    return this._parserRules.get(stype)?.get(format) || [];
  }
  
  /**
   * 변환 규칙 조회
   */
  getConverterRules(stype: string, format: Format): ConverterRule[] {
    return this._converterRules.get(stype)?.get(format) || [];
  }
  
  /**
   * AST 변환 규칙 조회
   */
  getASTConverterRules(stype: string, format: Format): ASTToModelRule[] {
    return this._astConverterRules.get(format)?.get(stype) || [];
  }
  
  /**
   * 전체 문서 파서 조회
   */
  getDocumentParser(format: Format): DocumentParser | undefined {
    return this._documentParsers.get(format);
  }
  
  /**
   * 모든 규칙 초기화 (테스트용)
   */
  clear(): void {
    this._parserRules.clear();
    this._converterRules.clear();
    this._astConverterRules.clear();
    this._documentParsers.clear();
  }
}

