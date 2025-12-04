import type { Schema } from '@barocss/schema';
import type { Model } from '@barocss/model';
import type { DataStore } from '@barocss/datastore';
import type { ReactNode } from 'react';

export interface EditorViewReactOptions {
  schema: Schema;
  model: Model;
  store: DataStore;
}

export interface EditorViewReactApi {
  Provider: (props: { children: ReactNode }) => ReactNode;
}


