import { useCallback, useEffect, useRef, useState } from "react";
import { clampZoom, fitZoom, zoomAtPoint, ZOOM_MAX, ZOOM_MIN } from "./graph";

/*
 * DOM glue for panning and zooming the graph canvas. All layout maths lives in
 * graph.ts; this file only reads the DOM and writes scroll offsets.
 *
 * MEASUREMENT RULE — do not break this:
 *   Zoom is the CSS `zoom` property on the stage. Inside the stage, offsetLeft
 *   and offsetTop are UNZOOMED (layout space) while getBoundingClientRect() is
 *   ZOOMED (content space). Measure inside the stage with offset* only; measure
 *   the viewport with getBoundingClientRect() on .graph-scroll, which sits
 *   outside the zoomed subtree.
 */

/** Content bounding box in layout space, captured by the edge-drawing pass. */
export type ContentBox = { width: number; height: number };

/**
 * A node's position in layout space, relative to the stage.
 *
 * Keep this a walk up the offsetParent chain. Nodes sit inside positioned
 * wrappers inside positioned columns, so reading a single offsetLeft/offsetTop
 * would silently drop the column's offset. Shared by the edge-drawing pass and
 * by anything that scrolls a node into view, which must agree exactly.
 */
export function offsetWithin(node: HTMLElement, stage: HTMLElement) {
  let x = 0;
  let y = 0;
  let current: HTMLElement | null = node;
  while (current && current !== stage) {
    x += current.offsetLeft;
    y += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

const PAN_THRESHOLD_PX = 4;
const WHEEL_SENSITIVITY = 0.0025;
const DOUBLE_CLICK_FACTOR = 1.6;

export function useGraphViewport({
  scrollRef,
  stageRef,
  contentBox,
  initialZoom = 0.72,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  stageRef: React.RefObject<HTMLDivElement | null>;
  contentBox: React.RefObject<ContentBox>;
  initialZoom?: number;
}) {
  const [zoom, setZoom] = useState(initialZoom);
  const [isPanning, setIsPanning] = useState(false);

  // The wheel listener is attached once and must not close over a stale zoom.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const panRef = useRef<
    { pointerId: number; x: number; y: number; scrollLeft: number; scrollTop: number; active: boolean } | null
  >(null);
  const suppressClickRef = useRef(false);
  /** Live touch points, keyed by pointerId — two of them make a pinch. */
  const touchPointsRef = useRef(new Map<number, { x: number; y: number }>());
  /** Distance and zoom captured when the second finger landed. */
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);

  /**
   * Apply zoom imperatively before writing scroll, then sync React state.
   *
   * Order matters: setZoom alone would not have re-rendered yet, so the stage
   * would still carry the old zoom, scrollWidth would be stale, and the browser
   * would clamp the scroll write. Setting style.zoom forces layout with the new
   * extents first. The subsequent render writes the same value, so nothing flickers.
   */
  const applyZoom = useCallback(
    (nextZoom: number, pointerX?: number, pointerY?: number) => {
      const viewport = scrollRef.current;
      const stage = stageRef.current;
      if (!viewport || !stage) return;

      const box = contentBox.current;
      const clientW = viewport.clientWidth;
      const clientH = viewport.clientHeight;
      const next = zoomAtPoint({
        zoom: zoomRef.current,
        nextZoom,
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
        pointerX: pointerX ?? clientW / 2,
        pointerY: pointerY ?? clientH / 2,
        contentW: box.width,
        contentH: box.height,
        clientW,
        clientH,
      });
      if (next.zoom === zoomRef.current) return;

      zoomRef.current = next.zoom;
      stage.style.zoom = String(next.zoom);
      viewport.scrollLeft = next.scrollLeft;
      viewport.scrollTop = next.scrollTop;
      setZoom(next.zoom);
    },
    [contentBox, scrollRef, stageRef],
  );

  const zoomBy = useCallback(
    (delta: number) => applyZoom(clampZoom(zoomRef.current + delta)),
    [applyZoom],
  );

  const fit = useCallback(() => {
    const viewport = scrollRef.current;
    const stage = stageRef.current;
    if (!viewport || !stage) return;
    const box = contentBox.current;
    if (box.width <= 0) return;

    const scale = fitZoom(box, {
      width: viewport.clientWidth,
      height: viewport.clientHeight,
    });
    zoomRef.current = scale;
    stage.style.zoom = String(scale);
    // Centre using the layout box scaled by the new zoom — never scrollWidth,
    // which is already zoom-contaminated.
    viewport.scrollLeft = Math.max(0, (box.width * scale - viewport.clientWidth) / 2);
    viewport.scrollTop = Math.max(0, (box.height * scale - viewport.clientHeight) / 2);
    setZoom(scale);
  }, [contentBox, scrollRef, stageRef]);

  // Ctrl/meta + wheel, and trackpad pinch (which arrives as ctrl+wheel with a
  // fractional deltaY). Must be a native non-passive listener: React registers
  // onWheel passively at the root, so preventDefault() from it is ignored and
  // the browser page-zooms instead.
  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      applyZoom(
        zoomRef.current * Math.exp(-event.deltaY * WHEEL_SENSITIVITY),
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [applyZoom, scrollRef]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "touch") {
        // One finger keeps native panning, which is smoother than anything we
        // could drive from JS. Two fingers become a pinch — before this, touch
        // users had no way to zoom at all while the canvas label promised one.
        touchPointsRef.current.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
        if (touchPointsRef.current.size === 2) {
          const [a, b] = [...touchPointsRef.current.values()];
          pinchRef.current = {
            distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
            zoom: zoomRef.current,
          };
          // A pinch is never also a pan.
          panRef.current = null;
        }
        return;
      }
      if (event.button !== 0 && event.button !== 1) return;
      const viewport = scrollRef.current;
      if (!viewport) return;
      panRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
        active: false,
      };
    },
    [scrollRef],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const viewport = scrollRef.current;
      if (event.pointerType === "touch") {
        if (!touchPointsRef.current.has(event.pointerId)) return;
        touchPointsRef.current.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
        const pinch = pinchRef.current;
        if (!pinch || !viewport || touchPointsRef.current.size !== 2) return;
        const [a, b] = [...touchPointsRef.current.values()];
        const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        const rect = viewport.getBoundingClientRect();
        // Anchor on the midpoint, through the same tested zoom maths the wheel
        // and toolbar paths use.
        applyZoom(
          pinch.zoom * (distance / pinch.distance),
          (a.x + b.x) / 2 - rect.left,
          (a.y + b.y) / 2 - rect.top,
        );
        return;
      }

      const pan = panRef.current;
      if (!pan || !viewport || pan.pointerId !== event.pointerId) return;

      const dx = event.clientX - pan.x;
      const dy = event.clientY - pan.y;

      // Only claim the gesture once it is clearly a drag, so a plain click on a
      // node still selects it.
      if (!pan.active) {
        if (Math.hypot(dx, dy) < PAN_THRESHOLD_PX) return;
        pan.active = true;
        setIsPanning(true);
        // Capture on the scroll container, not the node: capturing on a node
        // would drop pointermove as soon as the cursor left it.
        viewport.setPointerCapture(event.pointerId);
      }

      // Drag deltas and scroll offsets are both content space — no zoom divisor.
      viewport.scrollLeft = pan.scrollLeft - dx;
      viewport.scrollTop = pan.scrollTop - dy;
    },
    [applyZoom, scrollRef],
  );

  const endPan = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "touch") {
        touchPointsRef.current.delete(event.pointerId);
        if (touchPointsRef.current.size < 2) pinchRef.current = null;
        return;
      }
      const pan = panRef.current;
      if (!pan || pan.pointerId !== event.pointerId) return;
      panRef.current = null;
      if (!pan.active) return;

      setIsPanning(false);
      scrollRef.current?.releasePointerCapture?.(event.pointerId);
      // Swallow the click this drag is about to synthesise.
      suppressClickRef.current = true;
      requestAnimationFrame(() => {
        suppressClickRef.current = false;
      });
    },
    [scrollRef],
  );

  const onClickCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const onDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const viewport = scrollRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      const factor =
        event.altKey || event.shiftKey ? 1 / DOUBLE_CLICK_FACTOR : DOUBLE_CLICK_FACTOR;
      applyZoom(
        zoomRef.current * factor,
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
    },
    [applyZoom, scrollRef],
  );

  return {
    zoom,
    isPanning,
    fit,
    zoomBy,
    canZoomIn: zoom < ZOOM_MAX,
    canZoomOut: zoom > ZOOM_MIN,
    bindings: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endPan,
      onPointerCancel: endPan,
      onClickCapture,
      onDoubleClick,
    },
  };
}
