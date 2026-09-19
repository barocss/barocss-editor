# @barocss/query-editor

`@barocss/query-editor` is an embeddable structured search input. It combines free text, filter chips, operator suggestions, and value suggestions. The host owns search execution, persistence, and remote data.

The core parser has no UI dependency. The React component has no dependency on the Barocss Office packages.

## Install

```sh
npm install @barocss/query-editor react react-dom
```

Load the stylesheet once.

```tsx
import { QueryEditor, type QueryDocument, type QueryOperator } from '@barocss/query-editor';
import '@barocss/query-editor/style.css';

const operators: QueryOperator[] = [
  {
    key: 'from',
    label: '작성자',
    kind: 'person',
    multiple: true,
    options: [
      { value: 'minsu', label: '김민수', description: '제품팀' },
      { value: 'jiho', label: '박지호', description: '디자인팀' },
    ],
  },
  {
    key: 'type',
    label: '유형',
    multiple: true,
    options: [
      { value: 'document', label: '문서' },
      { value: 'comment', label: '댓글' },
    ],
  },
  { key: 'after', label: '시작일', kind: 'date', multiple: false },
];

export function Search() {
  const [query, setQuery] = useState<QueryDocument>({ text: '', filters: [] });
  return <QueryEditor
    value={query}
    operators={operators}
    onChange={setQuery}
    onSubmit={(document, source) => runSearch({ document, source })}
  />;
}
```

Type an operator name, such as `from`, and select it. Type a complete expression, such as `from:minsu`, and press Space to turn it into a filter chip. Enter submits the current query. Backspace removes the last filter when the text input is empty.

## Core API

```ts
import { parseQuery, stringifyQuery } from '@barocss/query-editor/core';

const document = parseQuery('예산안 from:minsu in:"기획 팀" -has:attachment');
const source = stringifyQuery(document);
```

`parseQuery` only extracts registered operators. Unknown `key:value` text remains free text. This prevents a host from silently changing text that belongs to its users.

## Jira JQL compatibility

Use the separate JQL dialect when a product needs Jira-style advanced search. It keeps Boolean groups and sorting in an expression tree. It also supplies cursor-aware field, operator, value, function, keyword, and sort suggestions.

```tsx
import { JqlEditor, type JqlParseResult } from '@barocss/query-editor';

export function JiraSearch() {
  const [jql, setJql] = useState('project = PRODUCT');
  return <JqlEditor
    value={jql}
    onChange={setJql}
    onSubmit={(source, result) => result.valid && runJiraSearch(source)}
  />;
}
```

The built-in catalog covers common fields and functions. Supply a `catalog` prop to match each Jira site, including custom fields and remote values. The parser supports comparison operators, `IN`, `IS`, `WAS`, `CHANGED`, `AND`, `OR`, `NOT`, parentheses, functions, and `ORDER BY`. The host still owns Jira authentication and request execution.

For a headless integration, import `parseJql`, `stringifyJql`, `getJqlSuggestions`, and `applyJqlSuggestion` from `@barocss/query-editor/jql`.

## Styling

Override CSS custom properties on a parent element.

```css
.my-search {
  --barocss-query-accent: #7057d9;
  --barocss-query-accent-soft: #f1edff;
  --barocss-query-radius: 8px;
}
```

## Boundaries

- The package does not send search requests.
- The package does not store recent searches.
- The package does not define access control.
- Option data is supplied by the host. Update the `operators` prop when remote results arrive.
