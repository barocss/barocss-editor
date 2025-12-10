# Pattern & Custom Decorator Examples Guide

## Overview

The Decorator system supports three types:
1. **Target Decorator** - directly targets specific nodes or text ranges
2. **Pattern Decorator** - automatically detects text using regex patterns and creates decorators
3. **Custom Decorator** - dynamically generates decorators by analyzing the entire model via functions

This document provides practical examples for Pattern and Custom Decorators.

---

## Pattern Decorator Examples

Pattern Decorators use regex patterns to automatically detect specific patterns in text and create decorators.

### Registration Methods

There are two ways to register Pattern Decorators:

1. **Using `registerPatternDecorator()`** (recommended) - explicit and type-safe
2. **Using `addDecorator()`** - unified API supporting all decorator types

### Method 1: Using registerPatternDecorator() (Recommended)

```typescript
import { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { defineDecorator, element, data } from '@barocss/dsl';

// 1. Define decorator template
defineDecorator('color-picker', element('span', {
  className: 'color-picker',
  style: {
    backgroundColor: data('color'),
    color: '#fff',
    padding: '2px 6px',
    borderRadius: '3px',
    cursor: 'pointer'
  },
  onClick: (e: MouseEvent, props: any) => {
    const color = props.color;
    console.log('Color clicked:', color);
    // Open color picker, etc.
  }
}, [data('text')]));

// 2. Register Pattern Decorator
view.registerPatternDecorator({
  sid: 'hex-color-pattern',
  stype: 'color-picker',
  category: 'inline',
  pattern: /#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b/g,
  extractData: (match: RegExpMatchArray) => {
    return {
      color: match[0],  // #ff0000 or #f00
      text: match[0]
    };
  },
  createDecorator: (nodeId: string, startOffset: number, endOffset: number, extractedData: Record<string, any>) => {
    return {
      sid: `color-${nodeId}-${startOffset}-${endOffset}`,
      target: {
        sid: nodeId,
        startOffset: startOffset,
        endOffset: endOffset
      },
      data: {
        color: extractedData.color,
        text: extractedData.text
      }
    };
  },
  priority: 10  // lower = higher priority
});

// 3. Render document
view.render();
```

### Method 2: Using addDecorator()

With `addDecorator()`, you can explicitly set `decoratorType: 'pattern'` or it will automatically recognize as a pattern decorator if `data.pattern` exists.

```typescript
// Method 2-1: Explicit decoratorType
view.addDecorator({
  sid: 'hex-color-pattern',
  stype: 'color-picker',
  category: 'inline',
  decoratorType: 'pattern',  // explicitly mark as pattern decorator
  target: { sid: '' },  // pattern decorators have no target
  data: {
    pattern: /#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b/g,
    extractData: (match: RegExpMatchArray) => ({
      color: match[0],
      text: match[0]
    }),
    createDecorator: (nodeId: string, start: number, end: number, data: Record<string, any>) => ({
      sid: `color-${nodeId}-${start}-${end}`,
      target: {
        sid: nodeId,
        startOffset: start,
        endOffset: end
      },
      data: {
        color: data.color,
        text: data.text
      }
    }),
    priority: 10
  }
});

// Method 2-2: Auto-recognition when data.pattern exists
view.addDecorator({
  sid: 'hex-color-pattern',
  stype: 'color-picker',
  category: 'inline',
  target: { sid: '' },
  data: {
    pattern: /#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b/g,  // auto-recognized as pattern decorator if pattern exists
    extractData: (match: RegExpMatchArray) => ({ /* ... */ }),
    createDecorator: (nodeId, start, end, data) => ({ /* ... */ }),
    priority: 10
  }
});
```

**Note**: Both methods work the same, and `addDecorator()` can handle all decorator types (target, pattern, custom) with a unified API.

### Example 1: Auto-link Email Addresses

```typescript
// Define template
defineDecorator('email-link', element('a', {
  className: 'email-link',
  href: data('email'),
  style: {
    color: '#0066cc',
    textDecoration: 'underline'
  },
  onClick: (e: MouseEvent) => {
    e.preventDefault();
    window.location.href = `mailto:${e.currentTarget.getAttribute('href')}`;
  }
}, [data('text')]));

// Register pattern (using registerPatternDecorator)
view.registerPatternDecorator({
  sid: 'email-pattern',
  stype: 'email-link',
  category: 'inline',
  pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  extractData: (match) => ({
    email: match[0],
    text: match[0]
  }),
  createDecorator: (nodeId, start, end, data) => ({
    sid: `email-${nodeId}-${start}-${end}`,
    target: {
      sid: nodeId,
      startOffset: start,
      endOffset: end
    },
    data: {
      email: data.email,
      text: data.text
    }
  }),
  priority: 20
});

// Or using addDecorator
view.addDecorator({
  sid: 'email-pattern',
  stype: 'email-link',
  category: 'inline',
  decoratorType: 'pattern',
  target: { sid: '' },
  data: {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    extractData: (match) => ({ email: match[0], text: match[0] }),
    createDecorator: (nodeId, start, end, data) => ({
      sid: `email-${nodeId}-${start}-${end}`,
      target: { sid: nodeId, startOffset: start, endOffset: end },
      data: { email: data.email, text: data.text }
    }),
    priority: 20
  }
});
```

### Example 2: Auto-link URLs

```typescript
defineDecorator('url-link', element('a', {
  className: 'url-link',
  href: data('url'),
  target: '_blank',
  rel: 'noopener noreferrer',
  style: {
    color: '#0066cc',
    textDecoration: 'underline'
  }
}, [data('text')]));

view.registerPatternDecorator({
  sid: 'url-pattern',
  stype: 'url-link',
  category: 'inline',
  pattern: /https?:\/\/[^\s]+/g,
  extractData: (match) => ({
    url: match[0],
    text: match[0]
  }),
  createDecorator: (nodeId, start, end, data) => ({
    sid: `url-${nodeId}-${start}-${end}`,
    target: {
      sid: nodeId,
      startOffset: start,
      endOffset: end
    },
    data: {
      url: data.url,
      text: data.text
    }
  }),
  priority: 15
});
```

### Example 3: Auto-detect Mentions (@username)

```typescript
defineDecorator('mention', element('span', {
  className: 'mention',
  'data-username': data('username'),
  style: {
    backgroundColor: '#e3f2fd',
    color: '#1976d2',
    padding: '2px 4px',
    borderRadius: '3px',
    fontWeight: 'bold'
  },
  onClick: (e: MouseEvent, props: any) => {
    const username = props.username;
    console.log('Mention clicked:', username);
    // Open user profile, etc.
  }
}, [data('text')]));

// Using registerPatternDecorator
view.registerPatternDecorator({
  sid: 'mention-pattern',
  stype: 'mention',
  category: 'inline',
  pattern: /@(\w+)/g,
  extractData: (match) => ({
    username: match[1],  // username without @
    text: match[0]        // full @username
  }),
  createDecorator: (nodeId, start, end, data) => ({
    sid: `mention-${nodeId}-${start}-${end}`,
    target: {
      sid: nodeId,
      startOffset: start,
      endOffset: end
    },
    data: {
      username: data.username,
      text: data.text
    }
  }),
  priority: 5  // high priority
});

// Or using addDecorator
view.addDecorator({
  sid: 'mention-pattern',
  stype: 'mention',
  category: 'inline',
  decoratorType: 'pattern',
  target: { sid: '' },
  data: {
    pattern: /@(\w+)/g,
    extractData: (match) => ({ username: match[1], text: match[0] }),
    createDecorator: (nodeId, start, end, data) => ({
      sid: `mention-${nodeId}-${start}-${end}`,
      target: { sid: nodeId, startOffset: start, endOffset: end },
      data: { username: data.username, text: data.text }
    }),
    priority: 5
  }
});
```

### Example 4: Multiple Pattern Combinations (Using Priority)

```typescript
// 1. Email (priority 10) - using registerPatternDecorator
view.registerPatternDecorator({
  sid: 'email-pattern',
  stype: 'email-link',
  category: 'inline',
  pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  // ... extractData, createDecorator
  priority: 10
});

// 2. URL (priority 15) - using addDecorator (both methods work)
view.addDecorator({
  sid: 'url-pattern',
  stype: 'url-link',
  category: 'inline',
  decoratorType: 'pattern',
  target: { sid: '' },
  data: {
    pattern: /https?:\/\/[^\s]+/g,
    // ... extractData, createDecorator
    priority: 15
  }
});

// Email takes precedence over URL pattern if they overlap (lower priority = applied first)
```

### Enable/Disable Pattern Decorator

```typescript
// Disable specific pattern
view.setPatternDecoratorEnabled('hex-color-pattern', false);
view.render();  // re-render needed

// Re-enable
view.setPatternDecoratorEnabled('hex-color-pattern', true);
view.render();
```

### Remove Pattern Decorator

```typescript
// Remove single pattern
view.unregisterPatternDecorator('hex-color-pattern');

// Remove all patterns
view.getPatternDecoratorConfigs().forEach(config => {
  view.unregisterPatternDecorator(config.sid);
});
```

---

## Custom Decorator Examples

Custom Decorators dynamically generate decorators by analyzing the entire model via functions. While Pattern Decorators are limited to text patterns, Custom Decorators can consider model structure, attributes, relationships, etc.

### Registration Method

Custom Decorators are registered with `addDecorator()`, and are **automatically recognized by the presence of a `generate` function**. You can also explicitly set `decoratorType: 'custom'`, but it's not required.

**Recognition logic:**
- `'generate' in decorator` → recognized as Custom Decorator
- Or `decoratorType === 'custom'` → recognized as Custom Decorator

### Basic Usage

```typescript
import type { DecoratorGenerator, DecoratorGeneratorContext } from '@barocss/editor-view-dom';
import type { ModelData } from '@barocss/dsl';

const spellCheckGenerator: DecoratorGenerator = {
  sid: 'spell-check-generator',
  enabled: true,
  
  generate(model: ModelData, text: string | null, context?: DecoratorGeneratorContext): Decorator[] {
    const decorators: Decorator[] = [];
    
    // Process only when text exists
    if (!text) return decorators;
    
    // Spell check logic (example)
    const words = text.split(/\s+/);
    let offset = 0;
    
    for (const word of words) {
      const wordStart = offset;
      const wordEnd = offset + word.length;
      
      // Detect spelling errors (example logic)
      if (this.isMisspelled(word)) {
        decorators.push({
          sid: `spell-${model.sid}-${wordStart}-${wordEnd}`,
          stype: 'spell-error',
          category: 'inline',
          target: {
            sid: model.sid,
            startOffset: wordStart,
            endOffset: wordEnd
          },
          data: {
            word: word,
            suggestions: this.getSuggestions(word)
          }
        });
      }
      
      offset = wordEnd + 1; // include space
    }
    
    return decorators;
  },
  
  // Spell check (example)
  isMisspelled(word: string): boolean {
    // Use actual spell check API
    const dictionary = ['hello', 'world', 'example'];
    return !dictionary.includes(word.toLowerCase());
  },
  
  // Get suggestion words (example)
  getSuggestions(word: string): string[] {
    // Use actual spell check API
    return ['suggestion1', 'suggestion2'];
  },
  
  // Change detection (optional)
  onDidChange(callback: () => void): () => void {
    // Register external event listener
    const interval = setInterval(() => {
      callback(); // periodic re-check
    }, 5000);
    
    return () => clearInterval(interval); // cleanup function
  }
};

// Register generator (automatically recognized as custom decorator if generate function exists)
view.addDecorator(spellCheckGenerator);

// Or explicitly specify decoratorType (optional)
view.addDecorator({
  ...spellCheckGenerator,
  decoratorType: 'custom'  // can be explicitly specified but not required
});
```

### Example 1: Auto-detect and Highlight Code Blocks

```typescript
const codeBlockGenerator: DecoratorGenerator = {
  sid: 'code-block-generator',
  enabled: true,
  
  generate(model: ModelData, text: string | null, context?: DecoratorGeneratorContext): Decorator[] {
    const decorators: Decorator[] = [];
    
    if (!text) return decorators;
    
    // Detect code block pattern (```language ... ```)
    const codeBlockPattern = /```(\w+)?\n([\s\S]*?)```/g;
    let match;
    
    while ((match = codeBlockPattern.exec(text)) !== null) {
      const language = match[1] || 'text';
      const code = match[2];
      const startOffset = match.index;
      const endOffset = match.index + match[0].length;
      
      decorators.push({
        sid: `code-block-${model.sid}-${startOffset}-${endOffset}`,
        stype: 'code-block',
        category: 'block',
        target: {
          sid: model.sid,
          startOffset: startOffset,
          endOffset: endOffset
        },
        data: {
          language: language,
          code: code
        }
      });
    }
    
    return decorators;
  }
};

view.addDecorator(codeBlockGenerator);
```

### Example 2: Auto-highlight Keywords

```typescript
const keywordHighlighter: DecoratorGenerator = {
  sid: 'keyword-highlighter',
  enabled: true,
  keywords: ['important', 'urgent', 'critical', 'note'],
  
  generate(model: ModelData, text: string | null, context?: DecoratorGeneratorContext): Decorator[] {
    const decorators: Decorator[] = [];
    
    if (!text) return decorators;
    
    // Search for each keyword
    for (const keyword of this.keywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      let match;
      
      while ((match = regex.exec(text)) !== null) {
        decorators.push({
          sid: `keyword-${model.sid}-${match.index}-${match.index + match[0].length}`,
          stype: 'keyword-highlight',
          category: 'inline',
          target: {
            sid: model.sid,
            startOffset: match.index,
            endOffset: match.index + match[0].length
          },
          data: {
            keyword: keyword,
            text: match[0]
          }
        });
      }
    }
    
    return decorators;
  },
  
  // Re-render when keyword list updates
  onDidChange(callback: () => void): () => void {
    // Call callback when keyword list changes
    return () => {}; // cleanup
  }
};

view.addDecorator(keywordHighlighter);
```

### Example 3: Display AI-Generated Content

```typescript
const aiContentMarker: DecoratorGenerator = {
  sid: 'ai-content-marker',
  enabled: true,
  
  generate(model: ModelData, text: string | null, context?: DecoratorGeneratorContext): Decorator[] {
    const decorators: Decorator[] = [];
    
    // Check if AI-generated from model metadata
    if (model.metadata?.aiGenerated) {
      decorators.push({
        sid: `ai-marker-${model.sid}`,
        stype: 'ai-badge',
        category: 'layer',
        target: {
          sid: model.sid
        },
        data: {
          model: model.metadata.aiModel || 'unknown',
          timestamp: model.metadata.aiTimestamp || Date.now()
        }
      });
    }
    
    return decorators;
  }
};

view.addDecorator(aiContentMarker);
```

### Example 4: Real-time Collaboration - Display Other Users' Selection Ranges

```typescript
const collaborationHighlighter: DecoratorGenerator = {
  sid: 'collaboration-highlighter',
  enabled: true,
  activeUsers: new Map<string, { selection: any, color: string }>(),
  
  generate(model: ModelData, text: string | null, context?: DecoratorGeneratorContext): Decorator[] {
    const decorators: Decorator[] = [];
    
    // Display selection ranges of active users
    for (const [userId, userData] of this.activeUsers.entries()) {
      if (userData.selection.sid === model.sid && text) {
        const start = userData.selection.startOffset || 0;
        const end = userData.selection.endOffset || text.length;
        
        decorators.push({
          sid: `collab-${userId}-${model.sid}`,
          stype: 'user-selection',
          category: 'inline',
          target: {
            sid: model.sid,
            startOffset: start,
            endOffset: end
          },
          data: {
            userId: userId,
            color: userData.color,
            userName: userData.userName || userId
          }
        });
      }
    }
    
    return decorators;
  },
  
  // Update user selection range
  updateUserSelection(userId: string, selection: any, color: string, userName?: string): void {
    this.activeUsers.set(userId, { selection, color, userName });
    // Notify change (auto re-render if onDidChange is registered)
  },
  
  onDidChange(callback: () => void): () => void {
    // Real-time updates via WebSocket or event listener
    const ws = new WebSocket('ws://collaboration-server');
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'selection-change') {
        this.updateUserSelection(data.userId, data.selection, data.color, data.userName);
        callback(); // trigger re-render
      }
    };
    
    return () => ws.close();
  }
};

view.addDecorator(collaborationHighlighter);
```

### Example 5: Conditional Decorator Generation (Complex Logic)

```typescript
const smartHighlighter: DecoratorGenerator = {
  sid: 'smart-highlighter',
  enabled: true,
  
  generate(model: ModelData, text: string | null, context?: DecoratorGeneratorContext): Decorator[] {
    const parent = context?.parentModel;
    const decorators: Decorator[] = [];
    
    if (!text) return decorators;
    
    // Different handling based on parent node type
    if (parent?.stype === 'code-block') {
      // Only highlight keywords inside code blocks
      return this.highlightKeywords(text, model.sid);
    } else if (parent?.stype === 'quote') {
      // Special style for quotes
      return this.highlightQuotes(text, model.sid);
    } else {
      // Apply all patterns in regular text
      return [
        ...this.highlightKeywords(text, model.sid),
        ...this.highlightUrls(text, model.sid),
        ...this.highlightMentions(text, model.sid)
      ];
    }
  },
  
  highlightKeywords(text: string, nodeId: string): Decorator[] {
    // Keyword highlight logic
    return [];
  },
  
  highlightQuotes(text: string, nodeId: string): Decorator[] {
    // Quote highlight logic
    return [];
  },
  
  highlightUrls(text: string, nodeId: string): Decorator[] {
    // URL highlight logic
    return [];
  },
  
  highlightMentions(text: string, nodeId: string): Decorator[] {
    // Mention highlight logic
    return [];
  }
};

view.addDecorator(smartHighlighter);
```

### Remove Custom Decorator

```typescript
// Remove generator
view.decoratorGeneratorManager.unregisterGenerator(spellCheckGenerator);

// Or if added via addDecorator
// Save generator object and remove later
const generator = { /* ... */ };
view.addDecorator(generator);
// Remove later
view.decoratorGeneratorManager.unregisterGenerator(generator);
```

---

## Pattern vs Custom Decorator Comparison

| Feature | Pattern Decorator | Custom Decorator |
|---------|------------------|------------------|
| **Detection Method** | Regex pattern | Function-based analysis |
| **Scope** | Text nodes only | Entire model (structure, attributes, relationships) |
| **Performance** | Fast (regex matching) | Can be slow (complex logic) |
| **Use Cases** | Email, URL, color codes, etc. | Spell check, AI display, collaboration, etc. |
| **Dynamic Updates** | Re-registration needed on pattern change | Real-time updates possible via onDidChange |
| **Complexity** | Low | High (free logic) |
| **Registration Method** | `registerPatternDecorator()` or `addDecorator()` | `addDecorator()` (auto-recognized by generate function) |
| **Recognition Criteria** | `decoratorType: 'pattern'` or `data.pattern` exists | `generate` function exists or `decoratorType: 'custom'` |

---

## Practical Tips

### 1. Priority Management

```typescript
// Lower priority = applied first
view.registerPatternDecorator({
  sid: 'email',
  // ...
  priority: 10  // high priority
});

view.registerPatternDecorator({
  sid: 'url',
  // ...
  priority: 20  // low priority (applied after email)
});
```

### 2. Pattern Conflict Resolution

```typescript
// When overlapping patterns exist, higher priority one is applied
// Or detect conflicts in extractData and handle
extractData: (match) => {
  // Check if another decorator already exists
  // Return null to skip if exists
  return { /* ... */ };
}
```

### 3. Performance Optimization

```typescript
// Use caching in Custom Decorator
const cache = new Map<string, Decorator[]>();

generate(model: ModelData, text: string | null, context?: DecoratorGeneratorContext): Decorator[] {
    const cacheKey = `${model.sid}-${text}`;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey)!;
    }
    
    const decorators = this.computeDecorators(model, text, context);
    cache.set(cacheKey, decorators);
    return decorators;
  }
```

### 4. Conditional Activation

```typescript
// Activate generator only under specific conditions
const conditionalGenerator: DecoratorGenerator = {
  get enabled() {
    return this.shouldBeEnabled();
  },
  
  shouldBeEnabled(): boolean {
    // Decide based on user settings, document type, etc.
    return userSettings.enableSpellCheck && documentType === 'article';
  },
  
  generate(context: DecoratorGeneratorContext): Decorator[] {
    // ...
  }
};
```

---

## Related Documentation

- [Decorator Usage Guide](./decorator-guide.md) - basic usage
- [Decorator Architecture](./decorator-architecture.md) - system structure
- [Decorator Integration Guide](./decorator-integration.md) - AI integration and collaboration
