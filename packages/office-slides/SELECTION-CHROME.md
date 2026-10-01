# Slides canvas and selection chrome

Permitted writers keep editing the canvas without a mode switch. The app keeps history, slide and insertion discovery in a compact command strip. The explicit full-tools entry reveals the complete existing Ribbon. Details are on demand; the existing inspector stays mounted so Properties/Motion, units and field state survive closing and reopening.

The selection surface reuses the Slides toolbar model. Text ranges expose character, paragraph and list actions; selected canvas objects and table cells expose their relevant existing actions. Popup fields use the exact surface as their DOM owner. The permanent command strip and expanded Ribbon use their own chrome container, retain the captured intent, and retire field callbacks on the same selection lifetime changes. Coordinates portal into the untransformed main pane, while native selection belongs to the existing canvas or rich-note view.

Canvas overlay selection can retain keyboard focus in the slide navigator. The stage and its sibling selection overlay both belong to the canvas region. A product-local canvas gesture owner makes its object tools available without forcing DOM focus or changing model selection. Header/sidebar activity, notes, Escape, window blur, root/slide changes and live authority changes retire this gesture. Native rich tables are detected through the bTable ancestor of the actual cell selection.

One editor, datastore and history still serve the canvas and rich notes. Selection intent binds editor/root identity, version, current slide, active canvas/notes region and a monotonic lifetime. Selection changes, null selection, content changes, authority changes, slide/region transitions and Escape retire old intent. Returning to the old target does not revive it. Async file delivery captures its owner before reading the file and checks again before insertion. Default Ribbon consumers keep their complete existing composition.

Viewer notes remain selectable and copyable; their editable DOM follows current editor authority and the add-note control is disabled and guarded. Global history shortcuts check live edit authority before direct undo/redo. Inspector viewer navigation and unit preferences keep the existing #422 behavior.

This slice does not change native schema, connector identities, resources, model history, painting or persistence contracts. The known #421 component-detach undo limitation remains. Actual desktop/authenticated evidence must identify the final candidate; synthetic composition tests do not prove physical Korean IME, collaboration or alpha readiness.

The authenticated entry has generic section layout. The Slides app contains that rule only for native `.sl-slide` sheets: model inline width/height remain authoritative and the login section max-width/margin do not alter the stage or thumbnails. Other products and authentication controls are unchanged.
