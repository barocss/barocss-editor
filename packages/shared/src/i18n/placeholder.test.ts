import { describe, it, expect } from 'vitest';
import { replacePlaceholders } from './placeholder';

describe('replacePlaceholders', () => {
  it('should return original message when params is undefined', () => {
    const message = 'Hello, {name}!';
    expect(replacePlaceholders(message)).toBe('Hello, {name}!');
  });

  it('should return original message when params is empty', () => {
    const message = 'Hello, {name}!';
    expect(replacePlaceholders(message, {})).toBe('Hello, {name}!');
  });

  it('should replace single placeholder', () => {
    const message = 'Hello, {name}!';
    expect(replacePlaceholders(message, { name: 'World' })).toBe('Hello, World!');
  });

  it('should replace multiple placeholders', () => {
    const message = 'Count: {count}, Total: {total}';
    expect(replacePlaceholders(message, { count: 10, total: 100 })).toBe(
      'Count: 10, Total: 100'
    );
  });

  it('should handle number params', () => {
    const message = 'Count: {count}';
    expect(replacePlaceholders(message, { count: 42 })).toBe('Count: 42');
  });

  it('should handle string params', () => {
    const message = 'Name: {name}';
    expect(replacePlaceholders(message, { name: 'Alice' })).toBe('Name: Alice');
  });

  it('should keep unmatched placeholders', () => {
    const message = 'Hello, {name}! {missing}';
    expect(replacePlaceholders(message, { name: 'World' })).toBe('Hello, World! {missing}');
  });

  it('should handle empty string params', () => {
    const message = 'Name: {name}';
    expect(replacePlaceholders(message, { name: '' })).toBe('Name: ');
  });

  it('should handle zero as param value', () => {
    const message = 'Count: {count}';
    expect(replacePlaceholders(message, { count: 0 })).toBe('Count: 0');
  });

  it('should handle complex message with multiple placeholders', () => {
    const message = 'Error: {error} at line {line}, column {column}';
    expect(
      replacePlaceholders(message, {
        error: 'Syntax error',
        line: 10,
        column: 5,
      })
    ).toBe('Error: Syntax error at line 10, column 5');
  });
});

