import { useState, useEffect, useCallback, useMemo } from 'react';
import { useEditor } from './context.js';

// useEditor를 다시 export
export { useEditor };

// 선택 상태 훅
export const useNodeSelection = (nodeId: string) => {
  const { selection } = useEditor();
  const [isSelected, setIsSelected] = useState(false);
  
  useEffect(() => {
    const updateSelection = () => {
      setIsSelected(selection.isSelected(nodeId));
    };
    
    updateSelection();
    document.addEventListener('selectionchange', updateSelection);
    return () => document.removeEventListener('selectionchange', updateSelection);
  }, [nodeId, selection]);
  
  return isSelected;
};

// 노드 액션 훅
export const useNodeActions = (nodeId: string) => {
  const { actions, readOnly } = useEditor();
  
  const handleClick = useCallback(() => {
    if (!readOnly) actions.onNodeClick(nodeId);
  }, [nodeId, readOnly, actions]);
  
  const handleEdit = useCallback(() => {
    if (!readOnly) actions.onNodeEdit(nodeId);
  }, [nodeId, readOnly, actions]);
  
  const handleDelete = useCallback(() => {
    if (!readOnly) actions.onNodeDelete(nodeId);
  }, [nodeId, readOnly, actions]);
  
  return { handleClick, handleEdit, handleDelete };
};

// 스타일 훅
export const useNodeStyle = (attributes: any) => {
  const { theme } = useEditor();
  
  return useMemo(() => ({
    fontWeight: attributes.bold ? 'bold' : 'normal',
    fontStyle: attributes.italic ? 'italic' : 'normal',
    color: attributes.color || 'inherit',
    backgroundColor: theme === 'dark' ? '#333' : '#fff'
  }), [attributes.bold, attributes.italic, attributes.color, theme]);
};

// 노드 상태 훅
export const useNodeState = (nodeId: string) => {
  const { selection } = useEditor();
  const [isSelected, setIsSelected] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  
  useEffect(() => {
    const updateSelection = () => {
      setIsSelected(selection.isSelected(nodeId));
    };
    
    updateSelection();
    document.addEventListener('selectionchange', updateSelection);
    return () => document.removeEventListener('selectionchange', updateSelection);
  }, [nodeId, selection]);
  
  return { isSelected, isHovered, setIsHovered };
};
