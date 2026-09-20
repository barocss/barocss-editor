# @barocss/query-editor

Structured search input with filter chips, suggestions, and a separate JQL dialect.

## Purpose

Use the React entry for a UI, /core for structured query parsing, or /jql for Jira-style expressions and suggestions.

## Install

```sh
npm install @barocss/query-editor react react-dom
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/query-editor` | Public JavaScript and TypeScript API |
| `@barocss/query-editor/core` | Headless query API |
| `@barocss/query-editor/react` | React components |
| `@barocss/query-editor/jql` | Headless JQL API |
| `@barocss/query-editor/style.css` | Stylesheet |

Import only these public paths. Source paths such as `@barocss/query-editor/src/...` are not part of the published API.

## Usage

```tsx
import { useState } from 'react';
import { QueryEditor } from '@barocss/query-editor/react';
import type { QueryDocument, QueryOperator } from '@barocss/query-editor/core';
import '@barocss/query-editor/style.css';

const operators: QueryOperator[] = [{
  key: 'type', label: 'Type', multiple: true,
  options: [{ value: 'document', label: 'Document' }, { value: 'comment', label: 'Comment' }],
}];
export function Search() {
  const [query, setQuery] = useState<QueryDocument>({ text: '', filters: [] });
  return <QueryEditor value={query} operators={operators} onChange={setQuery}
    onSubmit={(document, source) => console.log(document, source)} />;
}
```

## Peer dependencies

- `react`: `>=18`.
- `react-dom`: `>=18`.

## Styles

Import `@barocss/query-editor/style.css` once in the host.

## Headless parsing

```ts
import { parseQuery, stringifyQuery } from '@barocss/query-editor/core';
import { parseJql } from '@barocss/query-editor/jql';

const query = parseQuery('weekly report');
console.log(stringifyQuery(query));
const jql = parseJql('project = PRODUCT ORDER BY updated DESC');
console.log(jql.valid);
```

For advanced search UI, import `JqlEditor` from `/react` and supply the field/value catalogue appropriate for your Jira instance. The host still executes the search.

## Integration notes

The host supplies operators and values, executes searches, and owns credentials. Unknown key:value expressions stay free text unless the operator is registered. JQL parsing does not send requests to Jira.

## Documentation

- [Package guide](https://editor.barocss.com/packages/query-editor)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/query-editor)

## License

MIT. The published archive includes the license in `dist/LICENSE`.
