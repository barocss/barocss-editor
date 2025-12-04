import { defineParser } from '../api';
import { OfficeHTMLCleaner } from '../office-html-cleaner';

const cleaner = new OfficeHTMLCleaner();

/**
 * Microsoft Office HTML 변환 규칙 등록
 * 
 * MS Word, PowerPoint, Excel 등에서 복사한 HTML을 처리합니다.
 */
export function registerOfficeHTMLRules(): void {
  // Office HTML은 일반 HTML 파서 규칙을 사용하되,
  // 파싱 전에 Office 특수 포맷을 정리합니다.
  
  // Paragraph (Office의 o:p 태그도 처리)
  defineParser('paragraph', 'html', {
    parseDOM: [
      { tag: 'p' },
      { 
        tag: 'o:p',  // Office paragraph
        priority: 100
      },
      {
        tag: 'div',
        getAttrs: (node) => {
          // Office의 div를 paragraph로 변환 (특정 조건)
          const style = node.getAttribute('style') || '';
          const className = node.getAttribute('class') || '';
          
          // Office 특정 클래스나 스타일이 있으면 paragraph로 처리
          if (className.includes('Mso') || style.includes('mso-')) {
            return {};
          }
          return null; // 매칭 안 됨
        },
        priority: 50
      }
    ]
  });
  
  // Heading (Office의 제목 스타일 처리)
  defineParser('heading', 'html', {
    parseDOM: [
      { tag: 'h1', getAttrs: () => ({ level: 1 }) },
      { tag: 'h2', getAttrs: () => ({ level: 2 }) },
      { tag: 'h3', getAttrs: () => ({ level: 3 }) },
      { tag: 'h4', getAttrs: () => ({ level: 4 }) },
      { tag: 'h5', getAttrs: () => ({ level: 5 }) },
      { tag: 'h6', getAttrs: () => ({ level: 6 }) },
      {
        tag: 'p',
        getAttrs: (node) => {
          // Office의 제목 스타일 확인
          const style = node.getAttribute('style') || '';
          const className = node.getAttribute('class') || '';
          
          // MsoHeading 스타일 확인
          if (className.includes('MsoHeading')) {
            // 클래스명에서 레벨 추출 (예: MsoHeading1 → level 1)
            const levelMatch = className.match(/MsoHeading(\d)/);
            if (levelMatch) {
              return { level: parseInt(levelMatch[1]) };
            }
          }
          
          // MsoTitle, MsoSubtitle도 heading으로 처리
          if (className === 'MsoTitle') {
            return { level: 1 };
          }
          if (className === 'MsoSubtitle') {
            return { level: 2 };
          }
          
          // 스타일에서 제목 레벨 확인
          if (style.includes('mso-style-name')) {
            const nameMatch = style.match(/mso-style-name:\s*["']?Heading\s*(\d)/i);
            if (nameMatch) {
              return { level: parseInt(nameMatch[1]) };
            }
            // Title, Subtitle 스타일도 확인
            if (style.match(/mso-style-name:\s*["']?Title/i)) {
              return { level: 1 };
            }
            if (style.match(/mso-style-name:\s*["']?Subtitle/i)) {
              return { level: 2 };
            }
          }
          
          return null; // 매칭 안 됨
        },
        priority: 100
      }
    ]
  });
  
  // Inline Text (Office의 span 처리)
  defineParser('inline-text', 'html', {
    parseDOM: [
      { tag: 'span' },
      { tag: 'a' },
      {
        tag: 'span',
        getAttrs: (node) => {
          // Office 특수 span 처리
          const style = node.getAttribute('style') || '';
          if (style.includes('mso-')) {
            return {}; // Office span도 일반 span으로 처리
          }
          return null;
        },
        priority: 100
      }
    ]
  });
}

/**
 * Office HTML을 정리하여 일반 HTML로 변환
 * 
 * @param html Office에서 복사한 HTML
 * @returns 정리된 HTML
 */
export function cleanOfficeHTML(html: string): string {
  return cleaner.clean(html);
}

