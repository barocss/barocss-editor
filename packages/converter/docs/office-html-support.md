# Microsoft Office HTML Support

Provides functionality to convert HTML copied from MS Word, PowerPoint, Excel, etc. into our model.

## Overview

Microsoft Office products generate special HTML formats when copying/pasting:
- `mso-*` style attributes (e.g., `mso-style-name`, `mso-margin-top-alt`)
- Office-specific tags (e.g., `<o:p>`, `<o:smarttag>`)
- Office class names (e.g., `MsoHeading1`, `MsoNormal`)
- VML (Vector Markup Language) elements
- Complex table structures

We clean these Office-specific formats, convert them to standard HTML, then parse into our model.

## Usage

### 1. Clean Office HTML

```typescript
import { cleanOfficeHTML } from '@barocss/converter';

const officeHTML = `
  <p class="MsoHeading1" mso-style-name="Heading1">Title</p>
  <o:p>Office paragraph text</o:p>
`;

const cleaned = cleanOfficeHTML(officeHTML);
// Result: <p>Title</p><p>Office paragraph text</p>
```

### 2. Parse Office HTML

```typescript
import { HTMLConverter, registerDefaultHTMLRules, registerOfficeHTMLRules } from '@barocss/converter';

// Register rules
registerDefaultHTMLRules();
registerOfficeHTMLRules();

// Create Converter instance
const converter = new HTMLConverter();

// Parse Office HTML
const officeHTML = '<p class="MsoHeading1">Title</p><o:p>Content</o:p>';
const cleaned = cleanOfficeHTML(officeHTML);
const nodes = converter.parse(cleaned);
```

### 3. Integrated Usage (in Extension)

```typescript
import { HTMLConverter, cleanOfficeHTML, registerDefaultHTMLRules, registerOfficeHTMLRules } from '@barocss/converter';

// Extension's paste handler
async function handlePaste(event: ClipboardEvent) {
  const html = event.clipboardData?.getData('text/html');
  if (!html) return;
  
  // Clean Office HTML
  const cleaned = cleanOfficeHTML(html);
  
  // Convert to model
  const converter = new HTMLConverter();
  const nodes = converter.parse(cleaned);
  
  // Insert into DataStore
  // ...
}
```

## Supported Office Features

### 1. Office Paragraph (`o:p`)

```html
<!-- Office HTML -->
<o:p>Office paragraph text</o:p>

<!-- After cleaning -->
<p>Office paragraph text</p>
```

### 2. Office Heading

#### MsoHeading Class
```html
<!-- Office HTML -->
<p class="MsoHeading1">Main Title</p>
<p class="MsoHeading2">Subtitle</p>

<!-- After cleaning -->
<p>Main Title</p>  <!-- parsed as heading -->
<p>Subtitle</p>    <!-- parsed as heading -->
```

#### mso-style-name Style
```html
<!-- Office HTML -->
<p style="mso-style-name:Heading1">Title</p>

<!-- After cleaning -->
<p>Title</p>  <!-- parsed as heading -->
```

### 3. Office Formatting

```html
<!-- Office HTML -->
<b>Bold</b> <i>Italic</i> <u>Underline</u>

<!-- After cleaning -->
<strong>Bold</strong> <em>Italic</em> <span>Underline</span>
```

### 4. Office Table

```html
<!-- Office HTML -->
<table border="1" cellpadding="0" cellspacing="0" style="mso-table-lspace:0;">
  <tr>
    <td width="100" style="mso-width-source:userset;">Cell</td>
  </tr>
</table>

<!-- After cleaning -->
<table>
  <tr>
    <td>Cell</td>
  </tr>
</table>
```

## OfficeHTMLCleaner Class

### Main Features

1. **Remove Office Attributes**
   - Remove `mso-*` attributes
   - Remove `o:*` attributes
   - Remove `v:*` attributes
   - Remove `xml:*` attributes
   - Remove `w:*` attributes

2. **Clean Office Styles**
   - Remove `mso-*` styles from inline styles
   - Preserve regular CSS styles

3. **Convert/Remove Office Elements**
   - `<o:p>` → `<p>` conversion
   - Remove `<o:smarttag>`
   - Remove `<v:shape>`, `<v:shapetype>`
   - Remove `<w:worddocument>`

4. **Normalize Formatting**
   - `<b>` → `<strong>`
   - `<i>` → `<em>`
   - `<u>` → `<span>` (remove underline)
   - `<font>` → `<span>`

5. **Clean Tables**
   - Remove Office table attributes
   - Remove unnecessary cell attributes

## Office HTML Parser Rules

### Registered Rules

1. **Paragraph**
   - `<p>` tag
   - `<o:p>` tag (Office paragraph)
   - `<div>` tag (when Office-specific class/style is present)

2. **Heading**
   - `<h1>` ~ `<h6>` tags
   - `<p>` tag (with MsoHeading class or mso-style-name style)

3. **Inline Text**
   - `<span>` tag
   - `<a>` tag
   - Office-specific span handling

## Real Usage Examples

### Word Document

```typescript
// HTML copied from Word
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

### PowerPoint Slide

```typescript
// HTML copied from PowerPoint
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

### Excel Table

```typescript
// HTML copied from Excel
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
// Tables are not currently converted to model nodes by the default parser, but cleaning is done
```

## Limitations

1. **Tables**: The current default HTML parser does not convert tables to model nodes. To support tables, you need to add a separate table node type and parser rules.

2. **Complex Office Features**: 
   - VML graphic elements are removed
   - Office Smart Tags are removed
   - Office comments/track changes are removed

3. **Style Preservation**: Complex Office styling (colors, fonts, spacing, etc.) is not preserved. Only text content and basic formatting (bold, italic) are preserved.

## Future Improvements

1. **Table Support**: Add table node type and implement parser rules
2. **Image Support**: Handle Office images
3. **List Support**: Handle Office list structures
4. **Style Preservation**: Preserve style information where possible (store as metadata)
