// import { ReactNode } from 'react';
// import { INode } from '@barocss/model';

export interface BaseNodeProps {
  data: any;
  isSelected?: boolean;
  isFocused?: boolean;
  isHovered?: boolean;
  onSelect?: (nodeId: string) => void;
  onEdit?: (nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
}

export interface TextNodeProps extends BaseNodeProps {
  data: {
    id: string;
    type: 'text';
    text: string;
    attributes: {
      bold: boolean;
      italic: boolean;
      color?: string;
    };
  };
}

export interface ParagraphNodeProps extends BaseNodeProps {
  data: {
    id: string;
    type: 'paragraph';
    attributes: {
      align?: string;
      indent?: number;
    };
    content: INode[];
  };
}

export interface ImageNodeProps extends BaseNodeProps {
  data: {
    id: string;
    type: 'image';
    attributes: {
      src: string;
      alt?: string;
      width?: number;
      height?: number;
    };
  };
}

export interface LinkNodeProps extends BaseNodeProps {
  data: {
    id: string;
    type: 'link';
    attributes: {
      href: string;
      target?: string;
      color?: string;
    };
    content: INode[];
  };
}

export interface ListNodeProps extends BaseNodeProps {
  data: {
    id: string;
    type: 'list';
    attributes: {
      type?: string;
    };
    content: INode[];
  };
}

export interface ListItemNodeProps extends BaseNodeProps {
  data: {
    id: string;
    type: 'listItem';
    attributes: {
      level?: number;
      type?: string;
    };
    content: INode[];
  };
}

export interface TableNodeProps extends BaseNodeProps {
  data: {
    id: string;
    type: 'table';
    content: INode[];
  };
}

export interface TableRowNodeProps extends BaseNodeProps {
  data: {
    id: string;
    type: 'tableRow';
    content: INode[];
  };
}

export interface TableCellNodeProps extends BaseNodeProps {
  data: {
    id: string;
    type: 'tableCell';
    attributes: {
      colspan?: number;
      rowspan?: number;
      align?: string;
    };
    content: INode[];
  };
}

export interface ReactRendererDefinition {
  type: 'react';
  nodeType: string;
  component: React.ComponentType<any>;
  props?: (data: any) => any;
}

export interface EditorContextType {
  theme: 'light' | 'dark';
  readOnly: boolean;
  selection: {
    isSelected: (nodeId: string) => boolean;
    getSelectionRange: (nodeId: string) => Range | null;
  };
  actions: {
    onNodeClick: (nodeId: string) => void;
    onNodeEdit: (nodeId: string) => void;
    onNodeDelete: (nodeId: string) => void;
  };
}

export type TNodeType = string;
