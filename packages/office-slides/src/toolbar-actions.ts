import type { Editor } from '@barocss/editor-core';
import { slidesToolbarPayload, type SlidesToolbarControl } from './toolbar-model';

export interface SlidesControlContext {
  editor: Editor;
  current?: string;
  number?: number;
  canRunIntent?: () => boolean;
  captureIntent?: () => (() => boolean);
}

/** One dispatch path for the primary ribbon and its insertion dropdown. */
export function slidesControlActions({ editor, current, number, canRunIntent, captureIntent }: SlidesControlContext) {
  const payloadFor = (control: SlidesToolbarControl) => slidesToolbarPayload(control, current, number);
  return {
    can: (control: SlidesToolbarControl) => {
      if (!editor.isEditable || (control.needsSlide && !current)) return false;
      if (control.needsFile) return !!current;
      return editor.canExecuteCommand(control.command, payloadFor(control)) !== false;
    },
    onRun: (control: SlidesToolbarControl) => {
      if (!editor.isEditable || canRunIntent?.() === false) return;
      const ownsIntent = captureIntent?.() ?? canRunIntent;
      if (control.needsFile) {
        const accept = control.command === 'insertVideo' ? 'video/*'
          : control.command === 'insertAudio' ? 'audio/*' : 'image/*';
        pickPicture(payload => {
          if (!editor.isEditable || ownsIntent?.() === false) return;
          void editor.executeCommand(control.command, { ...payloadFor(control), ...payload });
        }, accept);
        return;
      }
      void editor.executeCommand(control.command, payloadFor(control));
    }
  };
}

/** Preserve native embedded media and the existing measured placement behavior. */
function pickPicture(
  run: (payload: Record<string, unknown>) => void,
  accept = 'image/*'
) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result ?? '');
      if (!src) return;

      /**
       * A film is measured the same way a picture is, from the file itself.
       *
       * `videoWidth` is only known once the browser has read the metadata, so
       * this waits for that event rather than the load — a film's first frame
       * may be megabytes away and its dimensions are in the first kilobyte.
       *
       * A sound has no dimensions at all, so it takes a strip: full width of a
       * quarter-slide and the height of the browser's own player.
       */
      if (file.type.startsWith('video/')) {
        const video = document.createElement('video');
        video.preload = 'metadata';
        const place = () => {
          const limit = { width: 19200 / 2, height: 10800 / 2 };
          const natural = {
            width: (video.videoWidth || 640) * 15,
            height: (video.videoHeight || 360) * 15
          };
          const scale = Math.min(limit.width / natural.width, limit.height / natural.height, 1);
          run({
            src,
            width: Math.round(natural.width * scale),
            height: Math.round(natural.height * scale)
          });
        };
        video.onloadedmetadata = place;
        // A file the browser cannot decode still goes in, at the default box,
        // rather than silently doing nothing to a reader who chose it.
        video.onerror = () => run({ src });
        video.src = src;
        return;
      }

      if (file.type.startsWith('audio/')) {
        run({ src, width: 9600, height: 810 });
        return;
      }

      const image = new Image();
      image.onload = () => {
        // A quarter of a 16:9 slide, in twips, and never larger than that.
        const limit = { width: 19200 / 2, height: 10800 / 2 };
        const scale = Math.min(
          limit.width / Math.max(1, image.naturalWidth * 15),
          limit.height / Math.max(1, image.naturalHeight * 15),
          1
        );
        run({
          src,
          alt: file.name,
          width: Math.round(image.naturalWidth * 15 * scale),
          height: Math.round(image.naturalHeight * 15 * scale)
        });
      };
      // A file the browser cannot decode still goes in, at the default size,
      // rather than silently doing nothing to a reader who chose it.
      image.onerror = () => run({ src, alt: file.name });
      image.src = src;
    };
    reader.readAsDataURL(file);
  };
  input.click();
}
