import { useEffect, useRef } from 'react';
/* 자기 배럴을 거치지 않는다 — 심볼이 사는 모듈에서 곧장. */
import {
  MOTION_COMBOS,
  MOTION_PRESETS,
  presetById,
  presetCategory,
  type MotionCombo,
  type MotionPreset
} from './motion-presets';
import { PATH_PRESETS, pathData } from './motion-path';
import { easingCss, framesFor } from './motion-effects';

/**
 * The named motions, as a grid that shows what each one does.
 *
 * ## Why a gallery and not a longer dropdown
 *
 * A preset's name is a promise — 톡 튀어나오기 — and a list of promises is a
 * list a reader has to try one at a time: choose, watch the slide, undo, choose
 * again. Canva, Keynote and CapCut all answer this the same way, and it is the
 * reason their animation lists feel like choosing rather than guessing: **the
 * tile plays the motion.** Point at 톡 튀어나오기 and a chip pops; point at
 * 닦아내며 드러내기 and one wipes.
 *
 * The preview is not a recording or a drawing of the curve: it is the *same*
 * `framesFor` and the *same* easing the slide will run, on a chip instead of a
 * shape. Anything else would be a second implementation of the effect table, and
 * a preview that lies is worse than no preview — the reader would learn to
 * distrust it and go back to trying them one at a time.
 *
 * ## Grouped by what it is for
 *
 * Entrance, emphasis, exit — the effect's own category, not a category a preset
 * invents. A reader looking for "how it leaves" should not have to read twelve
 * names to find the three.
 */

const CATEGORY_LABELS = [
  { id: 'entrance', label: '나타내기' },
  { id: 'emphasis', label: '강조' },
  { id: 'exit', label: '사라지기' }
] as const;

/** What the gallery of named motions is told. */
export interface PresetGalleryProps {
  onPick: (preset: MotionPreset) => void;
  disabled?: boolean;
  /** Which one the selected step already is, if it is any of them. */
  active?: string;
}

export function PresetGallery({ onPick, disabled, active }: PresetGalleryProps) {
  return (
    <div className="sl-presets" data-preset-gallery>
      {CATEGORY_LABELS.map(({ id, label }) => {
        const presets = MOTION_PRESETS.filter((preset) => presetCategory(preset) === id);
        if (presets.length === 0) return null;

        return (
          <div key={id} className="sl-presets-group">
            <span className="sl-presets-label">{label}</span>
            <div className="sl-presets-grid">
              {presets.map((preset) => (
                <PresetTile
                  key={preset.id}
                  preset={preset}
                  disabled={disabled}
                  active={active === preset.id}
                  onPick={onPick}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The combinations: two motions at once, under one name.
 *
 * The tiles a reader could not have had last week — a second motion on one shape
 * used to lose silently — so they are drawn as *both* chips playing together,
 * which is exactly what the slide will do. One chip per part, one animation each,
 * started at the same moment.
 */
/** What the gallery of paired motions is told. */
export interface ComboGalleryProps {
  onPick: (combo: MotionCombo) => void;
  disabled?: boolean;
}

export function ComboGallery({ onPick, disabled }: ComboGalleryProps) {
  return (
    <div className="sl-presets" data-combo-gallery>
      <div className="sl-presets-group">
        <span className="sl-presets-label">함께</span>
        <div className="sl-presets-grid">
          {MOTION_COMBOS.map((combo) => (
            <ComboTile key={combo.id} combo={combo} disabled={disabled} onPick={onPick} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ComboTile({
  combo,
  onPick,
  disabled
}: {
  combo: MotionCombo;
  onPick: (combo: MotionCombo) => void;
  disabled?: boolean;
}) {
  const chip = useRef<HTMLSpanElement>(null);
  const playing = useRef<Animation[]>([]);

  const stop = () => {
    for (const animation of playing.current) animation.cancel();
    playing.current = [];
  };

  const play = () => {
    const element = chip.current;
    if (!element || typeof element.animate !== 'function') return;
    stop();

    /**
     * Both parts on the *one* chip, the second added to the first.
     *
     * Which is the whole point of the combination, and the tile has to do it the
     * same way the slide does or it is a preview of something else: two
     * animations of one property are `replace` by default — newest wins — so the
     * second gets `composite: 'add'` here exactly as the timeline gives it to the
     * step.
     */
    playing.current = combo.parts
      .map((id) => presetById(id))
      .filter((preset): preset is MotionPreset => !!preset)
      .map((preset, index) => {
        const frames = framesFor(preset.effect, {
          direction: preset.direction,
          amount: preset.amount
        });
        return element.animate(frames as Keyframe[], {
          duration: preset.duration,
          easing: easingCss(preset.easing),
          iterations: preset.repeat ?? 1,
          fill: 'both',
          composite: index === 0 ? 'replace' : 'add'
        });
      });
  };

  useEffect(() => stop, []);

  return (
    <button
      type="button"
      className="sl-preset"
      data-combo={combo.id}
      aria-label={combo.label}
      disabled={disabled}
      onPointerEnter={play}
      onPointerLeave={stop}
      onFocus={play}
      onBlur={stop}
      onClick={() => onPick(combo)}
    >
      <span className="sl-preset-stage">
        <span ref={chip} className="sl-preset-chip" data-combo-chip />
      </span>
      <span className="sl-preset-name">{combo.label}</span>
    </button>
  );
}

/**
 * The paths a shape can travel, drawn as the paths they are.
 *
 * A path preset cannot be previewed the way a motion preset is — a chip moving
 * 4800 twips inside a 28-pixel tile is a chip that leaves the tile — so the tile
 * draws the *path* instead, as an SVG of the same points the document will hold.
 * Which is the honest preview for this: what a reader is choosing is a shape of
 * travel, and the shape of travel is exactly what is drawn.
 */
/** What the gallery of travel paths is told. */
export interface PathGalleryProps {
  onPick: (preset: (typeof PATH_PRESETS)[number]) => void;
  disabled?: boolean;
}

export function PathGallery({ onPick, disabled }: PathGalleryProps) {
  return (
    <div className="sl-presets" data-path-gallery>
      <div className="sl-presets-group">
        <span className="sl-presets-label">경로</span>
        <div className="sl-presets-grid">
          {PATH_PRESETS.map((preset) => {
            const xs = preset.points.map((point) => point.x);
            const ys = preset.points.map((point) => point.y);
            // The viewBox is the path's own extent with a little room, so every
            // tile draws its path at the largest size that fits rather than at a
            // scale chosen for the biggest of them.
            const pad = 600;
            const box = {
              x: Math.min(...xs) - pad,
              y: Math.min(...ys) - pad,
              width: Math.max(...xs) - Math.min(...xs) + pad * 2,
              height: Math.max(...ys) - Math.min(...ys) + pad * 2
            };

            return (
              <button
                key={preset.id}
                type="button"
                className="sl-preset"
                data-path-preset={preset.id}
                aria-label={preset.label}
                disabled={disabled}
                onClick={() => onPick(preset)}
              >
                <span className="sl-preset-stage">
                  <svg
                    viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
                    preserveAspectRatio="xMidYMid meet"
                    className="sl-path-preview"
                  >
                    {/* The same `pathData` the document's path becomes, so the
                        tile cannot draw a curve the slide will not travel. */}
                    <path d={pathData(preset.points.map((point) => ({ ...point })))} />
                    <circle cx={preset.points[0].x} cy={preset.points[0].y} r={pad / 2} />
                  </svg>
                </span>
                <span className="sl-preset-name">{preset.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PresetTile({
  preset,
  onPick,
  disabled,
  active
}: {
  preset: MotionPreset;
  onPick: (preset: MotionPreset) => void;
  disabled?: boolean;
  active?: boolean;
}) {
  const chip = useRef<HTMLSpanElement>(null);
  const playing = useRef<Animation | null>(null);

  /**
   * Cancelled rather than reversed, and cancelled on the way out.
   *
   * `fill: 'both'` is what makes an exit preset readable — the chip stays gone
   * at the end, which is the point of an exit — and it is also what would leave
   * the tile blank forever if the animation were merely allowed to finish.
   * `cancel()` puts the chip back exactly as the stylesheet had it, which is the
   * only way to return a tile to rest without knowing what rest was.
   */
  const stop = () => {
    playing.current?.cancel();
    playing.current = null;
  };

  const play = () => {
    const element = chip.current;
    if (!element || typeof element.animate !== 'function') return;

    stop();
    const frames = framesFor(preset.effect, {
      direction: preset.direction,
      amount: preset.amount
    });
    if (frames.length === 0) return;

    playing.current = element.animate(frames as Keyframe[], {
      duration: preset.duration,
      easing: easingCss(preset.easing),
      iterations: preset.repeat ?? 1,
      fill: 'both'
    });
  };

  useEffect(() => stop, []);

  return (
    <button
      type="button"
      className="sl-preset"
      data-preset={preset.id}
      data-active={active ? 'true' : undefined}
      aria-label={preset.label}
      aria-pressed={active}
      disabled={disabled}
      // Pointer *and* focus, so the preview is not a mouse-only feature: a
      // reader arrowing through the grid sees the same thing a reader pointing
      // at it does.
      onPointerEnter={play}
      onPointerLeave={stop}
      onFocus={play}
      onBlur={stop}
      onClick={() => onPick(preset)}
    >
      <span className="sl-preset-stage">
        <span ref={chip} className="sl-preset-chip" />
      </span>
      <span className="sl-preset-name">{preset.label}</span>
    </button>
  );
}
