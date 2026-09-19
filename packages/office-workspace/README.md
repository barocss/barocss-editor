# Wonffice local workspace

Note, Word, Slides, Site share a local catalog and navigation contract. Editor models remain product-owned. This package does not provide accounts, server storage, permissions, or collaborative editing.

## JavaScript API

```ts
import {
  OfficeWorkspace, workspaceIdentity, documentURL
} from '@barocss/office-workspace';

const workspace = new OfficeWorkspace(workspaceIdentity());
const id = await workspace.create('word', 'Weekly report');
const address = { workspace: workspace.id, product: 'word' as const, id };
location.assign(documentURL(address));

// Run in the library, after the current editor has saved and closed.
const rows = await workspace.list();
await workspace.update(`word:${id}`, { favorite: true, folder: 'Reports' });
const copyId = await workspace.copy('word', id);
await workspace.link(`word:${copyId}`, `word:${id}`);

const archive = await workspace.backup();
await workspace.restore(archive); // New IDs. Existing files remain unchanged.
```

`productCodec(product)` loads the product's `./workspace` entry. Each adapter supplies `create`, `read`, `text`, and `schema`. Importing the catalog does not mount an editor. `readProductDocument` validates a file before a restore or cross-product copy writes it.

## React UI

```tsx
import { WorkspaceHome } from '@barocss/office-workspace/ui';
import { ProductNavigation } from '@barocss/office-workspace/host';
import '@barocss/office-ui/tokens.css';
import '@barocss/office-workspace/style.css';

// Library entry:
<WorkspaceHome />;
// Editor entry, outside the product's #root:
<ProductNavigation />;
```

Include `office-ui/src` and `office-workspace/src` in the host's Tailwind source list. The included `apps/office` host does this. Product pages retain their own existing styles.

## Editor lifecycle

```ts
import { registerProductDocumentHost } from '@barocss/shared';

const stop = registerProductDocumentHost({
  product: 'word',
  id: () => activeFileId, // Durable file ID, never a runtime node ID.
  beforeNavigate: async () => {
    await nestedEditors.flush();
    return storage.flush(); // false leaves the current editor open.
  }
});
// On host disposal:
stop();
```

The shared `DocumentSession` registers this contract for Word, Slides, and Site. Note connects its workspace flush, including nested sessions. Navigation checks both the mounted host and file identity after saving. The editor surface cannot accept new input while a product switch is being saved. A failed save restores editing and keeps the page open.

## Storage and migration

- One local workspace per origin. Product pages use `/products/{product}/index.html` on that origin.
- A global address contains workspace ID, product key, and durable document ID.
- Catalog metadata has separate revisions. Favorites, folder labels, and references cannot overwrite document bytes. Note's native favorite/trash metadata is kept consistent with the catalog.
- Existing product stores stay in place. Switching products reloads the product host, so renderer registries, styles, and global input listeners remain isolated. In-memory undo history belongs to the open editor session.
- `importFile` accepts native product JSON, existing Note workspace backups, product-library backups, and Wonffice workspace backups. It validates all entries first and restores to new IDs. Note page references and included workspace references are remapped.
- Restoring multiple product stores is not one cross-database transaction. If storage fails, the error reports the number of copies already written. Existing files and the source backup remain unchanged.
- `backup` includes stored documents, trash, and recovery drafts. External URLs remain external; the archive does not fetch or embed remote assets.
- Different development ports have separate browser storage. Export from the original product's library, then import the file in Wonffice. Original libraries are preserved.
- `noteToSite` makes an independent Site body copy and adds a source reference. Unsupported blocks and Note page references are refused before writing. It does not create a live synchronized embed.

Run `pnpm dev:office`. The local host uses port 5186. `pnpm build:office` builds all five HTML entries, including the four existing product hosts without copying their source.
