/**
 * SVG & MathML Examples using Renderer DSL
 */

import { element } from '../src/template-builders';
import { reconcileVNodes } from '../src/reconcile';

export function renderSVG(container: HTMLElement) {
  const icon = element('svg', { viewBox: '0 0 16 16', width: '64', height: '64' }, [
    element('circle', { cx: 8, cy: 8, r: 7, fill: '#4f46e5' })
  ]);
  reconcileVNodes(null, icon as any, container);
}

export function renderMath(container: HTMLElement) {
  const formula = element('math', [
    element('mrow', [
      element('mi', 'x'),
      element('mo', '='),
      element('mfrac', [
        element('mrow', [ element('mi', 'a'), element('mo', '+'), element('mi', 'b') ]),
        element('mrow', [ element('mi', 'c'), element('mo', '+'), element('mi', 'd') ])
      ])
    ])
  ]);
  reconcileVNodes(null, formula as any, container);
}


