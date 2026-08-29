/**
 * What a product must satisfy.
 *
 * The engine has no way to tell whether a product's schema and its kit agree
 * with each other — and the first product found out five times that they did
 * not. See `types.ts` for the pattern and why an exemption here is a checked
 * claim rather than a way to silence a finding.
 */
export { conformance, describeReport, CHECKS } from './run';
export { assertConforms } from './assert';
export type { ConformanceInput } from './run';
export { everyNodeIsDrawn } from './checks/every-node-is-drawn';
export { everyDrawingCanHoldWhatItContains } from './checks/every-drawing-can-hold-what-it-contains';
export { everyDrawingKeepsItsChildren } from './checks/every-drawing-keeps-its-children';
export { everyCommandCanBeSeen, type CommandProducing } from './checks/every-command-can-be-seen';
export { everyCommandMakesSomethingReal } from './checks/every-command-makes-something-real';
export { everyInsertIsAccountedFor } from './checks/every-insert-is-accounted-for';
export { everyCommandCanBeReached } from './checks/every-command-can-be-reached';
export { everyCommandDoesSomething } from './checks/every-command-does-something';
export { everyDrawingCanBeNamed } from './checks/every-drawing-can-be-named';
export { everyAttributeIsRead } from './checks/every-attribute-is-read';
export { everyMarkIsDrawn } from './checks/every-mark-is-drawn';
export { everyPropertyCanBeEdited } from './checks/every-property-can-be-edited';
export { everyIconHasAPicture } from './checks/every-icon-has-a-picture';
export { placeableTypes, childTypes, namesIn, type NodeShape } from './placeable';
export { drawnTagFrom, contentTagFrom } from './drawn-as';
export { attributeReadFrom, probeValues, type AttrShape } from './attribute-read';
export {
  askEveryCommand,
  everyNode,
  type CommandAnswers,
  type CommandProbeInput,
  type ProbeEditor,
  type ProbeStore
} from './command-probe';
export type { Check, Exemptions, Finding, Report, Subject } from './types';
