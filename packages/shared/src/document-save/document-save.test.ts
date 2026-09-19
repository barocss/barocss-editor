import { describe, it, expect, vi } from 'vitest';
import { DocumentSaveQueue } from './document-save';
import { LibraryRevisionConflict } from '../document-library/document-library';

const store = () => ({ keep: vi.fn().mockResolvedValue({ revision: 1 }) });
describe('conditional document writes', () => {
  it('updates the revision of an edit captured during an in-flight write', async () => {
    let release!: (row: { revision: number }) => void;
    const main = store(), drafts = store();
    main.keep.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const queue = new DocumentSaveQueue(main as never, drafts as never, () => {});
    queue.capture({ name: 'a' }, 'first');
    const writing = queue.flush();
    await Promise.resolve();
    queue.capture({ name: 'a' }, 'second');
    release({ revision: 4 });
    expect(await writing).toBe(false);
    expect(await queue.flush()).toBe(true);
    expect(main.keep).toHaveBeenLastCalledWith({ name: 'a' }, 'second', { expectedRevision: 4 });
  });
  it('keeps a failed snapshot for retry without replacing another document', async () => {
    const main = store(); main.keep.mockRejectedValueOnce(new Error('Disk full'));
    const queue = new DocumentSaveQueue(main as never, store() as never, () => {});
    queue.capture({ name: 'a' }, 'A');
    expect(await queue.flush()).toBe(false);
    queue.capture({ name: 'b' }, 'B');
    expect(await queue.flush()).toBe(true);
    expect(main.keep.mock.calls.map(call => [call[0].name, call[1]])).toEqual([['a', 'A'], ['a', 'A'], ['b', 'B']]);
  });
  it('keeps conflicts in one separate draft and never retries overwriting the original', async () => {
    const main = store(), drafts = store();
    main.keep.mockRejectedValueOnce(new LibraryRevisionConflict(1, undefined));
    const queue = new DocumentSaveQueue(main as never, drafts as never, () => {});
    queue.adopt('a', 1);
    queue.capture({ name: 'a', title: 'A' }, 'draft');
    expect(await queue.flush()).toBe(true);
    queue.capture({ name: 'a', title: 'A' }, 'newer draft');
    expect(await queue.flush()).toBe(true);
    expect(main.keep).toHaveBeenCalledTimes(1);
    expect(drafts.keep.mock.calls[0][0].name).toBe(drafts.keep.mock.calls[1][0].name);
    expect(drafts.keep.mock.calls[1][0].metadata.originalId).toBe('a');
    queue.adopt('a', 3); // Explicitly reopening the latest original starts a new editing session.
    queue.capture({ name: 'a' }, 'based on latest');
    expect(await queue.flush()).toBe(true);
    expect(main.keep).toHaveBeenLastCalledWith({ name: 'a' }, 'based on latest', { expectedRevision: 3 });
  });
  it('retains a conflict when storing its recovery draft fails', async () => {
    const main = store(), drafts = store();
    main.keep.mockRejectedValueOnce(new LibraryRevisionConflict(null, undefined));
    drafts.keep.mockRejectedValueOnce(new Error('Disk full'));
    const queue = new DocumentSaveQueue(main as never, drafts as never, () => {});
    queue.capture({ name: 'a' }, 'draft');
    expect(await queue.flush()).toBe(false);
    expect(await queue.flush()).toBe(true);
    expect(main.keep).toHaveBeenCalledTimes(1);
    expect(drafts.keep).toHaveBeenCalledTimes(2);
  });
});
