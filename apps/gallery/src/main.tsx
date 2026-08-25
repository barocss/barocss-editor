import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Gallery } from './gallery';
import './style.css';

/**
 * Every control the suite has, on one page.
 *
 * ## Why this exists
 *
 * You cannot improve what you cannot see side by side. `office-ui` is thirty-six components used
 * across three products, and until now the only way to look at one was to open the product that
 * happened to use it — so a control that had no pressed state, or a hover that jumped instantly, or
 * a panel row whose height ignored the density token, was invisible unless you were already looking
 * for it in the one app that drew it.
 *
 * Measured, the first time everything was on one page: `transition` appeared **zero** times in the
 * whole library, `active:` once, and a focus ring in three of thirty-six. None of that is visible one
 * component at a time.
 *
 * ## What it is not
 *
 * A product. There is no editor here, no document, no state worth keeping — every control is drawn
 * with local state so it can be pressed, and nothing it does means anything. That is the point: a
 * gallery that needed a document would be a gallery nobody could open with a broken document.
 */
const root = document.getElementById('root');
if (root) createRoot(root).render(createElement(StrictMode, null, createElement(Gallery)));
