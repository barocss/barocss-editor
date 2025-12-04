# Text Analysis Tests

이 디렉토리는 텍스트 변경 감지 및 분석 알고리즘을 테스트합니다.

## 테스트 파일들

### `smart-text-analyzer.test.ts`
- Smart Text Analyzer의 핵심 알고리즘 테스트
- LCP/LCS 기반 텍스트 변경 감지
- Selection Bias 적용 검증
- 변경 타입 분류 (insert, delete, replace)
- 신뢰도(confidence) 계산 테스트

### `basic-text-analysis.test.ts`
- 기본적인 텍스트 변경 시나리오 테스트
- 단순 삽입, 삭제, 교체 케이스
- 기본 알고리즘 동작 검증

### `unicode-text-analysis.test.ts`
- 유니코드 및 복합 문자 처리 테스트
- 이모지, CJK 문자, RTL 텍스트 처리
- 정규화(normalization) 테스트
- 복합 문자 경계 감지

## 핵심 개념

### TextChange 구조
```typescript
interface TextChange {
  type: 'insert' | 'delete' | 'replace';
  start: number;
  end: number;
  text: string;
  confidence: number;
}
```

### 알고리즘 특징
- **LCP/LCS**: Longest Common Prefix/Suffix 기반 효율적 비교
- **Selection Bias**: 커서 위치를 고려한 변경점 추정
- **Unicode Safe**: 복합 문자 및 서로게이트 페어 안전 처리

## 실행 방법

```bash
# 모든 텍스트 분석 테스트 실행
pnpm test test/text-analysis

# 특정 테스트 파일 실행
pnpm test test/text-analysis/smart-text-analyzer.test.ts
```
