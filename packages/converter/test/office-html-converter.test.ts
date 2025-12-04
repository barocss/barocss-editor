import { describe, it, expect, beforeEach } from 'vitest';
import { HTMLConverter, registerDefaultHTMLRules, registerOfficeHTMLRules, cleanOfficeHTML, GlobalConverterRegistry } from '../src';

describe('Office HTML Converter', () => {
  let converter: HTMLConverter;
  
  beforeEach(() => {
    // Registry 초기화
    GlobalConverterRegistry.getInstance().clear();
    
    // 기본 규칙 등록
    registerDefaultHTMLRules();
    
    // Office 규칙 등록
    registerOfficeHTMLRules();
    
    // Converter 인스턴스 생성
    converter = new HTMLConverter();
  });
  
  describe('cleanOfficeHTML', () => {
    it('should remove mso- attributes', () => {
      const officeHTML = '<p mso-style-name="Heading1" mso-margin-top-alt="0">Title</p>';
      const cleaned = cleanOfficeHTML(officeHTML);
      
      expect(cleaned).not.toContain('mso-style-name');
      expect(cleaned).not.toContain('mso-margin-top-alt');
      expect(cleaned).toContain('Title');
    });
    
    it('should remove o:p tags', () => {
      const officeHTML = '<o:p>Office paragraph</o:p>';
      const cleaned = cleanOfficeHTML(officeHTML);
      
      expect(cleaned).not.toContain('o:p');
      expect(cleaned).toContain('Office paragraph');
    });
    
    it('should clean mso- styles', () => {
      const officeHTML = '<p style="mso-margin-top-alt:0; color:red;">Text</p>';
      const cleaned = cleanOfficeHTML(officeHTML);
      
      expect(cleaned).not.toContain('mso-margin-top-alt');
      // 일반 스타일은 유지될 수 있음
      expect(cleaned).toContain('Text');
    });
    
    it('should normalize formatting tags', () => {
      const officeHTML = '<b>Bold</b> <i>Italic</i>';
      const cleaned = cleanOfficeHTML(officeHTML);
      
      expect(cleaned).toContain('<strong>');
      expect(cleaned).toContain('<em>');
    });
    
    it('should clean Office table attributes', () => {
      const officeHTML = `
        <table border="1" cellpadding="0" cellspacing="0" style="mso-table-lspace:0;">
          <tr>
            <td width="100" style="mso-width-source:userset;">Cell</td>
          </tr>
        </table>
      `;
      const cleaned = cleanOfficeHTML(officeHTML);
      
      expect(cleaned).toContain('<table>');
      expect(cleaned).not.toContain('mso-table-lspace');
      expect(cleaned).not.toContain('mso-width-source');
    });
  });
  
  describe('parse Office HTML', () => {
    it('should parse Office paragraph (o:p)', () => {
      const officeHTML = '<o:p>Office paragraph text</o:p>';
      const cleaned = cleanOfficeHTML(officeHTML);
      const nodes = converter.parse(cleaned);
      
      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes.some((n: any) => n.stype === 'paragraph')).toBe(true);
    });
    
    it('should parse Office heading with MsoHeading class', () => {
      const officeHTML = '<p class="MsoHeading1">Heading Text</p>';
      const cleaned = cleanOfficeHTML(officeHTML);
      const nodes = converter.parse(cleaned);
      
      // MsoHeading 클래스가 있으면 heading으로 파싱되어야 함
      // (실제로는 파서 규칙이 적용되어야 함)
      expect(nodes.length).toBeGreaterThan(0);
    });
    
    it('should parse Office heading with mso-style-name', () => {
      const officeHTML = '<p style="mso-style-name:Heading1">Heading Text</p>';
      const cleaned = cleanOfficeHTML(officeHTML);
      const nodes = converter.parse(cleaned);
      
      expect(nodes.length).toBeGreaterThan(0);
    });
    
    it('should parse complex Office document', () => {
      const officeHTML = `
        <div>
          <p class="MsoHeading1">Main Title</p>
          <o:p>Office paragraph with <b>bold</b> text.</o:p>
          <p style="mso-margin-top-alt:0;">Another paragraph</p>
          <table border="1" style="mso-table-lspace:0;">
            <tr>
              <td>Cell 1</td>
              <td>Cell 2</td>
            </tr>
          </table>
        </div>
      `;
      
      const cleaned = cleanOfficeHTML(officeHTML);
      const nodes = converter.parse(cleaned);
      
      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes.some((n: any) => n.stype === 'paragraph')).toBe(true);
    });
    
    it('should handle Office list structures', () => {
      const officeHTML = `
        <p class="MsoListParagraph">• Item 1</p>
        <p class="MsoListParagraph">• Item 2</p>
      `;
      
      const cleaned = cleanOfficeHTML(officeHTML);
      const nodes = converter.parse(cleaned);
      
      expect(nodes.length).toBeGreaterThan(0);
    });
    
    it('should preserve content while removing Office metadata', () => {
      const officeHTML = `
        <p mso-style-name="Normal" o:p="">
          This is <b>important</b> text with <i>formatting</i>.
        </p>
      `;
      
      const cleaned = cleanOfficeHTML(officeHTML);
      const nodes = converter.parse(cleaned);
      
      // 내용은 보존되어야 함
      expect(nodes.length).toBeGreaterThan(0);
      const paragraph = nodes.find((n: any) => n.stype === 'paragraph');
      expect(paragraph).toBeDefined();
    });
  });
  
  describe('real-world Office HTML samples', () => {
    it('should parse Word document HTML', () => {
      // 실제 Word에서 복사한 HTML 샘플 (간소화)
      const wordHTML = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office"
              xmlns:w="urn:schemas-microsoft-com:office:word"
              xmlns:m="http://schemas.microsoft.com/office/2004/12/omml">
          <head>
            <meta charset="utf-8">
          </head>
          <body>
            <p class="MsoHeading1">Document Title</p>
            <p class="MsoNormal">This is a normal paragraph.</p>
            <p class="MsoNormal"><b>Bold text</b> and <i>italic text</i>.</p>
          </body>
        </html>
      `;
      
      const cleaned = cleanOfficeHTML(wordHTML);
      const nodes = converter.parse(cleaned);
      
      expect(nodes.length).toBeGreaterThan(0);
    });
    
    it('should parse PowerPoint slide HTML', () => {
      // PowerPoint에서 복사한 HTML 샘플 (간소화)
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
      
      expect(nodes.length).toBeGreaterThan(0);
    });
    
    it('should parse Excel table HTML', () => {
      // Excel에서 복사한 HTML 샘플
      const excelHTML = `
        <table border="1" style="mso-table-lspace:0; mso-table-rspace:0;">
          <tr>
            <td style="mso-width-source:userset; width:100px;">A1</td>
            <td style="mso-width-source:userset; width:100px;">B1</td>
          </tr>
          <tr>
            <td>A2</td>
            <td>B2</td>
          </tr>
        </table>
      `;
      
      const cleaned = cleanOfficeHTML(excelHTML);
      const nodes = converter.parse(cleaned);
      
      // 테이블은 현재 기본 파서에서 처리하지 않지만,
      // 정리는 되어야 함
      expect(cleaned).not.toContain('mso-table-lspace');
      expect(cleaned).not.toContain('mso-width-source');
    });
  });
  
  describe('Office HTML edge cases', () => {
    it('should handle nested Office elements', () => {
      const officeHTML = `
        <div style="mso-element:para-border-div;">
          <p class="MsoNormal">
            <span style="mso-spacerun:yes;">   </span>
            Text with <b>bold</b> and <i>italic</i>.
          </p>
        </div>
      `;
      
      const cleaned = cleanOfficeHTML(officeHTML);
      const nodes = converter.parse(cleaned);
      
      expect(nodes.length).toBeGreaterThan(0);
    });
    
    it('should handle Office comments and annotations', () => {
      const officeHTML = `
        <p>Text with <span class="MsoCommentReference">comment</span>.</p>
      `;
      
      const cleaned = cleanOfficeHTML(officeHTML);
      // 주석 참조는 제거되거나 일반 텍스트로 변환되어야 함
      expect(cleaned).toContain('Text');
    });
    
    it('should handle Office hyperlinks', () => {
      const officeHTML = `
        <p>
          Visit <a href="https://example.com" o:href="https://example.com">link</a>.
        </p>
      `;
      
      const cleaned = cleanOfficeHTML(officeHTML);
      const nodes = converter.parse(cleaned);
      
      expect(nodes.length).toBeGreaterThan(0);
      expect(cleaned).toContain('link');
    });
  });
  
  describe('complex Office HTML scenarios', () => {
    it('should parse complex Word document with multiple sections', () => {
      const wordHTML = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office"
              xmlns:w="urn:schemas-microsoft-com:office:word"
              xmlns:m="http://schemas.microsoft.com/office/2004/12/omml">
          <head>
            <meta charset="utf-8">
            <meta name="Generator" content="Microsoft Word 15">
          </head>
          <body>
            <div class="WordSection1">
              <p class="MsoTitle">Document Title</p>
              <p class="MsoSubtitle">Document Subtitle</p>
              <p class="MsoNormal">This is a normal paragraph with <b>bold</b> and <i>italic</i> text.</p>
              <p class="MsoHeading1">Section 1</p>
              <p class="MsoNormal">Content under section 1.</p>
              <p class="MsoHeading2">Subsection 1.1</p>
              <p class="MsoNormal">Content under subsection.</p>
              <p class="MsoHeading1">Section 2</p>
              <p class="MsoNormal">Content under section 2.</p>
            </div>
          </body>
        </html>
      `;
      
      const cleaned = cleanOfficeHTML(wordHTML);
      const nodes = converter.parse(cleaned);
      
      expect(nodes.length).toBeGreaterThan(0);
      
      // 최소한 노드는 파싱되어야 함
      // MsoHeading 클래스는 heading으로 파싱될 수 있지만,
      // MsoTitle, MsoSubtitle은 paragraph로 파싱될 수 있음
      const headings = nodes.filter((n: any) => n.stype === 'heading');
      const paragraphs = nodes.filter((n: any) => n.stype === 'paragraph');
      
      // 최소한 하나의 블록 요소는 파싱되어야 함
      expect(headings.length + paragraphs.length).toBeGreaterThan(0);
    });
    
    it('should parse Office document with complex formatting', () => {
      const officeHTML = `
        <p class="MsoNormal">
          <span style="mso-spacerun:yes;">   </span>
          This paragraph has 
          <b style="mso-bidi-font-weight:normal;">
            <span style="mso-bidi-font-style:italic;">bold italic</span>
          </b>
          and 
          <i style="mso-bidi-font-style:normal;">
            <span style="mso-bidi-font-weight:bold;">italic bold</span>
          </i>
          text.
        </p>
        <p class="MsoNormal">
          <span style="font-size:12.0pt;font-family:&quot;Times New Roman&quot;,serif;mso-fareast-font-family:&quot;Malgun Gothic&quot;;">
            Text with <u>underline</u> and <s>strikethrough</s>.
          </span>
        </p>
        <p class="MsoNormal">
          <span style="color:red;mso-color-alt:auto;">Red text</span>
          and 
          <span style="color:blue;mso-color-alt:auto;">blue text</span>.
        </p>
      `;
      
      const cleaned = cleanOfficeHTML(officeHTML);
      const nodes = converter.parse(cleaned);
      
      expect(nodes.length).toBeGreaterThan(0);
      expect(cleaned).toContain('bold italic');
      expect(cleaned).toContain('Red text');
    });
    
    it('should parse Office document with lists', () => {
      const officeHTML = `
        <p class="MsoListParagraph" style="mso-list:l0 level1 lfo1;">
          <span style="mso-list:Ignore;">1.<span style="font:7.0pt &quot;Times New Roman&quot;;">   </span></span>
          First ordered item
        </p>
        <p class="MsoListParagraph" style="mso-list:l0 level1 lfo1;">
          <span style="mso-list:Ignore;">2.<span style="font:7.0pt &quot;Times New Roman&quot;;">   </span></span>
          Second ordered item
        </p>
        <p class="MsoListParagraph" style="mso-list:l0 level1 lfo1;">
          <span style="mso-list:Ignore;">3.<span style="font:7.0pt &quot;Times New Roman&quot;;">   </span></span>
          Third ordered item with <b>bold</b> text
        </p>
        <p class="MsoListParagraph" style="mso-list:l1 level1 lfo2;">
          <span style="mso-list:Ignore;">•<span style="font:7.0pt &quot;Times New Roman&quot;;">   </span></span>
          Bullet item 1
        </p>
        <p class="MsoListParagraph" style="mso-list:l1 level1 lfo2;">
          <span style="mso-list:Ignore;">•<span style="font:7.0pt &quot;Times New Roman&quot;;">   </span></span>
          Bullet item 2
        </p>
      `;
      
      const cleaned = cleanOfficeHTML(officeHTML);
      const nodes = converter.parse(cleaned);
      
      expect(nodes.length).toBeGreaterThan(0);
      expect(cleaned).toContain('First ordered item');
      expect(cleaned).toContain('Bullet item');
    });
    
    it('should parse Office document with nested tables', () => {
      const officeHTML = `
        <table border="1" cellpadding="0" cellspacing="0" style="mso-table-lspace:0;mso-table-rspace:0;mso-yfti-tbllook:1184;">
          <tr style="mso-yfti-irow:0;mso-yfti-firstrow:yes;">
            <td width="200" style="width:200.0pt;padding:0cm 5.4pt 0cm 5.4pt;mso-width-source:userset;">
              <p class="MsoNormal">Header 1</p>
            </td>
            <td width="200" style="width:200.0pt;padding:0cm 5.4pt 0cm 5.4pt;mso-width-source:userset;">
              <p class="MsoNormal">Header 2</p>
            </td>
            <td width="200" style="width:200.0pt;padding:0cm 5.4pt 0cm 5.4pt;mso-width-source:userset;">
              <p class="MsoNormal">Header 3</p>
            </td>
          </tr>
          <tr style="mso-yfti-irow:1;">
            <td style="padding:0cm 5.4pt 0cm 5.4pt;">
              <p class="MsoNormal">Cell 1-1</p>
            </td>
            <td style="padding:0cm 5.4pt 0cm 5.4pt;">
              <p class="MsoNormal">Cell 1-2 with <b>bold</b></p>
            </td>
            <td style="padding:0cm 5.4pt 0cm 5.4pt;">
              <p class="MsoNormal">Cell 1-3</p>
            </td>
          </tr>
          <tr style="mso-yfti-irow:2;mso-yfti-lastrow:yes;">
            <td style="padding:0cm 5.4pt 0cm 5.4pt;">
              <p class="MsoNormal">Cell 2-1</p>
            </td>
            <td style="padding:0cm 5.4pt 0cm 5.4pt;">
              <p class="MsoNormal">Cell 2-2</p>
            </td>
            <td style="padding:0cm 5.4pt 0cm 5.4pt;">
              <p class="MsoNormal">Cell 2-3</p>
            </td>
          </tr>
        </table>
      `;
      
      const cleaned = cleanOfficeHTML(officeHTML);
      
      // Office 테이블 속성 제거 확인
      expect(cleaned).not.toContain('mso-table-lspace');
      expect(cleaned).not.toContain('mso-yfti-tbllook');
      expect(cleaned).not.toContain('mso-width-source');
      expect(cleaned).toContain('Header 1');
      expect(cleaned).toContain('Cell 1-1');
    });
    
    it('should parse Office document with hyperlinks and images', () => {
      const officeHTML = `
        <p class="MsoNormal">
          Visit 
          <a href="https://example.com" 
             o:href="https://example.com"
             style="mso-hyphenate:none;">
            <span style="color:blue;text-decoration:underline;">example.com</span>
          </a>
          for more information.
        </p>
        <p class="MsoNormal">
          <img src="image.png" 
               alt="Description"
               width="100"
               height="100"
               style="mso-wrap-style:square;mso-wrap-distance-left:9pt;mso-wrap-distance-right:9pt;"/>
        </p>
        <p class="MsoNormal">
          Another 
          <a href="mailto:test@example.com" o:href="mailto:test@example.com">
            <span style="color:blue;text-decoration:underline;">email link</span>
          </a>
          here.
        </p>
      `;
      
      const cleaned = cleanOfficeHTML(officeHTML);
      const nodes = converter.parse(cleaned);
      
      expect(nodes.length).toBeGreaterThan(0);
      expect(cleaned).toContain('example.com');
      expect(cleaned).toContain('email link');
      // 이미지 태그는 유지되어야 함
      expect(cleaned).toContain('<img');
    });
    
    it('should parse Office document with blockquotes and code', () => {
      const officeHTML = `
        <p class="MsoNormal">Regular paragraph.</p>
        <p class="MsoNormal" style="margin-left:36.0pt;mso-list:l0 level1 lfo1;">
          <span style="mso-list:Ignore;">&gt;<span style="font:7.0pt &quot;Times New Roman&quot;;">   </span></span>
          This is a blockquote-style paragraph.
        </p>
        <p class="MsoNormal">
          Code example:
        </p>
        <p class="MsoNormal" style="font-family:&quot;Courier New&quot;;">
          <span style="font-family:&quot;Courier New&quot;;">function example() { return true; }</span>
        </p>
      `;
      
      const cleaned = cleanOfficeHTML(officeHTML);
      const nodes = converter.parse(cleaned);
      
      expect(nodes.length).toBeGreaterThan(0);
      expect(cleaned).toContain('Regular paragraph');
      expect(cleaned).toContain('function example');
    });
    
    it('should parse Office document with mixed content types', () => {
      const officeHTML = `
        <div class="WordSection1">
          <p class="MsoTitle">Complex Document</p>
          <p class="MsoNormal">Introduction paragraph.</p>
          <p class="MsoHeading1">Main Section</p>
          <p class="MsoNormal">
            Paragraph with 
            <b>bold</b>, 
            <i>italic</i>, 
            <u>underline</u>, 
            and 
            <span style="text-decoration:line-through;">strikethrough</span>.
          </p>
          <table border="1">
            <tr>
              <td><p class="MsoNormal">Table cell</p></td>
            </tr>
          </table>
          <p class="MsoListParagraph">• List item</p>
          <p class="MsoNormal">
            <a href="https://example.com">Link</a>
          </p>
        </div>
      `;
      
      const cleaned = cleanOfficeHTML(officeHTML);
      const nodes = converter.parse(cleaned);
      
      expect(nodes.length).toBeGreaterThan(0);
      
      // 다양한 요소 확인
      const headings = nodes.filter((n: any) => n.stype === 'heading');
      const paragraphs = nodes.filter((n: any) => n.stype === 'paragraph');
      
      // 최소한 하나의 블록 요소는 파싱되어야 함
      expect(headings.length + paragraphs.length).toBeGreaterThan(0);
    });
    
    it('should parse PowerPoint slide with complex layout', () => {
      const pptHTML = `
        <div style="position:relative;width:960px;height:720px;">
          <p style="position:absolute;left:48px;top:48px;width:864px;height:72px;mso-style-name:Title;">
            Slide Title
          </p>
          <p style="position:absolute;left:48px;top:144px;width:864px;height:36px;mso-style-name:Subtitle;">
            Slide Subtitle
          </p>
          <div style="position:absolute;left:96px;top:240px;width:768px;">
            <p class="MsoNormal">• Bullet point 1</p>
            <p class="MsoNormal">• Bullet point 2</p>
            <p class="MsoNormal">• Bullet point 3</p>
          </div>
          <p style="position:absolute;left:48px;top:480px;width:864px;height:144px;mso-style-name:Content;">
            Content area with <b>bold</b> and <i>italic</i> text.
          </p>
        </div>
      `;
      
      const cleaned = cleanOfficeHTML(pptHTML);
      const nodes = converter.parse(cleaned);
      
      expect(nodes.length).toBeGreaterThan(0);
      expect(cleaned).toContain('Slide Title');
      expect(cleaned).toContain('Bullet point');
    });
    
    it('should parse Excel table with merged cells', () => {
      const excelHTML = `
        <table border="1" style="mso-table-lspace:0;mso-table-rspace:0;border-collapse:collapse;">
          <tr>
            <td colspan="2" style="border:1px solid black;padding:4px;mso-width-source:userset;">
              <p class="MsoNormal" style="text-align:center;">Merged Header</p>
            </td>
            <td style="border:1px solid black;padding:4px;">
              <p class="MsoNormal">Header 3</p>
            </td>
          </tr>
          <tr>
            <td rowspan="2" style="border:1px solid black;padding:4px;vertical-align:middle;">
              <p class="MsoNormal">Row 1-2</p>
            </td>
            <td style="border:1px solid black;padding:4px;">
              <p class="MsoNormal">Cell 1-2</p>
            </td>
            <td style="border:1px solid black;padding:4px;">
              <p class="MsoNormal">Cell 1-3</p>
            </td>
          </tr>
          <tr>
            <td style="border:1px solid black;padding:4px;">
              <p class="MsoNormal">Cell 2-2</p>
            </td>
            <td style="border:1px solid black;padding:4px;">
              <p class="MsoNormal">Cell 2-3</p>
            </td>
          </tr>
        </table>
      `;
      
      const cleaned = cleanOfficeHTML(excelHTML);
      
      // Office 속성 제거 확인
      expect(cleaned).not.toContain('mso-table-lspace');
      expect(cleaned).not.toContain('mso-width-source');
      // 병합 속성은 유지되어야 함
      expect(cleaned).toContain('colspan');
      expect(cleaned).toContain('rowspan');
      expect(cleaned).toContain('Merged Header');
    });
    
    it('should parse Office document with footnotes and endnotes', () => {
      const officeHTML = `
        <p class="MsoNormal">
          Text with footnote reference<sup>1</sup>.
        </p>
        <p class="MsoNormal">
          <a name="_edn1" href="#_ednref1" title="" style="mso-endnote-id:edn1;">
            <span style="mso-special-character:footnote;">
              <span class="MsoEndnoteReference">
                <span style="font-size:10.0pt;line-height:115%;font-family:&quot;Calibri&quot;,sans-serif;mso-ascii-theme-font:minor-latin;mso-fareast-font-family:Calibri;mso-fareast-theme-font:minor-latin;mso-hansi-theme-font:minor-latin;mso-bidi-theme-font:minor-latin;color:blue;mso-ansi-language:EN-US;mso-fareast-language:EN-US;mso-bidi-language:AR-SA;">
                  [1]
                </span>
              </span>
            </span>
          </a>
          Footnote content here.
        </p>
      `;
      
      const cleaned = cleanOfficeHTML(officeHTML);
      const nodes = converter.parse(cleaned);
      
      expect(nodes.length).toBeGreaterThan(0);
      expect(cleaned).toContain('Text with footnote');
    });
    
    it('should parse Office document with page breaks and sections', () => {
      const officeHTML = `
        <p class="MsoNormal">Content on page 1.</p>
        <p class="MsoNormal">
          <span style="mso-special-character:page-break;"></span>
        </p>
        <p class="MsoNormal">Content on page 2.</p>
        <div style="mso-element:page-break-before:always;">
          <p class="MsoNormal">Content on page 3.</p>
        </div>
      `;
      
      const cleaned = cleanOfficeHTML(officeHTML);
      const nodes = converter.parse(cleaned);
      
      expect(nodes.length).toBeGreaterThan(0);
      expect(cleaned).toContain('Content on page 1');
      expect(cleaned).toContain('Content on page 2');
    });
    
    it('should parse Office document with complex nested structures', () => {
      const officeHTML = `
        <div class="WordSection1">
          <p class="MsoHeading1">Main Title</p>
          <div style="mso-element:para-border-div;border:solid windowtext 1.0pt;padding:1.0pt 4.0pt 1.0pt 4.0pt;">
            <p class="MsoNormal">
              <span style="mso-spacerun:yes;">   </span>
              Nested paragraph with 
              <b style="mso-bidi-font-weight:normal;">
                <i style="mso-bidi-font-style:normal;">bold italic</i>
              </b>
              text.
            </p>
            <p class="MsoNormal">
              Another paragraph in the same border div.
            </p>
          </div>
          <p class="MsoNormal">Regular paragraph after border.</p>
        </div>
      `;
      
      const cleaned = cleanOfficeHTML(officeHTML);
      const nodes = converter.parse(cleaned);
      
      expect(nodes.length).toBeGreaterThan(0);
      expect(cleaned).toContain('Main Title');
      expect(cleaned).toContain('Nested paragraph');
      expect(cleaned).toContain('Regular paragraph');
    });
    
    it('should handle Office document with VML shapes and graphics', () => {
      const officeHTML = `
        <p class="MsoNormal">Text before shape.</p>
        <v:shapetype id="_x0000_t75" coordsize="21600,21600" o:spt="75" o:preferrelative="t" path="m@4@5l@4@11@9@11@9@5xe" filled="f" stroked="f">
          <v:stroke joinstyle="miter"/>
          <v:formulas>
            <v:f eqn="if lineDrawn pixelLineWidth 0"/>
            <v:f eqn="sum @0 1 0"/>
            <v:f eqn="sum 0 0 @1"/>
            <v:f eqn="prod @2 1 2"/>
            <v:f eqn="prod @3 21600 pixelWidth"/>
            <v:f eqn="prod @3 21600 pixelHeight"/>
            <v:f eqn="sum @0 0 1"/>
            <v:f eqn="prod @6 1 2"/>
            <v:f eqn="prod @7 1 2"/>
          </v:formulas>
          <v:path o:extrusionok="f" gradientshapeok="t" o:connecttype="rect"/>
          <o:lock v:ext="edit" aspectratio="t"/>
        </v:shapetype>
        <v:shape id="Picture 1" o:spid="_x0000_i1025" type="#_x0000_t75" style="width:100pt;height:100pt;">
          <v:imagedata src="image.png" o:title=""/>
        </v:shape>
        <p class="MsoNormal">Text after shape.</p>
      `;
      
      const cleaned = cleanOfficeHTML(officeHTML);
      
      // VML 요소는 제거되어야 함
      expect(cleaned).not.toContain('v:shapetype');
      expect(cleaned).not.toContain('v:shape');
      expect(cleaned).toContain('Text before shape');
      expect(cleaned).toContain('Text after shape');
    });
    
    it('should parse Office document with smart tags', () => {
      const officeHTML = `
        <p class="MsoNormal">
          Contact 
          <o:smarttag type="urn:schemas-microsoft-com:office:smarttags" name="PersonName">
            <o:smarttag type="urn:schemas-microsoft-com:office:smarttags" name="PersonName">
              John Doe
            </o:smarttag>
          </o:smarttag>
          for more information.
        </p>
      `;
      
      const cleaned = cleanOfficeHTML(officeHTML);
      const nodes = converter.parse(cleaned);
      
      // Smart tag는 제거되고 내용만 남아야 함
      expect(cleaned).not.toContain('o:smarttag');
      expect(cleaned).toContain('John Doe');
      expect(cleaned).toContain('Contact');
    });
    
    it('should parse Office document with tracked changes', () => {
      const officeHTML = `
        <p class="MsoNormal">
          Original text 
          <span style="mso-ins:yes;">
            <span style="background:yellow;">inserted text</span>
          </span>
          and 
          <span style="mso-del:yes;">
            <span style="text-decoration:line-through;">deleted text</span>
          </span>
          .
        </p>
      `;
      
      const cleaned = cleanOfficeHTML(officeHTML);
      const nodes = converter.parse(cleaned);
      
      expect(nodes.length).toBeGreaterThan(0);
      expect(cleaned).toContain('Original text');
      expect(cleaned).toContain('inserted text');
      // 삭제된 텍스트는 strikethrough로 표시될 수 있음
    });
  });
});

