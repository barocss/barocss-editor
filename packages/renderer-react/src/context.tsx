import React, { createContext, useContext, useState, ReactNode } from 'react';
import { EditorContextType } from './types';

const EditorContext = createContext<EditorContextType | null>(null);

export interface EditorProviderProps {
  children: ReactNode;
  theme?: 'light' | 'dark';
  readOnly?: boolean;
  onNodeClick?: (nodeId: string) => void;
  onNodeEdit?: (nodeId: string) => void;
  onNodeDelete?: (nodeId: string) => void;
}

export const EditorProvider: React.FC<EditorProviderProps> = ({ 
  children, 
  theme = 'light',
  readOnly = false,
  onNodeClick,
  onNodeEdit,
  onNodeDelete
}) => {
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  
  const selection = {
    isSelected: (nodeId: string) => selectedNodes.has(nodeId),
    getSelectionRange: (nodeId: string) => {
      // 선택 범위 로직
      return null;
    }
  };
  
  const actions = {
    onNodeClick: (nodeId: string) => {
      setSelectedNodes(new Set([nodeId]));
      onNodeClick?.(nodeId);
    },
    onNodeEdit: (nodeId: string) => {
      onNodeEdit?.(nodeId);
    },
    onNodeDelete: (nodeId: string) => {
      onNodeDelete?.(nodeId);
    }
  };
  
  const value: EditorContextType = {
    theme,
    readOnly,
    selection,
    actions
  };
  
  return (
    <EditorContext.Provider value={value}>
      {children}
    </EditorContext.Provider>
  );
};

// Context Hook
export const useEditor = (): EditorContextType => {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error('useEditor must be used within EditorProvider');
  }
  return context;
};
