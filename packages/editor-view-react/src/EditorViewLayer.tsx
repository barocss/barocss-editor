import type { EditorViewLayerProps } from './types';

const LAYER_DEFAULTS: Record<string, { className: string; zIndex: number }> = {
  decorator: { className: 'barocss-editor-decorators', zIndex: 10 },
  selection: { className: 'barocss-editor-selection', zIndex: 100 },
  context: { className: 'barocss-editor-context', zIndex: 200 },
  custom: { className: 'barocss-editor-custom', zIndex: 1000 },
};

/**
 * Overlay layer wrapper (decorator, selection, context, custom).
 * Positioned absolute, pointer-events: none by default so content layer receives input.
 */
export function EditorViewLayer({ layer, className, style, children }: EditorViewLayerProps) {
  const defaults = LAYER_DEFAULTS[layer] ?? { className: '', zIndex: 0 };
  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
    zIndex: defaults.zIndex,
  };

  return (
    <div
      className={className ?? defaults.className}
      style={style ? { ...baseStyle, ...style } : baseStyle}
      data-bc-layer={layer}
    >
      {children}
    </div>
  );
}
