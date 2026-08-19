import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Shared open/close logic for the hover info cards (the ⓘ affordances on
 * Matching and Bill Posting).
 *
 * Fixes the original problem: the card was `position: fixed` a few px below its
 * trigger and `onMouseLeave` hid it instantly, so moving the pointer toward the
 * card crossed dead space and dismissed it — which made links inside the card
 * unclickable. Two fixes together:
 *   1. a close GRACE period, so crossing the gap doesn't dismiss it, and
 *   2. `cardHandlers`, so hovering the card itself cancels the pending close.
 *
 * Also flips the card above its trigger when there isn't room below. A flipped
 * card is anchored by `bottom`, so the height estimate only decides WHETHER to
 * flip and can never misalign it.
 */
export interface HoverCardPos {
  left: number;
  top?: number;
  bottom?: number;
}

export function useHoverCard(opts?: { width?: number; estHeight?: number; gap?: number; grace?: number }) {
  const width = opts?.width ?? 300;
  const estHeight = opts?.estHeight ?? 200;
  const gap = opts?.gap ?? 4;
  const grace = opts?.grace ?? 220;

  const [pos, setPos] = useState<HoverCardPos | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    timer.current = setTimeout(() => setPos(null), grace);
  }, [cancelClose, grace]);

  const open = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      cancelClose();
      const r = e.currentTarget.getBoundingClientRect();
      const left = Math.max(12, Math.min(r.right - width, window.innerWidth - width - 12));
      setPos(
        window.innerHeight - r.bottom < estHeight
          ? { left, bottom: window.innerHeight - r.top + gap }
          : { left, top: r.bottom + gap },
      );
    },
    [cancelClose, width, estHeight, gap],
  );

  const close = useCallback(() => setPos(null), []);

  useEffect(() => cancelClose, [cancelClose]);

  return {
    pos,
    width,
    close,
    /** Spread onto the ⓘ trigger. */
    triggerHandlers: { onMouseEnter: open, onMouseLeave: scheduleClose },
    /** Spread onto the card itself so hovering it keeps it open. */
    cardHandlers: { onMouseEnter: cancelClose, onMouseLeave: scheduleClose },
  };
}
