import React, { useEffect, useRef } from 'react';
import { mountEditor } from '../../.generated/quick-start';

export default function EditorDemo({ className = 'editor-demo' }: { className?: string }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current) return;
    return mountEditor(container.current);
  }, []);
  return <div ref={container} className={className} />;
}
