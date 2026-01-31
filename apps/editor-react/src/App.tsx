import { useEffect, useMemo, useRef } from 'react';
import { DataStore } from '@barocss/datastore';
import { Editor } from '@barocss/editor-core';
import { Devtool } from '@barocss/devtool';
import { createSchema } from '@barocss/schema';
import { getGlobalRegistry } from '@barocss/dsl';
import { createCoreExtensions, createBasicExtensions } from '@barocss/extensions';
import { EditorView } from '@barocss/editor-view-react';
import { registerRenderers } from './register-renderers';
import { initialTree } from './document-data';
import { editorTestSchemaConfig } from './schema';

export function App() {
  registerRenderers();

  const editor = useMemo(() => {
    const schema = createSchema('editor-react', editorTestSchemaConfig);
    const dataStore = new DataStore(undefined, schema);
    const coreExtensions = createCoreExtensions();
    const basicExtensions = createBasicExtensions();
    const ed = new Editor({
      dataStore,
      schema,
      editable: true,
      extensions: [...coreExtensions, ...basicExtensions],
    });
    ed.loadDocument(initialTree, 'editor-react');
    return ed;
  }, []);

  const devtoolContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = devtoolContainerRef.current;
    if (!editor || !container) return;
    const devtool = new Devtool({
      editor,
      maxEvents: 500,
      debug: false,
      enableAutoTracing: true,
      container,
    });
    return () => {
      devtool.destroy();
    };
  }, [editor]);

  return (
    <div className="editor-react-app">
      <div className="split-layout-left">
        <EditorView
          editor={editor}
          options={{
            className: 'editor-view-root',
            registry: getGlobalRegistry(),
            layers: {
              content: { className: 'document editor-content', editable: true },
            },
          }}
        />
      </div>
      <div ref={devtoolContainerRef} className="split-layout-right" id="devtool-container" />
    </div>
  );
}
