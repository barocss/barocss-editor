# Package boundaries

Choose the lowest shared layer that owns the behavior. Do not put product commands into a generic button or depend on Word just to reuse a table operation.

| Layer | Owns | Does not own |
| --- | --- | --- |
| `office-ui` | React primitives, tokens, overlays, menus, panels | Editor commands or document state |
| `office-controls` | Command/property declarations and state helpers | Rendering or command registration |
| `office-editor-ui` | Editor subscriptions, selection-aware controls, command execution | A product's complete command catalogue or storage |
| `office-icons` | Shared named SVG icons | Button labels or business actions |
| `office-text` | Prose, formatting, tables, math rendering | Word page layout or application navigation |
| `office-canvas` | Geometry, manipulation, connectors, canvas layout | The viewport or pointer-event ownership |
| Product packages | Note, Word, Slides, and Site schemas and behavior | Tenant accounts and cloud deployment |
| `office-workspace` | Local document catalogue and navigation | Hosted workspace services |

## Framework boundaries

The DOM view and React view are different browser integrations over the editor foundations. Office UI components are React components. Product root exports and `/ui` or `/view` exports are separated so callers can choose the API they need. Import only documented public entry points.

The query editor exposes `/core` and `/jql` for headless parsing, and `/react` for components. Its root includes React exports; use the headless subpaths when you only need parsing.

## Lifecycle boundaries

The host creates and disposes editing sessions. Shared UI reads state and sends commands. Storage receives snapshots or native files. Navigation waits for the host's save contract. A note embedded in another document has a separate editing session and an explicit change-delivery boundary.

## Keep documentation aligned

Package manifests define exports and versions. Package README files define onboarding and integration notes. The site catalogue reuses these sources at build time. Add a new package to the documentation group map and document its public paths; CI rejects missing coverage.
