import { defineDocumentParser, defineASTConverter, defineConverter } from '../api';

/**
 * 기본 Markdown 변환 규칙 등록
 */
export function registerDefaultMarkdownRules(): void {
  // === Document Parser ===
  
  // 간단한 Markdown 파서 등록 (외부 라이브러리 없이)
  // 실제로는 markdown-it 같은 외부 라이브러리를 사용하는 것을 권장
  defineDocumentParser('markdown', {
    parse(document: string): any[] {
      const lines = document.split('\n');
      const ast: any[] = [];

      let i = 0;
      while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();
        i++;
        if (!trimmed) continue;

        // Heading 체크
        const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
          ast.push({
            type: 'heading',
            level: headingMatch[1].length,
            text: headingMatch[2],
            children: parseInline(headingMatch[2])
          });
          continue;
        }

        // Bullet List 체크 (-, *, +) 및 Task List (- [ ] / - [x])
        const bulletMatch = trimmed.match(/^[-*+]\s+(.+)$/);
        if (bulletMatch) {
          const items: any[] = [];
          // 현재 줄 포함 연속된 bullet line 수집
          let j = i - 1;
          while (j < lines.length) {
            const l = lines[j].trim();
            if (!l) break;
            const m = l.match(/^[-*+]\s+(.+)$/);
            if (!m) break;
            let text = m[1];

            // Task list 패턴 체크: [ ] text, [x] text
            const taskMatch = text.match(/^\[([ xX])\]\s*(.*)$/);
            const isTask = !!taskMatch;
            const checked = isTask && taskMatch![1].toLowerCase() === 'x';
            if (taskMatch) {
              text = taskMatch[2];
            }

            items.push({
              type: 'list_item',
              text,
              task: isTask,
              checked,
              children: parseInline(text)
            });
            j++;
          }
          i = j;
          ast.push({
            type: 'list',
            ordered: false,
            items
          });
          continue;
        }

        // Ordered List 체크 (1. 2. ...)
        const orderedMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
        if (orderedMatch) {
          const items: any[] = [];
          let j = i - 1;
          while (j < lines.length) {
            const l = lines[j].trim();
            if (!l) break;
            const m = l.match(/^\d+[.)]\s+(.+)$/);
            if (!m) break;
            let text = m[1];

            // Ordered task list: "1. [ ] text" / "1. [x] text"
            const taskMatch = text.match(/^\[([ xX])\]\s*(.*)$/);
            const isTask = !!taskMatch;
            const checked = isTask && taskMatch![1].toLowerCase() === 'x';
            if (taskMatch) {
              text = taskMatch[2];
            }

            items.push({
              type: 'list_item',
              text,
              task: isTask,
              checked,
              children: parseInline(text)
            });
            j++;
          }
          i = j;
          ast.push({
            type: 'list',
            ordered: true,
            items
          });
          continue;
        }

        // Image (단독 라인)
        const imageMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (imageMatch) {
          ast.push({
            type: 'image',
            alt: imageMatch[1],
            src: imageMatch[2]
          });
          continue;
        }

        // 기본 Paragraph
        ast.push({
          type: 'paragraph',
          text: trimmed,
          children: parseInline(trimmed)
        });
      }

      return ast;
    }
  });
  
  // === AST → Model 변환 규칙 ===
  
  // Heading
  defineASTConverter('heading', 'markdown', {
    convert(astNode: any, toConverter: (astNode: any) => any): any | null {
      if (astNode.type === 'heading') {
        const content: any[] = [];
        if (astNode.children) {
          for (const child of astNode.children) {
            const converted = toConverter(child);
            if (converted) {
              content.push(converted);
            }
          }
        }
        
        return {
          stype: 'heading',
          attributes: { level: astNode.level },
          content: content.length > 0 ? content : undefined,
          text: content.length === 0 ? astNode.text : undefined
        };
      }
      return null;
    }
  });
  
  // Paragraph
  defineASTConverter('paragraph', 'markdown', {
    convert(astNode: any, toConverter: (astNode: any) => any): any | null {
      if (astNode.type === 'paragraph') {
        const content: any[] = [];
        if (astNode.children) {
          for (const child of astNode.children) {
            const converted = toConverter(child);
            if (converted) {
              content.push(converted);
            }
          }
        }
        
        return {
          stype: 'paragraph',
          content: content.length > 0 ? content : undefined,
          text: content.length === 0 ? astNode.text : undefined
        };
      }
      return null;
    }
  });
  
  // Inline Text
  defineASTConverter('inline-text', 'markdown', {
    convert(astNode: any): any | null {
      if (astNode.type === 'text') {
        return {
          stype: 'inline-text',
          text: astNode.text
        };
      }
      
      // Bold
      if (astNode.type === 'bold') {
        return {
          stype: 'inline-text',
          text: astNode.text,
          marks: [
            {
              stype: 'bold',
              range: [0, astNode.text.length]
            }
          ]
        };
      }
      
      // Italic
      if (astNode.type === 'italic') {
        return {
          stype: 'inline-text',
          text: astNode.text,
          marks: [
            {
              stype: 'italic',
              range: [0, astNode.text.length]
            }
          ]
        };
      }
      
      return null;
    }
  });

  // List
  defineASTConverter('list', 'markdown', {
    convert(astNode: any, toConverter: (astNode: any) => any): any | null {
      if (astNode.type === 'list') {
        const items = (astNode.items || []).map((item: any) => {
          const children: any[] = [];
          if (item.children) {
            for (const child of item.children) {
              const converted = toConverter(child);
              if (converted) {
                children.push(converted);
              }
            }
          }
          return {
            stype: 'list_item',
            attributes: item.task
              ? {
                  task: true,
                  checked: item.checked === true
                }
              : undefined,
            content: children.length > 0 ? children : undefined,
            text: children.length === 0 ? item.text : undefined
          };
        });

        return {
          stype: 'list',
          attributes: { ordered: astNode.ordered === true },
          content: items
        };
      }
      return null;
    }
  });

  // Image
  defineASTConverter('image', 'markdown', {
    convert(astNode: any): any | null {
      if (astNode.type === 'image') {
        return {
          stype: 'image',
          attributes: {
            src: astNode.src,
            alt: astNode.alt
          }
        };
      }
      return null;
    }
  });
  
  // === Model → Markdown 변환 규칙 ===
  
  // Heading
  defineConverter('heading', 'markdown', {
    convert: (node) => {
      const level = node.attributes?.level || 1;
      const content = convertContentToMarkdown(node.content || []);
      return `${'#'.repeat(level)} ${content}`;
    }
  });
  
  // Paragraph
  defineConverter('paragraph', 'markdown', {
    convert: (node) => {
      const content = convertContentToMarkdown(node.content || []);
      return content;
    }
  });
  
  // Inline Text
  defineConverter('inline-text', 'markdown', {
    convert: (node) => {
      let text = node.text || '';
      
      // Marks 처리
      if (node.marks && node.marks.length > 0) {
        for (const mark of node.marks) {
          if (mark.stype === 'bold') {
            text = `**${text}**`;
          } else if (mark.stype === 'italic') {
            text = `*${text}*`;
          }
        }
      }
      
      return text;
    }
  });

  // List
  defineConverter('list', 'markdown', {
    convert: (node) => {
      const ordered = node.attributes?.ordered === true;
      const items = Array.isArray(node.content) ? node.content : [];
      const lines: string[] = [];

      let index = 1;
      for (const item of items as any[]) {
        const itemText = convertContentToMarkdown(item.content || []);
        if (!itemText) continue;

        const isTask = item.attributes?.task === true;
        const checked = item.attributes?.checked === true;

        if (ordered) {
          if (isTask) {
            const box = checked ? '[x]' : '[ ]';
            lines.push(`${index}. ${box} ${itemText}`);
          } else {
            lines.push(`${index}. ${itemText}`);
          }
        } else {
          if (isTask) {
            const box = checked ? '[x]' : '[ ]';
            lines.push(`- ${box} ${itemText}`);
          } else {
            lines.push(`- ${itemText}`);
          }
        }
        index++;
      }

      return lines.join('\n');
    }
  });

  // Image
  defineConverter('image', 'markdown', {
    convert: (node) => {
      const attrs = node.attributes || {};
      const alt = attrs.alt || '';
      const src = attrs.src || '';
      return `![${alt}](${src})`;
    }
  });
}

/**
 * 인라인 텍스트 파싱 (bold, italic)
 */
function parseInline(text: string): any[] {
  const children: any[] = [];
  
  // **bold** 또는 *italic* 패턴 찾기
  const boldPattern = /\*\*([^*]+)\*\*/g;
  const italicPattern = /\*([^*]+)\*/g;
  
  const matches: Array<{ index: number; length: number; text: string; type: string }> = [];
  
  let match;
  while ((match = boldPattern.exec(text)) !== null) {
    matches.push({
      index: match.index,
      length: match[0].length,
      text: match[1],
      type: 'bold'
    });
  }
  
  while ((match = italicPattern.exec(text)) !== null) {
    // bold와 겹치지 않는 경우만 추가
    const overlaps = matches.some(m => 
      (match!.index >= m.index && match!.index < m.index + m.length) ||
      (m.index >= match!.index && m.index < match!.index + match!.length)
    );
    if (!overlaps) {
      matches.push({
        index: match.index,
        length: match[0].length,
        text: match[1],
        type: 'italic'
      });
    }
  }
  
  // 인덱스 순으로 정렬
  matches.sort((a, b) => a.index - b.index);
  
  // 매치되지 않은 텍스트와 매치된 텍스트를 순서대로 처리
  let lastIndex = 0;
  for (const match of matches) {
    // 매치 전의 일반 텍스트
    if (match.index > lastIndex) {
      const plainText = text.substring(lastIndex, match.index);
      if (plainText) {
        children.push({
          type: 'text',
          text: plainText
        });
      }
    }
    
    // 매치된 텍스트
    children.push({
      type: match.type,
      text: match.text
    });
    
    lastIndex = match.index + match.length;
  }
  
  // 마지막 매치 이후의 텍스트
  if (lastIndex < text.length) {
    const plainText = text.substring(lastIndex);
    if (plainText) {
      children.push({
        type: 'text',
        text: plainText
      });
    }
  }
  
  // 매치가 없으면 전체 텍스트 반환
  if (children.length === 0) {
    children.push({
      type: 'text',
      text: text
    });
  }
  
  return children;
}

/**
 * 노드 content를 Markdown 문자열로 변환
 */
function convertContentToMarkdown(content: (any | string)[]): string {
  const parts: string[] = [];
  
  for (const item of content) {
    if (typeof item === 'string') {
      parts.push(item);
    } else if (item && typeof item === 'object' && 'stype' in item) {
      // 간단한 재귀 변환
      if (item.text !== undefined) {
        let text = item.text;
        if (item.marks && item.marks.length > 0) {
          for (const mark of item.marks) {
            if (mark.stype === 'bold') {
              text = `**${text}**`;
            } else if (mark.stype === 'italic') {
              text = `*${text}*`;
            }
          }
        }
        parts.push(text);
      } else if (item.content) {
        parts.push(convertContentToMarkdown(item.content));
      }
    }
  }
  
  return parts.join('');
}

