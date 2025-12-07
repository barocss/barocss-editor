import { describe, it, expect, beforeEach } from 'vitest';
import { createSchema } from '../src/schema.js';
import type { SchemaDefinition } from '../src/types';

describe('Schema Extension', () => {
  let baseSchema: any;

  beforeEach(() => {
    // Create base schema
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

      // Verify base nodes are preserved
      expect(extendedSchema.hasNodeType('doc')).toBe(true);
      expect(extendedSchema.hasNodeType('paragraph')).toBe(true);
      expect(extendedSchema.hasNodeType('text')).toBe(true);

      // Verify new nodes are added
      expect(extendedSchema.hasNodeType('heading')).toBe(true);
      expect(extendedSchema.hasNodeType('image')).toBe(true);

      // Verify schema name is preserved
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

      // Verify base mark is preserved
      expect(extendedSchema.hasMarkType('bold')).toBe(true);

      // Verify new marks are added
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

      // Verify base elements are preserved
      expect(extendedSchema.hasNodeType('paragraph')).toBe(true);
      expect(extendedSchema.hasMarkType('bold')).toBe(true);

      // Verify new elements are added
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
              align: { type: 'string', default: 'left' } // Add new attribute
            }
          }
        },
        marks: {
          bold: {
            name: 'bold',
            group: 'text-style',
            attrs: {
              weight: { type: 'string', default: 'bold' },
              color: { type: 'string', default: 'black' } // Add new attribute
            }
          }
        }
      });

      // Verify existing node is modified
      const paragraphDef = extendedSchema.getNodeType('paragraph');
      expect(paragraphDef?.attrs?.align).toBeDefined();
      expect(paragraphDef?.attrs?.level).toBeDefined();

      // Verify existing mark is modified
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

      // Should be identical to base schema
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
      // Base blog schema
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

      // Add social media features
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

      // Preserve base blog features
      expect(socialMediaSchema.hasNodeType('paragraph')).toBe(true);
      expect(socialMediaSchema.hasMarkType('bold')).toBe(true);

      // Add social media features
      expect(socialMediaSchema.hasNodeType('tweet')).toBe(true);
      expect(socialMediaSchema.hasNodeType('hashtag')).toBe(true);
      expect(socialMediaSchema.hasMarkType('mention')).toBe(true);
    });

    it('should extend editor schema with collaborative features', () => {
      // Base editor schema
      const editorSchema = createSchema('editor', {
        topNode: 'doc',
        nodes: {
          doc: { name: 'doc', content: 'block+', group: 'document' },
          paragraph: { name: 'paragraph', content: 'inline*', group: 'block' },
          text: { name: 'text', group: 'inline' }
        }
      });

      // Add collaborative features
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

      // Preserve base editor features
      expect(collaborativeSchema.hasNodeType('paragraph')).toBe(true);

      // Add collaborative features
      expect(collaborativeSchema.hasNodeType('comment')).toBe(true);
      expect(collaborativeSchema.hasMarkType('highlight')).toBe(true);
    });
  });
});
