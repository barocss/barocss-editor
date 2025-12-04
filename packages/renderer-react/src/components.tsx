import React, { useCallback, useMemo, useState } from 'react';
import { 
  TextNodeProps, 
  ParagraphNodeProps, 
  ImageNodeProps, 
  LinkNodeProps,
  ListNodeProps,
  ListItemNodeProps,
  TableNodeProps,
  TableRowNodeProps,
  TableCellNodeProps
} from './types';
import { useEditor, useNodeSelection, useNodeActions, useNodeStyle, useNodeState } from './hooks.js';

// 텍스트 렌더러
export const TextRenderer: React.FC<TextNodeProps> = ({ data, isSelected, onSelect }) => {
  const { theme } = useEditor();
  
  const handleClick = useCallback(() => {
    onSelect?.(data.sid);
  }, [data.sid, onSelect]);
  
  const style = useMemo(() => ({
    fontWeight: data.attributes.bold ? 'bold' : 'normal',
    fontStyle: data.attributes.italic ? 'italic' : 'normal',
    color: data.attributes.color || 'inherit',
    backgroundColor: isSelected ? '#e3f2fd' : 'transparent'
  }), [data.attributes, isSelected]);
  
  return (
    <span 
      className={`text-node theme-${theme} ${isSelected ? 'selected' : ''}`}
      style={style}
      onClick={handleClick}
    >
      {data.text}
    </span>
  );
};

// 문단 렌더러
export const ParagraphRenderer: React.FC<ParagraphNodeProps> = ({ data, isSelected, onSelect }) => {
  const { theme, readOnly } = useEditor();
  
  const handleClick = useCallback(() => {
    if (!readOnly) {
      onSelect?.(data.sid);
    }
  }, [data.sid, readOnly, onSelect]);
  
  const style = useMemo(() => ({
    textAlign: (data.attributes.align || 'left') as 'left' | 'center' | 'right' | 'justify',
    textIndent: `${(data.attributes.indent || 0) * 20}px`
  }), [data.attributes]);
  
  return (
    <p 
      className={`paragraph theme-${theme} ${isSelected ? 'selected' : ''} ${readOnly ? 'readonly' : ''}`}
      style={style}
      onClick={handleClick}
    >
      {data.content.map(child => (
        <NodeRenderer key={child.sid} node={child} />
      ))}
    </p>
  );
};

// 이미지 렌더러
export const ImageRenderer: React.FC<ImageNodeProps> = ({ data, isSelected, onSelect }) => {
  const { theme } = useEditor();
  const [, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  
  const handleClick = useCallback(() => {
    onSelect?.(data.sid);
  }, [data.sid, onSelect]);
  
  const handleLoad = useCallback(() => {
    setIsLoaded(true);
    setHasError(false);
  }, []);
  
  const handleError = useCallback(() => {
    setHasError(true);
    setIsLoaded(false);
  }, []);
  
  const style = useMemo(() => ({
    width: data.attributes.width ? `${data.attributes.width}px` : 'auto',
    height: data.attributes.height ? `${data.attributes.height}px` : 'auto',
    maxWidth: '100%',
    border: isSelected ? '2px solid #007ACC' : '1px solid #ddd'
  }), [data.attributes, isSelected]);
  
  if (hasError) {
    return (
      <div 
        className={`image-error theme-${theme}`}
        style={style}
        onClick={handleClick}
      >
        <span>Failed to load image</span>
      </div>
    );
  }
  
  return (
    <img
      src={data.attributes.src}
      alt={data.attributes.alt || ''}
      className={`image-node theme-${theme} ${isSelected ? 'selected' : ''}`}
      style={style}
      onClick={handleClick}
      onLoad={handleLoad}
      onError={handleError}
    />
  );
};

// 링크 렌더러
export const LinkRenderer: React.FC<LinkNodeProps> = ({ data, isSelected, onSelect }) => {
  const { theme } = useEditor();
  
  const handleClick = useCallback((event: React.MouseEvent) => {
    if (data.attributes.target === '_blank') {
      event.preventDefault();
      window.open(data.attributes.href, '_blank');
    }
    onSelect?.(data.sid);
  }, [data.attributes, data.sid, onSelect]);
  
  const style = useMemo(() => ({
    color: data.attributes.color || '#007ACC',
    textDecoration: 'underline'
  }), [data.attributes]);
  
  return (
    <a
      href={data.attributes.href}
      target={data.attributes.target || '_self'}
      className={`link-node theme-${theme} ${isSelected ? 'selected' : ''}`}
      style={style}
      onClick={handleClick}
    >
      {data.content.map(child => (
        <NodeRenderer key={child.sid} node={child} />
      ))}
    </a>
  );
};

// 리스트 아이템 렌더러
export const ListItemRenderer: React.FC<ListItemNodeProps> = ({ data, isSelected, onSelect }) => {
  const { theme } = useEditor();
  
  const handleClick = useCallback(() => {
    onSelect?.(data.sid);
  }, [data.sid, onSelect]);
  
  const style = useMemo(() => ({
    marginLeft: `${(data.attributes.level || 0) * 20}px`,
    listStyleType: data.attributes.type === 'number' ? 'decimal' : 'disc'
  }), [data.attributes]);
  
  return (
    <li 
      className={`list-item theme-${theme} ${isSelected ? 'selected' : ''}`}
      style={style}
      onClick={handleClick}
    >
      {data.content.map(child => (
        <NodeRenderer key={child.sid} node={child} />
      ))}
    </li>
  );
};

// 리스트 렌더러
export const ListRenderer: React.FC<ListNodeProps> = ({ data, isSelected, onSelect }) => {
  const { theme } = useEditor();
  
  const handleClick = useCallback(() => {
    onSelect?.(data.sid);
  }, [data.sid, onSelect]);
  
  const style = useMemo(() => ({
    listStyleType: data.attributes.type === 'number' ? 'decimal' : 'disc'
  }), [data.attributes]);
  
  return (
    <ul 
      className={`list theme-${theme} ${isSelected ? 'selected' : ''}`}
      style={style}
      onClick={handleClick}
    >
      {data.content.map(child => (
        <NodeRenderer key={child.sid} node={child} />
      ))}
    </ul>
  );
};

// 테이블 셀 렌더러
export const TableCellRenderer: React.FC<TableCellNodeProps> = ({ data, isSelected, onSelect }) => {
  const { theme } = useEditor();
  
  const handleClick = useCallback(() => {
    onSelect?.(data.sid);
  }, [data.sid, onSelect]);
  
  const style = useMemo(() => ({
    border: '1px solid #ddd',
    padding: '8px',
    textAlign: (data.attributes.align || 'left') as 'left' | 'center' | 'right' | 'justify'
  }), [data.attributes]);
  
  return (
    <td
      colSpan={data.attributes.colspan || 1}
      rowSpan={data.attributes.rowspan || 1}
      className={`table-cell theme-${theme} ${isSelected ? 'selected' : ''}`}
      style={style}
      onClick={handleClick}
    >
      {data.content.map(child => (
        <NodeRenderer key={child.sid} node={child} />
      ))}
    </td>
  );
};

// 테이블 행 렌더러
export const TableRowRenderer: React.FC<TableRowNodeProps> = ({ data, isSelected, onSelect }) => {
  const { theme } = useEditor();
  
  const handleClick = useCallback(() => {
    onSelect?.(data.sid);
  }, [data.sid, onSelect]);
  
  return (
    <tr 
      className={`table-row theme-${theme} ${isSelected ? 'selected' : ''}`}
      onClick={handleClick}
    >
      {data.content.map(child => (
        <NodeRenderer key={child.sid} node={child} />
      ))}
    </tr>
  );
};

// 테이블 렌더러
export const TableRenderer: React.FC<TableNodeProps> = ({ data, isSelected, onSelect }) => {
  const { theme } = useEditor();
  
  const handleClick = useCallback(() => {
    onSelect?.(data.sid);
  }, [data.sid, onSelect]);
  
  const style = useMemo(() => ({
    borderCollapse: 'collapse' as 'collapse' | 'separate',
    width: '100%'
  }), []);
  
  return (
    <table 
      className={`table theme-${theme} ${isSelected ? 'selected' : ''}`}
      style={style}
      onClick={handleClick}
    >
      {data.content.map(child => (
        <NodeRenderer key={child.sid} node={child} />
      ))}
    </table>
  );
};

// 노드 렌더러 (placeholder - 실제로는 registry에서 가져와야 함)
const NodeRenderer: React.FC<{ node: any }> = ({ node }) => {
  return <div>Node: {node.type}</div>;
};
