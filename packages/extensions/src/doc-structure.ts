import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, addChild } from '@barocss/model';

type DocStructureType =
  | 'docSection' | 'docHeader' | 'docFooter'
  | 'bibliography' | 'endnoteDef' | 'indexBlock' | 'chart';

interface DocStructureSpec {
  cmd: string;
  stype: DocStructureType;
  /**
   * What an empty one is made of — and it is **not** a boolean.
   *
   * It was `hasContent: boolean`, and `true` meant *give it a paragraph*. Three of these hold
   * `inline*`: `docHeader`, `docFooter` and `endnoteDef` are runs of words, not stacks of blocks. So
   * the command built a header with a paragraph inside it, the schema refused the child, and the
   * insert drew nothing — while `insertDocSection`, `insertBibliography` and `insertIndexBlock`,
   * three lines away in the same table and through the same code, worked perfectly.
   *
   * Found by this package's own conformance run, which is the first thing that ever ran these:
   * `every-command-does-something` reported four of the seven as commands that say yes and change
   * nothing, and the four were exactly the ones whose content this got wrong.
   */
  holds: 'blocks' | 'words' | 'nothing';
  attrKeys?: string[];
}

export class DocStructureExtension implements Extension {
  name = 'docStructure';
  priority = 80;

  private static _specs: DocStructureSpec[] = [
    { cmd: 'insertDocSection', stype: 'docSection', holds: 'blocks' },
    { cmd: 'insertDocHeader', stype: 'docHeader', holds: 'words' },
    { cmd: 'insertDocFooter', stype: 'docFooter', holds: 'words' },
    { cmd: 'insertBibliography', stype: 'bibliography', holds: 'blocks' },
    /*
     * **`insertEndnote` is not here any more.** It was, and it put an *empty* `endnoteDef` into the
     * flow with no reference pointing at it — a body nothing refers to, which is not a note; and
     * under the office schema `endnoteDef` is a resource that cannot sit in the flow at all, so on
     * every product that matters it built a tree the validator refused.
     *
     * It lives in `footnote.ts` now, beside the footnote, where the pair is one gesture: a body into
     * `resources` and an `endnoteRef` over the words the reader selected. Found when Word's key map
     * was asked whether ⌥⌘D names anything — no product installs this extension, so the answer was
     * no, and building the command turned up the one that already existed.
     */
    { cmd: 'insertIndexBlock', stype: 'indexBlock', holds: 'blocks' },
    { cmd: 'insertChart', stype: 'chart', holds: 'nothing', attrKeys: ['title', 'values'] },
  ];

  onCreate(editor: Editor): void {
    for (const spec of DocStructureExtension._specs) {
      (editor as any).registerCommand({
        name: spec.cmd,
        execute: async (ed: Editor, payload?: { selection?: ModelSelection; attrs?: Record<string, any> }) => {
          const insertInfo = this._getInsertInfo(ed, payload?.selection);
          if (!insertInfo) return false;

          const nodeData: any = { stype: spec.stype };

          const attrs = pickAttrs(spec, payload?.attrs);
          if (attrs) nodeData.attributes = attrs;

          /*
           * An empty one, in the shape the node actually holds. A paragraph inside something that
           * holds `inline*` is a child the schema refuses, and a refused child is an insert that
           * reports success and draws nothing.
           */
          if (spec.holds === 'blocks') {
            nodeData.content = [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '' }] }];
          } else if (spec.holds === 'words') {
            nodeData.content = [{ stype: 'inline-text', text: '' }];
          }

          /*
           * An attribute the node **requires** and the caller did not give is a node the schema will
           * refuse — a `chart` with no `values` is the case here. Refusing in the command is the
           * difference between a control that greys and one that runs and draws nothing.
           */
          if (spec.attrKeys && !hasRequired(ed, spec.stype, nodeData.attributes)) return false;

          const ops = [addChild(insertInfo.parentId, nodeData, insertInfo.position)];
          const result = await transaction(ed, ops, { applySelectionToView: true }).commit();
          return result.success;
        },
        /**
         * **`() => true` was the whole guard**, on all seven, beside an execute that refuses without
         * a range and — for two of them — without a required attribute.
         *
         * The class `guards.ts` names, found again by this package's own conformance run. A control
         * that lights up and does nothing is worse than one that is missing, because a reader stops
         * believing the rest of the surface.
         */
        canExecute: (ed: Editor, payload?: { selection?: ModelSelection; attrs?: Record<string, any> }) => {
          if (!this._getInsertInfo(ed, payload?.selection)) return false;
          return !spec.attrKeys || hasRequired(ed, spec.stype, pickAttrs(spec, payload?.attrs));
        }
      });
    }
  }

  onDestroy(_editor: Editor): void {}

  private _getInsertInfo(editor: Editor, selection?: ModelSelection): { parentId: string; position: number } | null {
    const sel = selection || (editor as any).selection;
    if (!sel || sel.type !== 'range') return null;
    const dataStore = (editor as any).dataStore;
    if (!dataStore) return null;
    const node = dataStore.getNode(sel.startNodeId);
    if (!node) return null;

    let blockId = sel.startNodeId;
    let current = node;
    const schema = dataStore.getActiveSchema?.();
    while (current?.parentId) {
      const parent = dataStore.getNode(current.parentId);
      if (!parent) break;
      if (schema?.getNodeType?.(parent.stype)?.group === 'block') {
        blockId = parent.sid ?? current.parentId;
        break;
      }
      current = parent;
    }
    const block = dataStore.getNode(blockId);
    if (!block?.parentId) return null;
    const docParent = dataStore.getNode(block.parentId);
    if (!docParent || !Array.isArray(docParent.content)) return null;
    const idx = docParent.content.indexOf(blockId);
    return { parentId: block.parentId, position: idx === -1 ? docParent.content.length : idx + 1 };
  }
}

export function createDocStructureExtension(): DocStructureExtension {
  return new DocStructureExtension();
}

/**
 * The attributes this spec accepts, out of what a caller sent — or nothing when there are none.
 *
 * Lifted out of `execute` so that the guard and the run filter identically. Two copies of a filter
 * is how a `canExecute` comes to be looser than its `execute` without anybody writing it that way.
 */
function pickAttrs(
  spec: DocStructureSpec,
  said: Record<string, any> | undefined
): Record<string, any> | undefined {
  if (!spec.attrKeys || !said) return undefined;
  const attrs: Record<string, any> = {};
  for (const key of spec.attrKeys) if (said[key] !== undefined) attrs[key] = said[key];
  return Object.keys(attrs).length > 0 ? attrs : undefined;
}

/**
 * Whether every attribute the schema **requires** of this node type has been given.
 *
 * `editor.dataStore` and `getActiveSchema()` are both public and typed; only the *shape* of a node
 * definition needs naming, and it is named here rather than reached for with a cast — the engine
 * counts those (`editor-is-typed`), and it counted this one the minute it was written.
 */
function hasRequired(editor: Editor, stype: string, attrs: Record<string, any> | undefined): boolean {
  const schema = editor.dataStore?.getActiveSchema() as
    | { nodes?: Map<string, { attrs?: Record<string, { required?: boolean }> }> }
    | undefined;
  const declared = schema?.nodes?.get(stype)?.attrs ?? {};
  return Object.entries(declared).every(([key, one]) => !one?.required || attrs?.[key] !== undefined);
}
