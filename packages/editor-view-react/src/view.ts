import type { EditorViewReactApi, EditorViewReactOptions } from './types';
import { BarocssProvider } from '@barocss/renderer-react';
import type { ReactNode } from 'react';

export function createEditorViewReact(options: EditorViewReactOptions): EditorViewReactApi {
  const { schema, model, store } = options;

  function Provider({ children }: { children: ReactNode }) {
    return (
      // @ts-expect-error: JSX runtime without React import in emit
      <BarocssProvider schema={schema} model={model} store={store}>
        {children}
      </BarocssProvider>
    );
  }

  return { Provider };
}


