import { describe, it, expect } from 'vitest';
import { evaluateWhenExpression } from '../src/when-expression';

describe('evaluateWhenExpression', () => {
  describe('Logical operators', () => {
    it('should evaluate simple context keys', () => {
      expect(evaluateWhenExpression('editorFocus', { editorFocus: true })).toBe(true);
      expect(evaluateWhenExpression('editorFocus', { editorFocus: false })).toBe(false);
      expect(evaluateWhenExpression('editorFocus', {})).toBe(false); // undefined = false
    });

    it('should evaluate && operator', () => {
      expect(evaluateWhenExpression('editorFocus && editorEditable', { editorFocus: true, editorEditable: true })).toBe(true);
      expect(evaluateWhenExpression('editorFocus && editorEditable', { editorFocus: true, editorEditable: false })).toBe(false);
      expect(evaluateWhenExpression('editorFocus && editorEditable', { editorFocus: false, editorEditable: true })).toBe(false);
    });

    it('should evaluate || operator', () => {
      expect(evaluateWhenExpression('editorFocus || editorEditable', { editorFocus: true, editorEditable: false })).toBe(true);
      expect(evaluateWhenExpression('editorFocus || editorEditable', { editorFocus: false, editorEditable: true })).toBe(true);
      expect(evaluateWhenExpression('editorFocus || editorEditable', { editorFocus: false, editorEditable: false })).toBe(false);
    });

    it('should evaluate ! operator', () => {
      expect(evaluateWhenExpression('!editorFocus', { editorFocus: true })).toBe(false);
      expect(evaluateWhenExpression('!editorFocus', { editorFocus: false })).toBe(true);
      expect(evaluateWhenExpression('!editorReadonly', { editorReadonly: false })).toBe(true);
    });

    it('should respect operator precedence: ! > && > ||', () => {
      // !foo && bar should be (!foo) && bar
      expect(evaluateWhenExpression('!editorFocus && editorEditable', { editorFocus: false, editorEditable: true })).toBe(true);
      expect(evaluateWhenExpression('!editorFocus && editorEditable', { editorFocus: true, editorEditable: true })).toBe(false);

      // foo || bar && baz should be foo || (bar && baz)
      expect(evaluateWhenExpression('editorFocus || editorEditable && selectionEmpty', {
        editorFocus: true,
        editorEditable: false,
        selectionEmpty: false
      })).toBe(true);
      expect(evaluateWhenExpression('editorFocus || editorEditable && selectionEmpty', {
        editorFocus: false,
        editorEditable: true,
        selectionEmpty: true
      })).toBe(true);
      expect(evaluateWhenExpression('editorFocus || editorEditable && selectionEmpty', {
        editorFocus: false,
        editorEditable: true,
        selectionEmpty: false
      })).toBe(false);
    });

    it('should respect operator precedence with various combinations', () => {
      const context = { foo: true, bar: true, baz: false };

      // !foo && bar should be interpreted as (!foo) && bar
      expect(evaluateWhenExpression('!foo && bar', { foo: false, bar: true })).toBe(true);
      expect(evaluateWhenExpression('!foo && bar', { foo: true, bar: true })).toBe(false);

      // !foo || bar should be interpreted as (!foo) || bar
      expect(evaluateWhenExpression('!foo || bar', { foo: true, bar: true })).toBe(true);
      expect(evaluateWhenExpression('!foo || bar', { foo: false, bar: false })).toBe(true);
      expect(evaluateWhenExpression('!foo || bar', { foo: true, bar: false })).toBe(false);

      // foo || bar && baz should be interpreted as foo || (bar && baz)
      expect(evaluateWhenExpression('foo || bar && baz', { foo: true, bar: true, baz: true })).toBe(true);
      expect(evaluateWhenExpression('foo || bar && baz', { foo: false, bar: true, baz: true })).toBe(true);
      expect(evaluateWhenExpression('foo || bar && baz', { foo: false, bar: true, baz: false })).toBe(false);
      expect(evaluateWhenExpression('foo || bar && baz', { foo: false, bar: false, baz: true })).toBe(false);

      // !foo && bar || baz should be interpreted as (!foo && bar) || baz
      expect(evaluateWhenExpression('!foo && bar || baz', { foo: false, bar: true, baz: false })).toBe(true);
      expect(evaluateWhenExpression('!foo && bar || baz', { foo: true, bar: true, baz: true })).toBe(true);
      expect(evaluateWhenExpression('!foo && bar || baz', { foo: true, bar: false, baz: false })).toBe(false);

      // !(foo || bar) && baz should remain as !(foo || bar) && baz (parentheses preserved)
      expect(evaluateWhenExpression('!(foo || bar) && baz', { foo: false, bar: false, baz: true })).toBe(true);
      expect(evaluateWhenExpression('!(foo || bar) && baz', { foo: true, bar: false, baz: true })).toBe(false);
      expect(evaluateWhenExpression('!(foo || bar) && baz', { foo: false, bar: false, baz: false })).toBe(false);
    });

    it('should handle parentheses', () => {
      expect(evaluateWhenExpression('(editorFocus || editorEditable) && selectionEmpty', {
        editorFocus: false,
        editorEditable: true,
        selectionEmpty: true
      })).toBe(true);
      expect(evaluateWhenExpression('!(editorFocus || editorEditable)', {
        editorFocus: true,
        editorEditable: false
      })).toBe(false);
    });

    it('should handle true/false literals', () => {
      expect(evaluateWhenExpression('true', {})).toBe(true);
      expect(evaluateWhenExpression('false', {})).toBe(false);
      expect(evaluateWhenExpression('true && false', {})).toBe(false);
      expect(evaluateWhenExpression('true || false', {})).toBe(true);
    });
  });

  describe('Equality operators', () => {
    it('should evaluate == operator', () => {
      expect(evaluateWhenExpression("selectionType == 'range'", { selectionType: 'range' })).toBe(true);
      expect(evaluateWhenExpression("selectionType == 'range'", { selectionType: 'node' })).toBe(false);
      expect(evaluateWhenExpression('editorFocus == true', { editorFocus: true })).toBe(true);
    });

    it('should evaluate != operator', () => {
      expect(evaluateWhenExpression("selectionType != 'range'", { selectionType: 'node' })).toBe(true);
      expect(evaluateWhenExpression("selectionType != 'range'", { selectionType: 'range' })).toBe(false);
    });

    it('should handle string literals with quotes', () => {
      expect(evaluateWhenExpression("selectionType == 'range'", { selectionType: 'range' })).toBe(true);
      expect(evaluateWhenExpression("selectionType == 'My New File.md'", { selectionType: 'My New File.md' })).toBe(true);
    });

    it('should handle escaped quotes in strings', () => {
      expect(evaluateWhenExpression("selectionType == 'It\\'s a test'", { selectionType: "It's a test" })).toBe(true);
    });
  });

  describe('Comparison operators', () => {
    it('should evaluate > operator', () => {
      expect(evaluateWhenExpression('workspaceFolderCount > 1', { workspaceFolderCount: 2 })).toBe(true);
      expect(evaluateWhenExpression('workspaceFolderCount > 1', { workspaceFolderCount: 1 })).toBe(false);
      expect(evaluateWhenExpression('workspaceFolderCount > 1', { workspaceFolderCount: 0 })).toBe(false);
    });

    it('should evaluate >= operator', () => {
      expect(evaluateWhenExpression('workspaceFolderCount >= 1', { workspaceFolderCount: 1 })).toBe(true);
      expect(evaluateWhenExpression('workspaceFolderCount >= 1', { workspaceFolderCount: 2 })).toBe(true);
      expect(evaluateWhenExpression('workspaceFolderCount >= 1', { workspaceFolderCount: 0 })).toBe(false);
    });

    it('should evaluate < operator', () => {
      expect(evaluateWhenExpression('workspaceFolderCount < 2', { workspaceFolderCount: 1 })).toBe(true);
      expect(evaluateWhenExpression('workspaceFolderCount < 2', { workspaceFolderCount: 2 })).toBe(false);
    });

    it('should evaluate <= operator', () => {
      expect(evaluateWhenExpression('workspaceFolderCount <= 2', { workspaceFolderCount: 2 })).toBe(true);
      expect(evaluateWhenExpression('workspaceFolderCount <= 2', { workspaceFolderCount: 1 })).toBe(true);
      expect(evaluateWhenExpression('workspaceFolderCount <= 2', { workspaceFolderCount: 3 })).toBe(false);
    });

    it('should return false for non-numeric comparisons', () => {
      expect(evaluateWhenExpression('editorFocus > 1', { editorFocus: true })).toBe(false);
      expect(evaluateWhenExpression('selectionType < 5', { selectionType: 'range' })).toBe(false);
    });

    it('should support decimal numbers in comparisons', () => {
      // Decimal number literals
      expect(evaluateWhenExpression('progress > 0.5', { progress: 0.75 })).toBe(true);
      expect(evaluateWhenExpression('progress > 0.5', { progress: 0.3 })).toBe(false);
      expect(evaluateWhenExpression('progress >= 0.5', { progress: 0.5 })).toBe(true);
      expect(evaluateWhenExpression('progress < 1.0', { progress: 0.9 })).toBe(true);
      expect(evaluateWhenExpression('progress <= 0.5', { progress: 0.5 })).toBe(true);
      expect(evaluateWhenExpression('progress <= 0.5', { progress: 0.6 })).toBe(false);

      // When context value is decimal
      expect(evaluateWhenExpression('progress > 0', { progress: 0.1 })).toBe(true);
      expect(evaluateWhenExpression('progress < 1', { progress: 0.9 })).toBe(true);
      expect(evaluateWhenExpression('0.5 < progress', { progress: 0.75 })).toBe(true);
      expect(evaluateWhenExpression('1.0 > progress', { progress: 0.5 })).toBe(true);

      // Both sides are decimal
      expect(evaluateWhenExpression('progress > 0.3', { progress: 0.7 })).toBe(true);
      expect(evaluateWhenExpression('progress < 0.8', { progress: 0.5 })).toBe(true);
      expect(evaluateWhenExpression('progress >= 0.5', { progress: 0.5 })).toBe(true);
      expect(evaluateWhenExpression('progress <= 0.5', { progress: 0.5 })).toBe(true);
    });

    it('should support various decimal number formats', () => {
      // Various decimal formats
      expect(evaluateWhenExpression('value > 0.1', { value: 0.2 })).toBe(true);
      expect(evaluateWhenExpression('value > .5', { value: 0.6 })).toBe(true);
      expect(evaluateWhenExpression('value < 1.5', { value: 1.2 })).toBe(true);
      expect(evaluateWhenExpression('value >= 0.0', { value: 0.1 })).toBe(true);
      expect(evaluateWhenExpression('value <= 1.0', { value: 0.9 })).toBe(true);

      // Large decimal numbers
      expect(evaluateWhenExpression('value > 10.5', { value: 11.2 })).toBe(true);
      expect(evaluateWhenExpression('value < 100.99', { value: 50.5 })).toBe(true);
    });
  });

  describe('Match operator (=~)', () => {
    it('should match simple patterns', () => {
      expect(evaluateWhenExpression("resourceFilename =~ /docker/", { resourceFilename: 'docker-compose.yml' })).toBe(true);
      expect(evaluateWhenExpression("resourceFilename =~ /docker/", { resourceFilename: 'package.json' })).toBe(false);
    });

    it('should support regex flags', () => {
      expect(evaluateWhenExpression("resourceFilename =~ /DOCKER/i", { resourceFilename: 'docker-compose.yml' })).toBe(true);
      expect(evaluateWhenExpression("resourceFilename =~ /DOCKER/", { resourceFilename: 'docker-compose.yml' })).toBe(false);
    });

    it('should handle complex regex patterns', () => {
      expect(evaluateWhenExpression("resourceScheme =~ /^untitled$|^file$/", { resourceScheme: 'file' })).toBe(true);
      expect(evaluateWhenExpression("resourceScheme =~ /^untitled$|^file$/", { resourceScheme: 'untitled' })).toBe(true);
      expect(evaluateWhenExpression("resourceScheme =~ /^untitled$|^file$/", { resourceScheme: 'http' })).toBe(false);
    });

    it('should handle escaped characters in regex', () => {
      expect(evaluateWhenExpression("resourceScheme =~ /file:\\/\\//", { resourceScheme: 'file://' })).toBe(true);
    });

    it('should return false if =~ is not followed by regex', () => {
      expect(evaluateWhenExpression("resourceFilename =~ editorFocus", { resourceFilename: 'test' })).toBe(false);
    });
  });

  describe('In/Not in operators', () => {
    it('should evaluate \"in\" operator with arrays', () => {
      expect(evaluateWhenExpression("resourceFilename in supportedFolders", {
        resourceFilename: 'test',
        supportedFolders: ['test', 'foo', 'bar']
      })).toBe(true);
      expect(evaluateWhenExpression("resourceFilename in supportedFolders", {
        resourceFilename: 'baz',
        supportedFolders: ['test', 'foo', 'bar']
      })).toBe(false);
    });

    it('should evaluate \"not in\" operator with arrays', () => {
      expect(evaluateWhenExpression("resourceFilename not in supportedFolders", {
        resourceFilename: 'baz',
        supportedFolders: ['test', 'foo', 'bar']
      })).toBe(true);
      expect(evaluateWhenExpression("resourceFilename not in supportedFolders", {
        resourceFilename: 'test',
        supportedFolders: ['test', 'foo', 'bar']
      })).toBe(false);
    });

    it('should evaluate \"in\" operator with objects', () => {
      expect(evaluateWhenExpression("resourceFilename in supportedFolders", {
        resourceFilename: 'test',
        supportedFolders: { test: true, foo: 'anything', bar: 123 }
      })).toBe(true);
      expect(evaluateWhenExpression("resourceFilename in supportedFolders", {
        resourceFilename: 'baz',
        supportedFolders: { test: true, foo: 'anything', bar: 123 }
      })).toBe(false);
    });

    it('should return false if right side is not array or object', () => {
      expect(evaluateWhenExpression("resourceFilename in supportedFolders", {
        resourceFilename: 'test',
        supportedFolders: 'not an array'
      })).toBe(false);
    });
  });

  describe('Complex expressions', () => {
    it('should handle VS Code-style when clauses', () => {
      expect(evaluateWhenExpression("debuggersAvailable && !inDebugMode", {
        debuggersAvailable: true,
        inDebugMode: false
      })).toBe(true);
      expect(evaluateWhenExpression("debuggersAvailable && !inDebugMode", {
        debuggersAvailable: true,
        inDebugMode: true
      })).toBe(false);
    });

    it('should handle editor focus and editable checks', () => {
      expect(evaluateWhenExpression("editorFocus && editorEditable", {
        editorFocus: true,
        editorEditable: true
      })).toBe(true);
      expect(evaluateWhenExpression("editorFocus && editorEditable && !selectionEmpty", {
        editorFocus: true,
        editorEditable: true,
        selectionEmpty: false
      })).toBe(true);
    });

    it('should handle selection type checks', () => {
      expect(evaluateWhenExpression("selectionType == 'range' && editorFocus", {
        selectionType: 'range',
        editorFocus: true
      })).toBe(true);
      expect(evaluateWhenExpression("selectionType == 'node' || selectionType == 'multi-node'", {
        selectionType: 'node'
      })).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty or whitespace-only expressions', () => {
      expect(evaluateWhenExpression('', {})).toBe(true);
      expect(evaluateWhenExpression('   ', {})).toBe(true);
    });

    it('should handle undefined context keys', () => {
      expect(evaluateWhenExpression('undefinedKey', {})).toBe(false);
      expect(evaluateWhenExpression('undefinedKey || editorFocus', { editorFocus: true })).toBe(true);
    });

    it('should handle null values', () => {
      expect(evaluateWhenExpression('nullKey', { nullKey: null })).toBe(false);
      expect(evaluateWhenExpression("nullKey == null", { nullKey: null })).toBe(true);
    });
  });

  describe('Complex cases', () => {
    it('complex expressions with multiple operators', () => {
      const context = {
        editorFocus: true,
        editorEditable: true,
        selectionEmpty: false,
        selectionType: 'range',
        'modeExtension.currentMode': 'markdown',
        'readOnlyExtension.enabled': false,
        'loadingStateExtension.isLoading': false
      };

      // Complex AND conditions
      expect(evaluateWhenExpression(
        'editorFocus && editorEditable && !selectionEmpty && selectionType == "range"',
        context
      )).toBe(true);

      // Complex combination of OR and AND
      expect(evaluateWhenExpression(
        'editorFocus && (editorEditable || selectionEmpty)',
        context
      )).toBe(true);

      // Multiple levels of logical operators
      expect(evaluateWhenExpression(
        'editorFocus && editorEditable && !selectionEmpty && (selectionType == "range" || selectionType == "node")',
        context
      )).toBe(true);
    });

    it('nested parentheses and complex logical operations', () => {
      const context = {
        a: true,
        b: false,
        c: true,
        d: false,
        e: true
      };

      // Deeply nested parentheses
      expect(evaluateWhenExpression(
        '((a && b) || (c && d)) && e',
        context
      )).toBe(false); // (false || false) && true = false && true = false

      expect(evaluateWhenExpression(
        '((a || b) && (c || d)) && e',
        context
      )).toBe(true); // (true || false) && (true || false) && true = true && true && true = true

      expect(evaluateWhenExpression(
        '!((a && b) || (c && d))',
        context
      )).toBe(true); // !(false || false) = !false = true
    });

    it('comparison of various value types', () => {
      const context = {
        stringValue: 'test',
        numberValue: 42,
        booleanValue: true,
        nullValue: null,
        undefinedValue: undefined
      };

      // String comparison
      expect(evaluateWhenExpression("stringValue == 'test'", context)).toBe(true);
      expect(evaluateWhenExpression("stringValue != 'other'", context)).toBe(true);

      // Number comparison
      expect(evaluateWhenExpression('numberValue > 40', context)).toBe(true);
      expect(evaluateWhenExpression('numberValue < 50', context)).toBe(true);
      expect(evaluateWhenExpression('numberValue >= 42', context)).toBe(true);
      expect(evaluateWhenExpression('numberValue <= 42', context)).toBe(true);

      // Boolean comparison
      expect(evaluateWhenExpression('booleanValue == true', context)).toBe(true);
      expect(evaluateWhenExpression('booleanValue != false', context)).toBe(true);

      // Null comparison
      expect(evaluateWhenExpression('nullValue == null', context)).toBe(true);
      expect(evaluateWhenExpression('nullValue != null', context)).toBe(false);
    });

    it('complex conditions similar to actual Extension usage scenarios', () => {
      const context = {
        editorFocus: true,
        editorEditable: true,
        selectionEmpty: false,
        selectionType: 'node',
        'modeExtension.currentMode': 'markdown',
        'readOnlyExtension.enabled': false,
        'loadingStateExtension.isLoading': false,
        'nodeTypeExtension.isImage': true,
        'multiSelectionExtension.hasMultiple': false
      };

      // When not read-only, in markdown mode, and not loading
      expect(evaluateWhenExpression(
        '!readOnlyExtension.enabled && modeExtension.currentMode == "markdown" && !loadingStateExtension.isLoading',
        context
      )).toBe(true);

      // When image is selected and not multiple selection
      expect(evaluateWhenExpression(
        'nodeTypeExtension.isImage && !multiSelectionExtension.hasMultiple && editorFocus',
        context
      )).toBe(true);

      // Compound condition: editor focus + editable + selection not empty + specific type
      expect(evaluateWhenExpression(
        'editorFocus && editorEditable && !selectionEmpty && selectionType == "node"',
        context
      )).toBe(true);
    });

    it('complex expressions with many context keys', () => {
      const context = {
        a: true,
        b: false,
        c: true,
        d: false,
        e: true,
        f: false,
        g: true,
        h: false,
        i: true,
        j: false
      };

      // Connect many conditions with AND
      expect(evaluateWhenExpression(
        'a && c && e && g && i',
        context
      )).toBe(true);

      // Connect many conditions with OR
      expect(evaluateWhenExpression(
        'a || b || c || d || e',
        context
      )).toBe(true);

      // Complex combination
      expect(evaluateWhenExpression(
        '(a && c) || (e && g) || (i && !j)',
        context
      )).toBe(true);
    });

    it('여러 레벨의 논리 연산자와 비교 연산자 조합', () => {
      const context = {
        count: 5,
        maxCount: 10,
        minCount: 1,
        enabled: true,
        mode: 'edit',
        status: 'active'
      };


      // Complex number comparison and logical operations
      expect(evaluateWhenExpression(
        'count > minCount && count < maxCount && enabled',
        context
      )).toBe(true);

      // String comparison and logical operations
      expect(evaluateWhenExpression(
        "mode == 'edit' && status == 'active' && enabled",
        context
      )).toBe(true);

      // All operator combinations (both double and single quotes supported)
      expect(evaluateWhenExpression(
        'count >= minCount && count <= maxCount && enabled && mode == "edit"',
        context
      )).toBe(true);
    });

    it('regex matching combined with other operators', () => {
      const context = {
        resourceFilename: 'docker-compose.yml',
        resourceScheme: 'file',
        editorFocus: true,
        editorEditable: true
      };

      // Regex and logical operations
      expect(evaluateWhenExpression(
        "resourceFilename =~ /docker/ && editorFocus",
        context
      )).toBe(true);

      // Regex and comparison operations
      expect(evaluateWhenExpression(
        "resourceFilename =~ /docker/ && resourceScheme == 'file'",
        context
      )).toBe(true);

      // Regex and complex logical operations
      expect(evaluateWhenExpression(
        "(resourceFilename =~ /docker/ || resourceFilename =~ /compose/) && editorFocus && editorEditable",
        context
      )).toBe(true);
    });

    it('in/not in operators combined with other operators', () => {
      const context = {
        resourceFilename: 'test',
        supportedFolders: ['test', 'foo', 'bar'],
        editorFocus: true,
        selectionEmpty: false
      };

      // in operator and logical operations
      expect(evaluateWhenExpression(
        'resourceFilename in supportedFolders && editorFocus',
        context
      )).toBe(true);

      // not in operator and logical operations
      expect(evaluateWhenExpression(
        'resourceFilename not in supportedFolders || editorFocus',
        context
      )).toBe(true);

      // Complex combination
      expect(evaluateWhenExpression(
        '(resourceFilename in supportedFolders && editorFocus) || !selectionEmpty',
        context
      )).toBe(true);
    });

    it('complex when clause in actual VS Code style', () => {
      const context = {
        editorFocus: true,
        editorEditable: true,
        editorReadonly: false,
        textInputFocus: true,
        inDebugMode: false,
        debuggersAvailable: true,
        activeEditor: 'typescript',
        resourceExtname: '.ts',
        resourceScheme: 'file'
      };

      // Actual VS Code when clause example
      expect(evaluateWhenExpression(
        'debuggersAvailable && !inDebugMode',
        context
      )).toBe(true);

      expect(evaluateWhenExpression(
        'textInputFocus && !editorReadonly',
        context
      )).toBe(true);

      expect(evaluateWhenExpression(
        "editorFocus && resourceExtname == '.ts' && resourceScheme == 'file'",
        context
      )).toBe(true);
    });

    it('negation operators and complex expressions', () => {
      const context = {
        a: true,
        b: false,
        c: true,
        d: false
      };

      // Multiple negation operators
      expect(evaluateWhenExpression(
        '!a && !b',
        context
      )).toBe(false); // !true && !false = false && true = false

      expect(evaluateWhenExpression(
        '!(a && b)',
        context
      )).toBe(true); // !(true && false) = !false = true

      expect(evaluateWhenExpression(
        '!a || !b',
        context
      )).toBe(true); // !true || !false = false || true = true

      // Nested negation
      expect(evaluateWhenExpression(
        '!(!a && !b)',
        context
      )).toBe(true); // !(false && true) = !false = true
    });

    it('복잡한 조건부 로직 (if-else와 유사한 패턴)', () => {
      const context = {
        condition1: true,
        condition2: false,
        condition3: true,
        value: 5,
        threshold: 10
      };

      // if (condition1 && condition2) || (condition3 && value < threshold)
      expect(evaluateWhenExpression(
        '(condition1 && condition2) || (condition3 && value < threshold)',
        context
      )).toBe(true);

      // if !condition1 || (condition2 && condition3)
      expect(evaluateWhenExpression(
        '!condition1 || (condition2 && condition3)',
        context
      )).toBe(false); // !true || (false && true) = false || false = false
    });

    it('very long complex expressions', () => {
      const context = {
        a: true,
        b: false,
        c: true,
        d: false,
        e: true,
        f: false,
        g: true,
        h: false
      };

      // Very long expression
      const longExpr = 'a && !b && c && !d && e && !f && g && !h';
      expect(evaluateWhenExpression(longExpr, context)).toBe(true);

      // Very long OR expression
      const longOrExpr = 'a || b || c || d || e || f || g || h';
      expect(evaluateWhenExpression(longOrExpr, context)).toBe(true);
    });

    it('expressions using same context key multiple times', () => {
      const context = {
        mode: 'edit',
        count: 5
      };

      // Use same key multiple times
      expect(evaluateWhenExpression(
        "mode == 'edit' && mode != 'view' && mode != 'preview'",
        context
      )).toBe(true);

      expect(evaluateWhenExpression(
        'count > 0 && count < 10 && count != 3',
        context
      )).toBe(true);
    });

    it('complex string comparison and logical operations', () => {
      const context = {
        type1: 'image',
        type2: 'video',
        type3: 'audio',
        currentType: 'image'
      };

      // Multiple string comparisons
      expect(evaluateWhenExpression(
        "currentType == type1 || currentType == type2 || currentType == type3",
        context
      )).toBe(true);

      expect(evaluateWhenExpression(
        "currentType != type2 && currentType != type3",
        context
      )).toBe(true);
    });

    it('complex number comparison and logical operation combinations', () => {
      const context = {
        count: 5,
        max: 10,
        min: 1,
        threshold: 7
      };

      // Complex number comparison
      expect(evaluateWhenExpression(
        'count >= min && count <= max && count < threshold',
        context
      )).toBe(true);

      expect(evaluateWhenExpression(
        'count > min && count < max && count != threshold',
        context
      )).toBe(true);
    });

    it('complex scenarios usable in actual extensions', () => {
      const context = {
        editorFocus: true,
        editorEditable: true,
        selectionEmpty: false,
        selectionType: 'range',
        'readOnlyExtension.enabled': false,
        'modeExtension.currentMode': 'markdown',
        'loadingStateExtension.isLoading': false,
        'errorStateExtension.hasError': false,
        'dragDropExtension.isDragging': false,
        'nodeTypeExtension.isImage': false,
        'multiSelectionExtension.hasMultiple': false,
        historyCanUndo: true,
        historyCanRedo: false
      };

      // Very complex real-world usage scenario
      expect(evaluateWhenExpression(
        'editorFocus && editorEditable && !selectionEmpty && selectionType == "range" && !readOnlyExtension.enabled && modeExtension.currentMode == "markdown" && !loadingStateExtension.isLoading && !errorStateExtension.hasError && !dragDropExtension.isDragging',
        context
      )).toBe(true);

      // Complex history-related conditions
      expect(evaluateWhenExpression(
        '(historyCanUndo || historyCanRedo) && editorEditable && !readOnlyExtension.enabled',
        context
      )).toBe(true);
    });
  });
});