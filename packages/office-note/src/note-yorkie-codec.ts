import { Text } from '@yorkie-js/sdk';

/** A deliberately small, preseeded Note shape for the Yorkie prototype. */
export interface SeededNoteNode {
  id: string;
  stype: string;
  attributes?: Record<string, string>;
  text?: string;
  content: SeededNoteNode[];
}

export interface YorkieNoteNode {
  id: string;
  stype: string;
  attributes?: Record<string, string>;
  text?: Text;
  content: YorkieNoteNode[];
}

export interface YorkieNoteRoot {
  note?: YorkieNoteNode;
}

/** Keep identity in document data. Decoding never derives it from array position. */
export function seedYorkieNote(root: YorkieNoteRoot, note: SeededNoteNode): void {
  if (root.note) throw new Error('Yorkie Note is already seeded');
  const ids = new Set<string>();
  const encode = (node: SeededNoteNode): YorkieNoteNode => {
    if (!node.id || ids.has(node.id)) throw new Error('Note node IDs must be unique and nonempty');
    ids.add(node.id);
    const result: YorkieNoteNode = {
      id: node.id,
      stype: node.stype,
      ...(node.attributes ? { attributes: { ...node.attributes } } : {}),
      content: node.content.map(encode),
    };
    if (node.text !== undefined) {
      result.text = new Text();
    }
    return result;
  };
  root.note = encode(note);
  // Yorkie initializes nested Text values only after the object enters the root.
  const fillText = (target: YorkieNoteNode, source: SeededNoteNode): void => {
    if (source.text && target.text) target.text.edit(0, 0, source.text);
    source.content.forEach((child, index) => fillText(target.content[index], child));
  };
  fillText(root.note, note);
}

export function decodeYorkieNote(root: YorkieNoteRoot): SeededNoteNode {
  if (!root.note) throw new Error('Yorkie Note is not seeded');
  const decode = (node: YorkieNoteNode): SeededNoteNode => ({
    id: node.id,
    stype: node.stype,
    ...(node.attributes ? { attributes: { ...node.attributes } } : {}),
    ...(node.text ? { text: node.text.toString() } : {}),
    content: node.content.map(decode),
  });
  return decode(root.note);
}

/** Call inside Document.update. The target stays the same Yorkie Text object. */
export function editYorkieNoteText(
  root: YorkieNoteRoot,
  id: string,
  from: number,
  to: number,
  value: string,
): void {
  const find = (node: YorkieNoteNode): YorkieNoteNode | undefined =>
    node.id === id ? node : node.content.map(find).find(Boolean);
  const target = root.note && find(root.note);
  if (!target?.text) throw new Error(`No text node with ID ${id}`);
  target.text.edit(from, to, value);
}
