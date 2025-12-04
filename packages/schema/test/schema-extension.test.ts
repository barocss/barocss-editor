import { describe, it, expect, beforeEach } from 'vitest';
import { createSchema } from '../src/schema.js';
import type { SchemaDefinition } from '../src/types';

describe('Schema Extension', () => {
  let baseSchema: any;

  beforeEach(() => {
    // 기본 스키마 생성
    baseSchema = createSchema('base', {
      topNode: 'doc',
      nodes: {
        doc: {
          name: 'doc',
          content: 'block+',
          group: 'document',
          attrs: {
            title: { type: 'string', required: true }
          }
        },
        paragraph: {
          name: 'paragraph',
          content: 'inline*',
          group: 'block',
          attrs: {
            level: { type: 'number', default: 1 }
          }
        },
        text: {
          name: 'text',
          group: 'inline'
        }
      },
      marks: {
        bold: {
          name: 'bold',
          group: 'text-style',
          attrs: {
            weight: { type: 'string', default: 'bold' }
          }
        }
      }
    });
  });

  describe('createSchema with base schema', () => {
    it('should extend base schema with new nodes', () => {
      const extendedSchema = createSchema(baseSchema, {
        nodes: {
          heading: {
            name: 'heading',
            content: 'inline*',
            group: 'block',
            attrs: {
              level: { type: 'number', required: true }
            }
          },
          image: {
            name: 'image',
            group: 'inline',
            atom: true,
            attrs: {
              src: { type: 'string', required: true }
            }
          }
        }
      });

      // 기본 노드들이 유지되는지 확인
      expect(extendedSchema.hasNodeType('doc')).toBe(true);
      expect(extendedSchema.hasNodeType('paragraph')).toBe(true);
      expect(extendedSchema.hasNodeType('text')).toBe(true);

      // 새로운 노드들이 추가되었는지 확인
      expect(extendedSchema.hasNodeType('heading')).toBe(true);
      expect(extendedSchema.hasNodeType('image')).toBe(true);

      // 스키마 이름이 유지되는지 확인
      expect(extendedSchema.name).toBe('base');
    });

    it('should extend base schema with new marks', () => {
      const extendedSchema = createSchema(baseSchema, {
        marks: {
          italic: {
            name: 'italic',
            group: 'text-style',
            attrs: {
              style: { type: 'string', default: 'italic' }
            }
          },
          link: {
            name: 'link',
            group: 'link',
            attrs: {
              href: { type: 'string', required: true }
            }
          }
        }
      });

      // 기본 마크가 유지되는지 확인
      expect(extendedSchema.hasMarkType('bold')).toBe(true);

      // 새로운 마크들이 추가되었는지 확인
      expect(extendedSchema.hasMarkType('italic')).toBe(true);
      expect(extendedSchema.hasMarkType('link')).toBe(true);
    });

    it('should extend base schema with both nodes and marks', () => {
      const extendedSchema = createSchema(baseSchema, {
        nodes: {
          heading: {
            name: 'heading',
            content: 'inline*',
            group: 'block',
            attrs: {
              level: { type: 'number', required: true }
            }
          }
        },
        marks: {
          italic: {
            name: 'italic',
            group: 'text-style',
            attrs: {
              style: { type: 'string', default: 'italic' }
            }
          }
        }
      });

      // 기본 요소들이 유지되는지 확인
      expect(extendedSchema.hasNodeType('paragraph')).toBe(true);
      expect(extendedSchema.hasMarkType('bold')).toBe(true);

      // 새로운 요소들이 추가되었는지 확인
      expect(extendedSchema.hasNodeType('heading')).toBe(true);
      expect(extendedSchema.hasMarkType('italic')).toBe(true);
    });

    it('should override existing nodes and marks', () => {
      const extendedSchema = createSchema(baseSchema, {
        nodes: {
          paragraph: {
            name: 'paragraph',
            content: 'inline*',
            group: 'block',
            attrs: {
              level: { type: 'number', default: 1 },
              align: { type: 'string', default: 'left' } // 새로운 속성 추가
            }
          }
        },
        marks: {
          bold: {
            name: 'bold',
            group: 'text-style',
            attrs: {
              weight: { type: 'string', default: 'bold' },
              color: { type: 'string', default: 'black' } // 새로운 속성 추가
            }
          }
        }
      });

      // 기존 노드가 수정되었는지 확인
      const paragraphDef = extendedSchema.getNodeType('paragraph');
      expect(paragraphDef?.attrs?.align).toBeDefined();
      expect(paragraphDef?.attrs?.level).toBeDefined();

      // 기존 마크가 수정되었는지 확인
      const boldDef = extendedSchema.getMarkType('bold');
      expect(boldDef?.attrs?.color).toBeDefined();
      expect(boldDef?.attrs?.weight).toBeDefined();
    });

    it('should preserve topNode from base schema', () => {
      const extendedSchema = createSchema(baseSchema, {
        nodes: {
          heading: {
            name: 'heading',
            content: 'inline*',
            group: 'block'
          }
        }
      });

      expect(extendedSchema.topNode).toBe('doc');
    });

    it('should allow overriding topNode', () => {
      const extendedSchema = createSchema(baseSchema, {
        topNode: 'article',
        nodes: {
          article: {
            name: 'article',
            content: 'block+',
            group: 'document'
          }
        }
      });

      expect(extendedSchema.topNode).toBe('article');
    });

    it('should work with empty extensions', () => {
      const extendedSchema = createSchema(baseSchema, {});

      // 기본 스키마와 동일해야 함
      expect(extendedSchema.name).toBe(baseSchema.name);
      expect(extendedSchema.topNode).toBe(baseSchema.topNode);
      expect(extendedSchema.nodes.size).toBe(baseSchema.nodes.size);
      expect(extendedSchema.marks.size).toBe(baseSchema.marks.size);
    });
  });

  describe('createSchema with string name (original behavior)', () => {
    it('should create new schema when first argument is string', () => {
      const newSchema = createSchema('new', {
        topNode: 'doc',
        nodes: {
          doc: { name: 'doc', group: 'document' }
        }
      });

      expect(newSchema.name).toBe('new');
      expect(newSchema.topNode).toBe('doc');
    });
  });

  describe('real-world usage examples', () => {
    it('should extend blog schema with social media features', () => {
      // 블로그 기본 스키마
      const blogSchema = createSchema('blog', {
        topNode: 'doc',
        nodes: {
          doc: { name: 'doc', content: 'block+', group: 'document' },
          paragraph: { name: 'paragraph', content: 'inline*', group: 'block' },
          text: { name: 'text', group: 'inline' }
        },
        marks: {
          bold: { name: 'bold', group: 'text-style' }
        }
      });

      // 소셜 미디어 기능 추가
      const socialMediaSchema = createSchema(blogSchema, {
        nodes: {
          tweet: {
            name: 'tweet',
            content: 'inline*',
            group: 'block',
            attrs: {
              characterCount: { type: 'number', required: true }
            }
          },
          hashtag: {
            name: 'hashtag',
            group: 'inline',
            attrs: {
              tag: { type: 'string', required: true }
            }
          }
        },
        marks: {
          mention: {
            name: 'mention',
            group: 'social',
            attrs: {
              username: { type: 'string', required: true }
            }
          }
        }
      });

      // 기본 블로그 기능 유지
      expect(socialMediaSchema.hasNodeType('paragraph')).toBe(true);
      expect(socialMediaSchema.hasMarkType('bold')).toBe(true);

      // 소셜 미디어 기능 추가
      expect(socialMediaSchema.hasNodeType('tweet')).toBe(true);
      expect(socialMediaSchema.hasNodeType('hashtag')).toBe(true);
      expect(socialMediaSchema.hasMarkType('mention')).toBe(true);
    });

    it('should extend editor schema with collaborative features', () => {
      // 기본 에디터 스키마
      const editorSchema = createSchema('editor', {
        topNode: 'doc',
        nodes: {
          doc: { name: 'doc', content: 'block+', group: 'document' },
          paragraph: { name: 'paragraph', content: 'inline*', group: 'block' },
          text: { name: 'text', group: 'inline' }
        }
      });

      // 협업 기능 추가
      const collaborativeSchema = createSchema(editorSchema, {
        nodes: {
          comment: {
            name: 'comment',
            group: 'block',
            attrs: {
              author: { type: 'string', required: true },
              timestamp: { type: 'string', required: true },
              resolved: { type: 'boolean', default: false }
            }
          }
        },
        marks: {
          highlight: {
            name: 'highlight',
            group: 'collaborative',
            attrs: {
              author: { type: 'string', required: true },
              color: { type: 'string', default: 'yellow' }
            }
          }
        }
      });

      // 기본 에디터 기능 유지
      expect(collaborativeSchema.hasNodeType('paragraph')).toBe(true);

      // 협업 기능 추가
      expect(collaborativeSchema.hasNodeType('comment')).toBe(true);
      expect(collaborativeSchema.hasMarkType('highlight')).toBe(true);
    });
  });
});
