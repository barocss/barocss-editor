import type { Schema } from '@barocss/schema';

export interface IMark {
  stype: string;
  attrs?: Record<string, any>;
  range?: [number, number];
}


export interface INode {
  sid?: string;
  stype: string;
  attributes?: Record<string, any>;
  content?: (INode | string)[];
  text?: string;
  marks?: IMark[]; // Mark만 노드 레벨에서 관리
  parentId?: string;
  metadata?: Record<string, any>;
  version?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Document {
  sid?: string;
  stype?: string;
  content?: INode[];
  contentIds?: string[];
  attributes?: Record<string, any>;
  metadata?: {
    title?: string;
    author?: string;
    version?: string;
    createdAt?: Date;
    updatedAt?: Date;
  };
  schema?: Schema;
  version?: number;
}

export type RootDocument = Document;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}