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
export { everyCommandCanBeSeen, type CommandProducing } from './checks/every-command-can-be-seen';
export type { Check, Exemptions, Finding, Report, Subject } from './types';
