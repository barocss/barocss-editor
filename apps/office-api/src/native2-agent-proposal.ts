import { captureNative2ParagraphReview, type Native2ParagraphReviewWitness } from '@barocss/office-service/project-execution';
import { createNative2ReviewAgent, LocalAgentError, type LocalAgentInput, type LocalAgent } from './local-agent.js';

export interface Native2AgentProposal {
  generateNative2Review(input: LocalAgentInput, witness: Native2ParagraphReviewWitness): ReturnType<LocalAgent['generate']>;
}

// Compare all JSON data, including extra own fields, without relying on parser object prototypes or key order.
function sameJSON(expected: unknown, actual: unknown): boolean {
  if (expected === null || typeof expected !== 'object') return expected === actual;
  if (!actual || typeof actual !== 'object' || Array.isArray(expected) !== Array.isArray(actual)) return false;
  if (!Array.isArray(actual) && ![null, Object.prototype].includes(Object.getPrototypeOf(actual))) return false;
  const keys = Reflect.ownKeys(expected), other = Reflect.ownKeys(actual);
  if (keys.length !== other.length) return false;
  return keys.every(key => {
    const left = Object.getOwnPropertyDescriptor(expected, key), right = Object.getOwnPropertyDescriptor(actual, key);
    return !!left && !!right && 'value' in left && 'value' in right && left.enumerable === right.enumerable &&
      sameJSON(left.value, right.value);
  });
}

/** Data consistency only. Canonical locked source/selector and current authority remain server responsibilities. */
export function createNative2AgentProposal(env: NodeJS.ProcessEnv, transport?: typeof fetch): Native2AgentProposal | null {
  const agent = createNative2ReviewAgent(env, transport);
  if (!agent) return null;
  return {
    async generateNative2Review(input, witness) {
      let captured: Native2ParagraphReviewWitness;
      try {
        captured = captureNative2ParagraphReview(input.snapshotText, witness.paragraphIndex);
      } catch (error) {
        const reason = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'invalid_input';
        throw new LocalAgentError('not_dispatched', reason);
      }
      if (!sameJSON(captured, witness) || input.snapshotHash !== captured.snapshotHash ||
        input.target?.text !== captured.paragraphJSON || input.target.from !== 0 || input.target.to !== captured.paragraphJSON.length) {
        throw new LocalAgentError('not_dispatched', 'native2_paragraph_review_witness_mismatch');
      }
      return agent.generate(input);
    },
  };
}
