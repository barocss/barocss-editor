import { Editor, Extension } from '@barocss/editor-core';
import { transaction, insertComment as insertCommentOp } from '@barocss/model';

export interface CommentExtensionOptions {
  enabled?: boolean;
  generateId?: () => string;
}

function defaultGenerateId(): string {
  return `comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class CommentExtension implements Extension {
  name = 'comment';
  priority = 100;
  private _options: CommentExtensionOptions;

  constructor(options: CommentExtensionOptions = {}) {
    this._options = {
      enabled: true,
      generateId: defaultGenerateId,
      ...options
    };
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;

    const generateId = this._options.generateId ?? defaultGenerateId;

    (editor as any).registerCommand({
      name: 'insertComment',
      execute: async (ed: Editor, payload?: { threadId?: string }) => {
        const threadId = payload?.threadId ?? generateId();
        const ops = [insertCommentOp(threadId)];
        const result = await transaction(ed, ops, { applySelectionToView: true }).commit();
        return result.success;
      },
      canExecute: () => true
    });
  }

  onDestroy(_editor: Editor): void {}
}

export function createCommentExtension(options?: CommentExtensionOptions): CommentExtension {
  return new CommentExtension(options);
}
