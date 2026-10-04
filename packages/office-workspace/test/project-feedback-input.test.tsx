// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createProjectRecord, registerProductDocumentHost, type ProductDocumentHost } from '@barocss/shared';
import { OfficeLocaleProvider } from '@barocss/office-ui';
import { ProjectFeedback, type FeedbackBeforeLeave } from '../src/project-feedback';
import type { ProjectRepository } from '../src/project-ui';

type PreparedInput = { isCurrent(): boolean };
const beforeLeave: { current?: FeedbackBeforeLeave & { capturePreparedInput?(): PreparedInput | undefined } } = {};
let root: Root, unregister: (() => void) | undefined;
let textarea: HTMLTextAreaElement;
let stored = { record: createProjectRecord('Actual mounted feedback', ''), revision: 1 };
let repository: ProjectRepository;
let sourceIdentity: { id: string; epoch: number };
const host = (id: string): ProductDocumentHost => ({ product: 'note', id: () => id,
  beforeNavigate: async () => { throw new Error('This input retirement test does not prepare native navigation'); } });

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('CSS', { escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, character => `\\${character}`) });
  beforeLeave.current = undefined;
  stored = { record: createProjectRecord('Actual mounted feedback', ''), revision: 1 };
  stored.record.results.push({ id: 'result', name: 'Native source', document: { product: 'note', id: 'source' }, inputs: [] });
  stored.record.drafts['feedback:note:source'] = 'Durable original draft';
  repository = { writable: true, read: vi.fn(async () => structuredClone(stored)),
    save: vi.fn(async (record, revision) => {
      expect(revision).toBe(stored.revision); stored = { record: structuredClone(record), revision: revision + 1 };
      return structuredClone(stored);
    }), list: async () => [structuredClone(stored)], documents: async () => [],
    create: async () => { throw new Error('Unexpected project creation'); },
    createDocument: async () => { throw new Error('Unexpected native document creation'); },
    pin: async () => { throw new Error('Unexpected source pin'); }, readPin: async () => { throw new Error('Unexpected pin read'); } };
  sourceIdentity = { id: 'source', epoch: 1 };
  unregister = registerProductDocumentHost({ ...host('source'), id: () => sourceIdentity.id, identityEpoch: () => sourceIdentity.epoch });
  const container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(createElement(OfficeLocaleProvider, { children: createElement(ProjectFeedback,
    { repository, projectId: stored.record.id, document: { product: 'note', id: 'source' }, beforeLeave }) })));
  await act(async () => document.querySelector<HTMLElement>('[role="menuitem"]')!.click());
  const open = [...document.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')].find(one => one.textContent === '의견 0');
  expect(open).toBeDefined(); await act(async () => open!.click());
  textarea = document.querySelector('textarea')!; expect(textarea.value).toBe('Durable original draft');
  expect(textarea.disabled).toBe(false);
  await act(async () => { expect(await beforeLeave.current!()).toBe(true); });
});

afterEach(async () => {
  await act(async () => { root?.unmount(); unregister?.(); }); unregister = undefined;
  document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

it('disables the exact old textarea synchronously when its real native host retires', async () => {
  const before = structuredClone(stored);
  // Inspect the actual DOM in the same host-change turn, before React commits.
  await act(async () => { unregister!(); expect(textarea.disabled).toBe(true); });
  expect(stored).toEqual(before); expect(repository.save).not.toHaveBeenCalled();
});

it('keeps a captured durable input witness through exact retirement and rejects queued old input and composition', async () => {
  const preparation = beforeLeave.current!, witness = preparation.capturePreparedInput?.();
  expect(witness).toBeDefined(); expect(witness!.isCurrent()).toBe(true);
  const before = structuredClone(stored), originalTextarea = textarea;
  await act(async () => { unregister!(); unregister = registerProductDocumentHost(host('target')); });
  expect(originalTextarea.isConnected).toBe(true); expect(originalTextarea.disabled).toBe(true);
  expect(preparation.isPrepared!()).toBe(false);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(originalTextarea, 'Queued old input');
    originalTextarea.dispatchEvent(new Event('input', { bubbles: true }));
    originalTextarea.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'late' }));
    originalTextarea.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'late' }));
  });
  expect(originalTextarea.value).toBe('Durable original draft');
  expect(witness!.isCurrent()).toBe(true); expect(stored).toEqual(before); expect(repository.save).not.toHaveBeenCalled();
});

it('invalidates an immutable input witness after real live input even once its draft is durable', async () => {
  const witness = beforeLeave.current!.capturePreparedInput?.(); expect(witness).toBeDefined();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, 'Actual changed draft');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(stored.record.drafts['feedback:note:source']).toBe('Actual changed draft');
  expect(witness!.isCurrent()).toBe(false); expect(beforeLeave.current!.isPrepared!()).toBe(false);
});

it('invalidates the captured input on composition ABA and on a new feedback address lifetime', async () => {
  const witness = beforeLeave.current!.capturePreparedInput?.(); expect(witness).toBeDefined();
  await act(async () => {
    textarea.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    textarea.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
  });
  expect(witness!.isCurrent()).toBe(false);
  await act(async () => { expect(await beforeLeave.current!()).toBe(true); });
  const fresh = beforeLeave.current!.capturePreparedInput!()!; expect(fresh.isCurrent()).toBe(true);
  await act(async () => root.render(createElement(OfficeLocaleProvider, { children: createElement(ProjectFeedback,
    { repository, projectId: stored.record.id, document: { product: 'note', id: 'another' }, beforeLeave }) })));
  expect(fresh.isCurrent()).toBe(false);
  await act(async () => root.render(createElement(OfficeLocaleProvider, { children: createElement(ProjectFeedback,
    { repository, projectId: stored.record.id, document: { product: 'note', id: 'source' }, beforeLeave }) })));
  expect(fresh.isCurrent()).toBe(false); expect(repository.save).not.toHaveBeenCalled();
});

it('preserves only protected retired input through the actual old component unmount', async () => {
  const preparation = beforeLeave.current!, witness = preparation.capturePreparedInput!()!;
  await act(async () => { unregister!(); expect(textarea.disabled).toBe(true); });
  expect(preparation.isPrepared!()).toBe(false); expect(witness.isCurrent()).toBe(true);
  await act(async () => root.unmount());
  expect(witness.isCurrent()).toBe(true); expect(repository.save).not.toHaveBeenCalled();
});

it('invalidates an ordinary unmount before any protected native retirement', async () => {
  const witness = beforeLeave.current!.capturePreparedInput!()!; expect(witness.isCurrent()).toBe(true);
  await act(async () => root.unmount());
  expect(witness.isCurrent()).toBe(false); expect(repository.save).not.toHaveBeenCalled();
});

it('does not revive the captured lifetime across repository ABA', async () => {
  const witness = beforeLeave.current!.capturePreparedInput!()!, original = repository;
  for (const next of [{ ...repository }, original]) await act(async () => root.render(createElement(OfficeLocaleProvider,
    { children: createElement(ProjectFeedback, { repository: next, projectId: stored.record.id,
      document: { product: 'note', id: 'source' }, beforeLeave }) })));
  expect(witness.isCurrent()).toBe(false); expect(repository.save).not.toHaveBeenCalled();
});

it('cannot freeze a failed latest draft when native retirement follows the real save failure', async () => {
  const witness = beforeLeave.current!.capturePreparedInput!()!, before = structuredClone(stored);
  vi.mocked(repository.save).mockRejectedValueOnce(new Error('Actual controlled draft failure'));
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, 'Unsaved current draft');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(textarea.value).toBe('Unsaved current draft'); expect(stored).toEqual(before);
  await act(async () => { unregister!(); expect(textarea.disabled).toBe(true); });
  expect(witness.isCurrent()).toBe(false); expect(repository.save).toHaveBeenCalledTimes(1);
});


it('seals input synchronously for a retained raw host with a different actual document identity', async () => {
  const preparation = beforeLeave.current!, witness = preparation.capturePreparedInput!()!;
  const before = structuredClone(stored);
  sourceIdentity.id = 'target'; sourceIdentity.epoch++;
  expect(preparation.isPrepared!()).toBe(false);
  expect(witness.isCurrent()).toBe(true); expect(textarea.disabled).toBe(true);
  await act(async () => root.unmount());
  expect(witness.isCurrent()).toBe(true); expect(stored).toEqual(before); expect(repository.save).not.toHaveBeenCalled();
});

it('cannot freeze retained-host identity retirement after ordinary unmount', async () => {
  const witness = beforeLeave.current!.capturePreparedInput!()!;
  await act(async () => root.unmount());
  sourceIdentity.id = 'target'; sourceIdentity.epoch++;
  expect(witness.isCurrent()).toBe(false); expect(repository.save).not.toHaveBeenCalled();
});


it('seals an exact native identity retirement before its keyed old feedback component unmounts', async () => {
  const witness = beforeLeave.current!.capturePreparedInput!()!;
  sourceIdentity.id = 'target'; sourceIdentity.epoch++;
  // A keyed native App retires the old header before new onRuntime completion.
  await act(async () => root.unmount());
  expect(witness.isCurrent()).toBe(true); expect(repository.save).not.toHaveBeenCalled();
});

it.each(['input', 'composition'] as const)('cannot protect %s changed before exact identity retirement and cleanup', async kind => {
  const witness = beforeLeave.current!.capturePreparedInput!()!;
  await act(async () => {
    if (kind === 'composition') textarea.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    else {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, 'Latest actual input');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  expect(witness.isCurrent()).toBe(false);
  sourceIdentity.id = 'target'; sourceIdentity.epoch++;
  await act(async () => root.unmount());
  expect(witness.isCurrent()).toBe(false);
  expect(repository.save).toHaveBeenCalledTimes(kind === 'input' ? 1 : 0);
});


it('never disables a newly mounted address input when a stale witness observes the old host retirement', async () => {
  const old = beforeLeave.current!.capturePreparedInput!()!;
  stored.record.drafts['feedback:note:target'] = 'New address durable input';
  sourceIdentity.id = 'target'; sourceIdentity.epoch++;
  await act(async () => root.render(createElement(OfficeLocaleProvider, { children: createElement(ProjectFeedback,
    { repository, projectId: stored.record.id, document: { product: 'note', id: 'target' }, beforeLeave }) })));
  const current = document.querySelector<HTMLTextAreaElement>('textarea')!;
  expect(current.disabled).toBe(false); expect(current.value).toBe('New address durable input');
  const before = structuredClone(stored);
  expect(old.isCurrent()).toBe(false);
  expect(current.disabled).toBe(false); expect(current.value).toBe('New address durable input');
  expect(stored).toEqual(before); expect(repository.save).not.toHaveBeenCalled();
});
