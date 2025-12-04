# Microsoft Office HTML 지원

MS Word, PowerPoint, Excel 등에서 복사한 HTML을 우리 모델로 변환하는 기능을 제공합니다.

## 개요

Microsoft Office 제품들은 복사/붙여넣기 시 특수한 HTML 형식을 생성합니다:
- `mso-*` 스타일 속성 (예: `mso-style-name`, `mso-margin-top-alt`)
- Office 전용 태그 (예: `<o:p>`, `<o:smarttag>`)
- Office 클래스명 (예: `MsoHeading1`, `MsoNormal`)
- VML (Vector Markup Language) 요소
- 복잡한 테이블 구조

이러한 Office 특수 포맷을 정리하고 일반 HTML로 변환한 후, 우리 모델로 파싱합니다.

## 사용 방법

### 1. Office HTML 정리

```typescript
import { cleanOfficeHTML } from '@barocss/converter';

const officeHTML = `
  <p class="MsoHeading1" mso-style-name="Heading1">Title</p>
  <o:p>Office paragraph text</o:p>
`;

const cleaned = cleanOfficeHTML(officeHTML);
// 결과: <p>Title</p><p>Office paragraph text</p>
```

### 2. Office HTML 파싱

```typescript
import { HTMLConverter, registerDefaultHTMLRules, registerOfficeHTMLRules } from '@barocss/converter';

// 규칙 등록
registerDefaultHTMLRules();
registerOfficeHTMLRules();

// Converter 인스턴스 생성
const converter = new HTMLConverter();

// Office HTML 파싱
const officeHTML = '<p class="MsoHeading1">Title</p><o:p>Content</o:p>';
const cleaned = cleanOfficeHTML(officeHTML);
const nodes = converter.parse(cleaned);
```

### 3. 통합 사용 (Extension에서)

```typescript
import { HTMLConverter, cleanOfficeHTML, registerDefaultHTMLRules, registerOfficeHTMLRules } from '@barocss/converter';

// Extension의 paste 핸들러
async function handlePaste(event: ClipboardEvent) {
  const html = event.clipboardData?.getData('text/html');
  if (!html) return;
  
  // Office HTML 정리
  const cleaned = cleanOfficeHTML(html);
  
  // 모델로 변환
  const converter = new HTMLConverter();
  const nodes = converter.parse(cleaned);
  
  // DataStore에 삽입
  // ...
}
```

## 지원하는 Office 기능

### 1. Office Paragraph (`o:p`)

```html
<!-- Office HTML -->
<o:p>Office paragraph text</o:p>

<!-- 정리 후 -->
<p>Office paragraph text</p>
```

### 2. Office Heading

#### MsoHeading 클래스
```html
<!-- Office HTML -->
<p class="MsoHeading1">Main Title</p>
<p class="MsoHeading2">Subtitle</p>

<!-- 정리 후 -->
<p>Main Title</p>  <!-- heading으로 파싱됨 -->
<p>Subtitle</p>    <!-- heading으로 파싱됨 -->
```

#### mso-style-name 스타일
```html
<!-- Office HTML -->
<p style="mso-style-name:Heading1">Title</p>

<!-- 정리 후 -->
<p>Title</p>  <!-- heading으로 파싱됨 -->
```

### 3. Office 포맷팅

```html
<!-- Office HTML -->
<b>Bold</b> <i>Italic</i> <u>Underline</u>

<!-- 정리 후 -->
<strong>Bold</strong> <em>Italic</em> <span>Underline</span>
```

### 4. Office 테이블

```html
<!-- Office HTML -->
<table border="1" cellpadding="0" cellspacing="0" style="mso-table-lspace:0;">
  <tr>
    <td width="100" style="mso-width-source:userset;">Cell</td>
  </tr>
</table>

<!-- 정리 후 -->
<table>
  <tr>
    <td>Cell</td>
  </tr>
</table>
```

## OfficeHTMLCleaner 클래스

### 주요 기능

1. **Office 속성 제거**
   - `mso-*` 속성 제거
   - `o:*` 속성 제거
   - `v:*` 속성 제거
   - `xml:*` 속성 제거
   - `w:*` 속성 제거

2. **Office 스타일 정리**
   - 인라인 스타일에서 `mso-*` 스타일 제거
   - 일반 CSS 스타일은 유지

3. **Office 요소 변환/제거**
   - `<o:p>` → `<p>` 변환
   - `<o:smarttag>` 제거
   - `<v:shape>`, `<v:shapetype>` 제거
   - `<w:worddocument>` 제거

4. **포맷팅 정규화**
   - `<b>` → `<strong>`
   - `<i>` → `<em>`
   - `<u>` → `<span>` (밑줄 제거)
   - `<font>` → `<span>`

5. **테이블 정리**
   - Office 테이블 속성 제거
   - 셀의 불필요한 속성 제거

## Office HTML 파서 규칙

### 등록된 규칙

1. **Paragraph**
   - `<p>` 태그
   - `<o:p>` 태그 (Office paragraph)
   - `<div>` 태그 (Office 특정 클래스/스타일이 있는 경우)

2. **Heading**
   - `<h1>` ~ `<h6>` 태그
   - `<p>` 태그 (MsoHeading 클래스 또는 mso-style-name 스타일)

3. **Inline Text**
   - `<span>` 태그
   - `<a>` 태그
   - Office 특수 span 처리

## 실제 사용 예시

### Word 문서

```typescript
// Word에서 복사한 HTML
const wordHTML = `
  <html xmlns:o="urn:schemas-microsoft-com:office:office">
    <head><meta charset="utf-8"></head>
    <body>
      <p class="MsoHeading1">Document Title</p>
      <p class="MsoNormal">This is a normal paragraph.</p>
      <p class="MsoNormal"><b>Bold text</b> and <i>italic text</i>.</p>
    </body>
  </html>
`;

const cleaned = cleanOfficeHTML(wordHTML);
const nodes = converter.parse(cleaned);
```

### PowerPoint 슬라이드

```typescript
// PowerPoint에서 복사한 HTML
const pptHTML = `
  <div>
    <p style="mso-style-name:Title;">Slide Title</p>
    <p style="mso-style-name:Subtitle;">Subtitle text</p>
    <p>Bullet point 1</p>
    <p>Bullet point 2</p>
  </div>
`;

const cleaned = cleanOfficeHTML(pptHTML);
const nodes = converter.parse(cleaned);
```

### Excel 테이블

```typescript
// Excel에서 복사한 HTML
const excelHTML = `
  <table border="1" style="mso-table-lspace:0;">
    <tr>
      <td style="mso-width-source:userset; width:100px;">A1</td>
      <td>B1</td>
    </tr>
    <tr>
      <td>A2</td>
      <td>B2</td>
    </tr>
  </table>
`;

const cleaned = cleanOfficeHTML(excelHTML);
// 테이블은 현재 기본 파서에서 처리하지 않지만, 정리는 됨
```

## 제한 사항

1. **테이블**: 현재 기본 HTML 파서에서 테이블을 모델 노드로 변환하지 않습니다. 테이블 지원이 필요하면 별도의 테이블 노드 타입과 파서 규칙을 추가해야 합니다.

2. **복잡한 Office 기능**: 
   - VML 그래픽 요소는 제거됩니다
   - Office Smart Tags는 제거됩니다
   - Office 주석/추적 변경사항은 제거됩니다

3. **스타일 보존**: Office의 복잡한 스타일링(색상, 폰트, 간격 등)은 보존되지 않습니다. 텍스트 내용과 기본 포맷팅(bold, italic)만 보존됩니다.

## 향후 개선 사항

1. **테이블 지원**: 테이블 노드 타입 추가 및 파서 규칙 구현
2. **이미지 지원**: Office 이미지 처리
3. **리스트 지원**: Office 리스트 구조 처리
4. **스타일 보존**: 가능한 범위에서 스타일 정보 보존 (metadata로 저장)

