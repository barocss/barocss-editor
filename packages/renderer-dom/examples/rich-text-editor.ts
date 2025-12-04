/**
 * Rich Text Editor Example using BaroCSS Renderer DSL
 * 
 * This example demonstrates a complete rich text editor implementation
 * using the renderer-dom package with realistic editor components.
 */

import { element, data, slot, when, attr } from '../src/template-builders';
import { on, preventDefault, stopPropagation, debounce, command, setCommandDispatcher } from '../src/event-handlers';
import { renderer } from '../src/template-builders';
import { RendererRegistry } from '../src/registry';
import { RendererFactory } from '../src/factory';

// Command Dispatcher for editor actions
class EditorCommandDispatcher {
  private editor: RichTextEditor;
  
  constructor(editor: RichTextEditor) {
    this.editor = editor;
  }
  
  dispatch(name: string, payload: any, ctx: { element: HTMLElement; event: Event; data: any }): void {
    switch (name) {
      case 'format':
        this.editor.formatText(payload.format, payload.value);
        break;
      case 'insert':
        this.editor.insertContent(payload.type, payload.data);
        break;
      case 'delete':
        this.editor.deleteSelection();
        break;
      case 'undo':
        this.editor.undo();
        break;
      case 'redo':
        this.editor.redo();
        break;
      case 'toggleToolbar':
        this.editor.toggleToolbar();
        break;
      case 'focus':
        this.editor.focus();
        break;
      case 'blur':
        this.editor.blur();
        break;
      case 'selectAll':
        this.editor.selectAll();
        break;
      case 'copy':
        this.editor.copy();
        break;
      case 'paste':
        this.editor.paste();
        break;
      case 'cut':
        this.editor.cut();
        break;
    }
  }
}

// Rich Text Editor Class
export class RichTextEditor {
  private registry: RendererRegistry;
  private factory: RendererFactory;
  private commandDispatcher: EditorCommandDispatcher;
  private rootElement: HTMLElement;
  private contentElement: HTMLElement;
  private toolbarElement: HTMLElement;
  private isFocused = false;
  private history: string[] = [];
  private historyIndex = -1;

  constructor(container: HTMLElement) {
    this.registry = new RendererRegistry();
    this.factory = new RendererFactory(this.registry);
    this.commandDispatcher = new EditorCommandDispatcher(this);
    
    // Set up command dispatcher
    setCommandDispatcher(this.commandDispatcher);
    
    this.rootElement = container;
    this.setupRegistry();
    this.render();
  }

  private setupRegistry(): void {
    // Main Editor Container
    this.registry.register(renderer('editor', element('div', {
      className: 'rich-text-editor',
      style: {
        border: '1px solid #ddd',
        borderRadius: '8px',
        backgroundColor: '#fff',
        minHeight: '300px',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }
    }, [
      slot('toolbar'),
      slot('content')
    ], [
      on('click', () => this.focus()),
      on('keydown', (el, ev) => this.handleKeyDown(ev as KeyboardEvent)),
      on('paste', (el, ev) => this.handlePaste(ev as ClipboardEvent)),
      on('input', (el, ev) => this.handleInput(ev as InputEvent))
    ])));

    // Toolbar
    this.registry.register(renderer('toolbar', element('div', {
      className: 'editor-toolbar',
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px',
        borderBottom: '1px solid #eee',
        backgroundColor: '#f8f9fa',
        flexWrap: 'wrap'
      }
    }, [
      slot('groups')
    ])));

    // Toolbar Group
    this.registry.register(renderer('toolbarGroup', element('div', {
      className: 'toolbar-group',
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px',
        borderRight: '1px solid #ddd'
      }
    }, [
      slot('buttons')
    ])));

    // Toolbar Button
    this.registry.register(renderer('toolbarButton', element('button', {
      className: (d: any) => `toolbar-btn ${d.active ? 'active' : ''} ${d.disabled ? 'disabled' : ''}`,
      style: (d: any) => ({
        padding: '6px 12px',
        border: '1px solid #ddd',
        borderRadius: '4px',
        backgroundColor: d.active ? '#007bff' : '#fff',
        color: d.active ? '#fff' : '#333',
        cursor: d.disabled ? 'not-allowed' : 'pointer',
        fontSize: '14px',
        fontWeight: d.active ? '600' : '400',
        opacity: d.disabled ? '0.5' : '1',
        transition: 'all 0.2s ease'
      }),
      title: (d: any) => d.tooltip || '',
      disabled: (d: any) => d.disabled || false
    }, [
      when((d: any) => d.icon, element('span', {
        className: 'btn-icon',
        style: (d: any) => ({ marginRight: d.text ? '6px' : '0' })
      }, [data('icon', '')])),
      when((d: any) => d.text, element('span', {
        className: 'btn-text'
      }, [data('text', '')]))
    ], [
      on('click', (el, ev) => ev.preventDefault()),
      command('click', 'format', (el, ev, data) => ({
        format: data.format,
        value: data.value
      }))
    ])));

    // Content Area
    this.registry.register(renderer('content', element('div', {
      className: 'editor-content',
      style: {
        flex: '1',
        padding: '16px',
        minHeight: '200px',
        outline: 'none',
        lineHeight: '1.6',
        fontSize: '16px',
        color: '#333'
      },
      contentEditable: 'true',
      spellcheck: 'true'
    }, [
      slot('blocks')
    ], [
      on('focus', () => this.handleFocus()),
      on('blur', () => this.handleBlur()),
      on('selectionchange', () => this.handleSelectionChange())
    ])));

    // Text Block
    this.registry.register(renderer('textBlock', element('div', {
      className: (d: any) => `text-block ${d.type || 'paragraph'}`,
      style: (d: any) => {
        const styles: any = {
          margin: '0 0 12px 0',
          lineHeight: '1.6'
        };
        
        switch (d.type) {
          case 'heading1':
            styles.fontSize = '32px';
            styles.fontWeight = '700';
            styles.marginBottom = '16px';
            break;
          case 'heading2':
            styles.fontSize = '24px';
            styles.fontWeight = '600';
            styles.marginBottom = '14px';
            break;
          case 'heading3':
            styles.fontSize = '20px';
            styles.fontWeight = '600';
            styles.marginBottom = '12px';
            break;
          case 'quote':
            styles.borderLeft = '4px solid #007bff';
            styles.paddingLeft = '16px';
            styles.fontStyle = 'italic';
            styles.color = '#666';
            break;
          case 'code':
            styles.fontFamily = 'Monaco, Consolas, monospace';
            styles.backgroundColor = '#f8f9fa';
            styles.padding = '12px';
            styles.borderRadius = '4px';
            styles.border = '1px solid #e9ecef';
            break;
        }
        
        return styles;
      }
    }, [
      slot('content')
    ])));

    // Inline Text
    this.registry.register(renderer('inlineText', element('span', {
      className: (d: any) => `inline-text ${d.format || ''}`,
      style: (d: any) => {
        const styles: any = {};
        
        if (d.format?.includes('bold')) styles.fontWeight = '700';
        if (d.format?.includes('italic')) styles.fontStyle = 'italic';
        if (d.format?.includes('underline')) styles.textDecoration = 'underline';
        if (d.format?.includes('strikethrough')) styles.textDecoration = 'line-through';
        if (d.format?.includes('code')) {
          styles.fontFamily = 'Monaco, Consolas, monospace';
          styles.backgroundColor = '#f1f3f4';
          styles.padding = '2px 4px';
          styles.borderRadius = '2px';
        }
        
        return styles;
      }
    }, [data('text', '')])));

    // Link
    this.registry.register(renderer('link', element('a', {
      href: (d: any) => d.url || '#',
      target: (d: any) => d.external ? '_blank' : '_self',
      rel: (d: any) => d.external ? 'noopener noreferrer' : '',
      className: 'editor-link',
      style: {
        color: '#007bff',
        textDecoration: 'underline',
        cursor: 'pointer'
      }
    }, [data('text', '')], [
      on('click', (el, ev) => ev.preventDefault()),
      command('click', 'format', (el, ev, data) => ({
        format: 'link',
        value: data.url
      }))
    ])));

    // Image
    this.registry.register(renderer('image', element('img', {
      src: (d: any) => d.src || '',
      alt: (d: any) => d.alt || '',
      className: 'editor-image',
      style: {
        maxWidth: '100%',
        height: 'auto',
        borderRadius: '4px',
        margin: '8px 0',
        display: 'block'
      }
    }, [], [
      on('error', (el, ev) => {
        (el as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMTMuMDkgOC4yNkwyMCA5TDEzLjA5IDE1Ljc0TDEyIDIyTDEwLjkxIDE1Ljc0TDQgOUwxMC45MSA4LjI2TDEyIDJaIiBmaWxsPSIjNjY2Ii8+Cjwvc3ZnPgo=';
      })
    ])));

    // List
    this.registry.register(renderer('list', element('ul', {
      className: (d: any) => `editor-list ${d.type || 'bullet'}`,
      style: {
        margin: '8px 0',
        paddingLeft: '24px'
      }
    }, [
      slot('items')
    ])));

    // List Item
    this.registry.register(renderer('listItem', element('li', {
      className: 'list-item',
      style: {
        margin: '4px 0',
        lineHeight: '1.6'
      }
    }, [
      slot('content')
    ])));

    // Table
    this.registry.register(renderer('table', element('table', {
      className: 'editor-table',
      style: {
        width: '100%',
        borderCollapse: 'collapse',
        margin: '12px 0',
        border: '1px solid #ddd'
      }
    }, [
      slot('rows')
    ])));

    // Table Row
    this.registry.register(renderer('tableRow', element('tr', {
      className: 'table-row',
      style: {
        borderBottom: '1px solid #eee'
      }
    }, [
      slot('cells')
    ])));

    // Table Cell
    this.registry.register(renderer('tableCell', element('td', {
      className: 'table-cell',
      style: {
        padding: '8px 12px',
        borderRight: '1px solid #eee',
        verticalAlign: 'top'
      }
    }, [
      slot('content')
    ])));

    // Divider
    this.registry.register(renderer('divider', element('hr', {
      className: 'editor-divider',
      style: {
        border: 'none',
        borderTop: '2px solid #eee',
        margin: '16px 0'
      }
    }, [])));
  }

  private render(): void {
    const editorData = {
      id: 'editor',
      type: 'editor',
      slots: {
        toolbar: [{
          id: 'toolbar',
          type: 'toolbar',
          slots: {
            groups: [
              {
                id: 'format-group',
                type: 'toolbarGroup',
                slots: {
                  buttons: [
                    { id: 'bold', type: 'toolbarButton', format: 'bold', icon: 'B', tooltip: 'Bold' },
                    { id: 'italic', type: 'toolbarButton', format: 'italic', icon: 'I', tooltip: 'Italic' },
                    { id: 'underline', type: 'toolbarButton', format: 'underline', icon: 'U', tooltip: 'Underline' }
                  ]
                }
              },
              {
                id: 'heading-group',
                type: 'toolbarGroup',
                slots: {
                  buttons: [
                    { id: 'h1', type: 'toolbarButton', format: 'heading1', text: 'H1', tooltip: 'Heading 1' },
                    { id: 'h2', type: 'toolbarButton', format: 'heading2', text: 'H2', tooltip: 'Heading 2' },
                    { id: 'h3', type: 'toolbarButton', format: 'heading3', text: 'H3', tooltip: 'Heading 3' }
                  ]
                }
              },
              {
                id: 'insert-group',
                type: 'toolbarGroup',
                slots: {
                  buttons: [
                    { id: 'link', type: 'toolbarButton', format: 'link', text: 'Link', tooltip: 'Insert Link' },
                    { id: 'image', type: 'toolbarButton', format: 'image', text: 'Image', tooltip: 'Insert Image' },
                    { id: 'list', type: 'toolbarButton', format: 'list', text: 'List', tooltip: 'Insert List' }
                  ]
                }
              }
            ]
          }
        }],
        content: [{
          id: 'content',
          type: 'content',
          slots: {
            blocks: [
              {
                id: 'welcome',
                type: 'textBlock',
                blockType: 'heading1',
                slots: {
                  content: [{
                    id: 'welcome-text',
                    type: 'inlineText',
                    text: 'Welcome to Rich Text Editor'
                  }]
                }
              },
              {
                id: 'intro',
                type: 'textBlock',
                blockType: 'paragraph',
                slots: {
                  content: [{
                    id: 'intro-text',
                    type: 'inlineText',
                    text: 'This is a powerful rich text editor built with BaroCSS Renderer DSL. You can format text, insert links, images, and more!'
                  }]
                }
              }
            ]
          }
        }]
      }
    };

    const editorElement = this.factory.createRenderer('editor', editorData);
    this.rootElement.appendChild(editorElement);
    
    this.toolbarElement = editorElement.querySelector('.editor-toolbar') as HTMLElement;
    this.contentElement = editorElement.querySelector('.editor-content') as HTMLElement;
  }

  // Editor Methods
  focus(): void {
    this.contentElement.focus();
    this.isFocused = true;
    this.updateToolbar();
  }

  blur(): void {
    this.contentElement.blur();
    this.isFocused = false;
    this.updateToolbar();
  }

  private handleFocus(): void {
    this.isFocused = true;
    this.updateToolbar();
  }

  private handleBlur(): void {
    this.isFocused = false;
    this.updateToolbar();
  }

  private handleKeyDown(event: KeyboardEvent): void {
    // Handle keyboard shortcuts
    if (event.ctrlKey || event.metaKey) {
      switch (event.key) {
        case 'b':
          event.preventDefault();
          this.formatText('bold');
          break;
        case 'i':
          event.preventDefault();
          this.formatText('italic');
          break;
        case 'u':
          event.preventDefault();
          this.formatText('underline');
          break;
        case 'z':
          event.preventDefault();
          if (event.shiftKey) {
            this.redo();
          } else {
            this.undo();
          }
          break;
        case 'a':
          event.preventDefault();
          this.selectAll();
          break;
        case 'c':
          event.preventDefault();
          this.copy();
          break;
        case 'v':
          event.preventDefault();
          this.paste();
          break;
        case 'x':
          event.preventDefault();
          this.cut();
          break;
      }
    }
  }

  private handleInput(event: InputEvent): void {
    this.saveToHistory();
    this.updateToolbar();
  }

  private handlePaste(event: ClipboardEvent): void {
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') || '';
    document.execCommand('insertText', false, text);
  }

  private handleSelectionChange(): void {
    this.updateToolbar();
  }

  formatText(format: string, value?: any): void {
    if (format === 'bold' || format === 'italic' || format === 'underline') {
      document.execCommand(format, false);
    } else if (format.startsWith('heading')) {
      const level = format.replace('heading', '');
      document.execCommand('formatBlock', false, `h${level}`);
    } else if (format === 'link') {
      const url = prompt('Enter URL:');
      if (url) {
        document.execCommand('createLink', false, url);
      }
    }
    this.updateToolbar();
  }

  insertContent(type: string, data: any): void {
    switch (type) {
      case 'image':
        const src = prompt('Enter image URL:');
        if (src) {
          const img = document.createElement('img');
          img.src = src;
          img.alt = data.alt || '';
          img.className = 'editor-image';
          img.style.cssText = 'max-width: 100%; height: auto; border-radius: 4px; margin: 8px 0; display: block;';
          document.execCommand('insertHTML', false, img.outerHTML);
        }
        break;
      case 'list':
        document.execCommand('insertUnorderedList', false);
        break;
    }
  }

  deleteSelection(): void {
    document.execCommand('delete', false);
  }

  undo(): void {
    document.execCommand('undo', false);
  }

  redo(): void {
    document.execCommand('redo', false);
  }

  selectAll(): void {
    document.execCommand('selectAll', false);
  }

  copy(): void {
    document.execCommand('copy', false);
  }

  paste(): void {
    document.execCommand('paste', false);
  }

  cut(): void {
    document.execCommand('cut', false);
  }

  toggleToolbar(): void {
    if (this.toolbarElement) {
      this.toolbarElement.style.display = 
        this.toolbarElement.style.display === 'none' ? 'flex' : 'none';
    }
  }

  private updateToolbar(): void {
    // Update toolbar button states based on current selection
    const buttons = this.toolbarElement?.querySelectorAll('.toolbar-btn');
    buttons?.forEach(button => {
      const format = button.getAttribute('data-format');
      if (format) {
        const isActive = document.queryCommandState(format);
        button.classList.toggle('active', isActive);
      }
    });
  }

  private saveToHistory(): void {
    const content = this.contentElement.innerHTML;
    if (content !== this.history[this.historyIndex]) {
      this.history = this.history.slice(0, this.historyIndex + 1);
      this.history.push(content);
      this.historyIndex = this.history.length - 1;
      
      // Limit history size
      if (this.history.length > 50) {
        this.history.shift();
        this.historyIndex--;
      }
    }
  }

  getContent(): string {
    return this.contentElement.innerHTML;
  }

  setContent(html: string): void {
    this.contentElement.innerHTML = html;
    this.saveToHistory();
  }

  destroy(): void {
    setCommandDispatcher(null);
    this.rootElement.innerHTML = '';
  }
}

