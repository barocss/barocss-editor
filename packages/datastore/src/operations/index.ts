/**
 * DataStore Operations - 체계적으로 분리된 연산들
 * 
 * DataStore의 다양한 기능들을 논리적으로 그룹화하여
 * 별도의 클래스들로 분리하여 관리합니다.
 */

// Core Operations
export { CoreOperations } from './core-operations';

// Query Operations  
export { QueryOperations } from './query-operations';

// Content Management Operations
export { ContentOperations } from './content-operations';

// Split & Merge Operations
export { SplitMergeOperations } from './split-merge-operations';

// Mark Management Operations
export { MarkOperations } from './mark-operations';

// Decorator Management Operations
export { DecoratorOperations } from './decorator-operations';
export type { DecoratorRange, TextEdit } from './decorator-operations';

// Utility Operations
export { UtilityOperations } from './utility-operations';
// Range-based text and mark operations
export { RangeOperations } from './range-operations';
export { SerializationOperations } from './serialization-operations';