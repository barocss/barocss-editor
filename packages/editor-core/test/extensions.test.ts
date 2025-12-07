import { describe, it, expect, beforeEach } from 'vitest';
import { 
  BoldExtension, 
  ItalicExtension, 
  HeadingExtension, 
  ParagraphExtension, 
  TextExtension,
  createBoldExtension,
  createItalicExtension,
  createHeadingExtension,
  createParagraphExtension,
  createTextExtension
} from '../src/extensions/index';
import { Editor } from '../src/index';

describe('Extensions', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor();
  });

  describe('BoldExtension', () => {
    it('BoldExtension이 생성되어야 함', () => {
      const extension = new BoldExtension();
      expect(extension).toBeDefined();
      expect(extension.name).toBe('bold');
      expect(extension.priority).toBe(100);
    });

    it('편의 함수로 BoldExtension을 생성할 수 있어야 함', () => {
      const extension = createBoldExtension();
      expect(extension).toBeInstanceOf(BoldExtension);
    });

    it('옵션과 함께 BoldExtension을 생성할 수 있어야 함', () => {
      const extension = createBoldExtension({
        enabled: false,
        keyboardShortcut: 'Mod+Shift+b'
      });
      expect(extension).toBeInstanceOf(BoldExtension);
    });

    it('에디터에 추가할 수 있어야 함', () => {
      const extension = new BoldExtension();
      expect(() => editor.use(extension)).not.toThrow();
    });
  });

  describe('ItalicExtension', () => {
    it('ItalicExtension이 생성되어야 함', () => {
      const extension = new ItalicExtension();
      expect(extension).toBeDefined();
      expect(extension.name).toBe('italic');
      expect(extension.priority).toBe(100);
    });

    it('편의 함수로 ItalicExtension을 생성할 수 있어야 함', () => {
      const extension = createItalicExtension();
      expect(extension).toBeInstanceOf(ItalicExtension);
    });

    it('에디터에 추가할 수 있어야 함', () => {
      const extension = new ItalicExtension();
      expect(() => editor.use(extension)).not.toThrow();
    });
  });

  describe('HeadingExtension', () => {
    it('HeadingExtension이 생성되어야 함', () => {
      const extension = new HeadingExtension();
      expect(extension).toBeDefined();
      expect(extension.name).toBe('heading');
      expect(extension.priority).toBe(100);
    });

    it('편의 함수로 HeadingExtension을 생성할 수 있어야 함', () => {
      const extension = createHeadingExtension();
      expect(extension).toBeInstanceOf(HeadingExtension);
    });

    it('헤딩 레벨 옵션을 설정할 수 있어야 함', () => {
      const extension = createHeadingExtension({
        levels: [1, 2, 3],
        keyboardShortcuts: {
          1: 'Mod+Alt+1',
          2: 'Mod+Alt+2'
        }
      });
      expect(extension).toBeInstanceOf(HeadingExtension);
    });

    it('에디터에 추가할 수 있어야 함', () => {
      const extension = new HeadingExtension();
      expect(() => editor.use(extension)).not.toThrow();
    });
  });

  describe('ParagraphExtension', () => {
    it('ParagraphExtension이 생성되어야 함', () => {
      const extension = new ParagraphExtension();
      expect(extension).toBeDefined();
      expect(extension.name).toBe('paragraph');
      expect(extension.priority).toBe(100);
    });

    it('편의 함수로 ParagraphExtension을 생성할 수 있어야 함', () => {
      const extension = createParagraphExtension();
      expect(extension).toBeInstanceOf(ParagraphExtension);
    });

    it('에디터에 추가할 수 있어야 함', () => {
      const extension = new ParagraphExtension();
      expect(() => editor.use(extension)).not.toThrow();
    });
  });

  describe('TextExtension', () => {
    it('TextExtension이 생성되어야 함', () => {
      const extension = new TextExtension();
      expect(extension).toBeDefined();
      expect(extension.name).toBe('text');
      expect(extension.priority).toBe(200); // High priority
    });

    it('편의 함수로 TextExtension을 생성할 수 있어야 함', () => {
      const extension = createTextExtension();
      expect(extension).toBeInstanceOf(TextExtension);
    });

    it('옵션과 함께 TextExtension을 생성할 수 있어야 함', () => {
      const extension = createTextExtension({
        enabled: true,
        insertTextOnEnter: false
      });
      expect(extension).toBeInstanceOf(TextExtension);
    });

    it('에디터에 추가할 수 있어야 함', () => {
      const extension = new TextExtension();
      expect(() => editor.use(extension)).not.toThrow();
    });
  });

  describe('Extension Integration', () => {
    it('여러 확장을 동시에 추가할 수 있어야 함', () => {
      const extensions = [
        new TextExtension(),
        new BoldExtension(),
        new ItalicExtension(),
        new HeadingExtension(),
        new ParagraphExtension()
      ];

      extensions.forEach(extension => {
        expect(() => editor.use(extension)).not.toThrow();
      });

      // Verify all extensions are registered
      expect(editor['_extensions'].size).toBe(5);
    });

    it('확장 제거가 작동해야 함', () => {
      const extension = new BoldExtension();
      editor.use(extension);
      
      expect(editor['_extensions'].has('bold')).toBe(true);
      
      editor.unuse(extension);
      expect(editor['_extensions'].has('bold')).toBe(false);
    });

    it('확장의 생명주기 메서드가 호출되어야 함', () => {
      let onCreateCalled = false;
      let onDestroyCalled = false;

      const extension = {
        name: 'lifecycleTest',
        onCreate: () => { onCreateCalled = true; },
        onDestroy: () => { onDestroyCalled = true; }
      };

      editor.use(extension);
      expect(onCreateCalled).toBe(true);

      editor.unuse(extension);
      expect(onDestroyCalled).toBe(true);
    });
  });
});
