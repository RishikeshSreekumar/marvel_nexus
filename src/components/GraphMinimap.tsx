import { useEffect, useRef, useState } from "react";
import type { ContentBox } from "../lib/useGraphViewport";
import type { Lane } from "../lib/graph";

export type MinimapNode = {
  id: string;
  lane: Lane;
  /** Layout space — unzoomed px inside .graph-columns. */
  x: number;
  y: number;
  w: number;
  h: number;
};

const WIDTH = 168;
const HEIGHT = 104;

/**
 * Overview of the whole graph with the current viewport drawn on top.
 *
 * Lives outside the zoomed subtree, so everything it renders has to be mapped
 * from layout space by hand. The viewport rectangle is the fiddly part: scroll
 * offsets are content space, so they divide by zoom to reach layout space
 * before the minimap scale is applied.
 *
 * aria-hidden: it duplicates panning, which is already reachable via the arrow
 * keys on the canvas.
 */
export default function GraphMinimap({
  nodes,
  contentBox,
  zoom,
  scrollRef,
  destinationId,
}: {
  nodes: MinimapNode[];
  contentBox: React.RefObject<ContentBox>;
  zoom: number;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** null when the map is showing everything rather than one path. */
  destinationId: string | null;
}) {
  const [view, setView] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const frameRef = useRef(0);

  // Track scroll so the viewport rect follows the canvas.
  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const sync = () => {
      // One pending frame at most: scroll fires faster than frames paint.
      cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() =>
        setView({
          left: viewport.scrollLeft / zoom,
          top: viewport.scrollTop / zoom,
          width: viewport.clientWidth / zoom,
          height: viewport.clientHeight / zoom,
        }),
      );
    };
    sync();
    viewport.addEventListener("scroll", sync, { passive: true });
    // clientWidth/Height change on window resize without any scroll event.
    const resizeObserver = new ResizeObserver(sync);
    resizeObserver.observe(viewport);
    return () => {
      viewport.removeEventListener("scroll", sync);
      resizeObserver.disconnect();
      cancelAnimationFrame(frameRef.current);
    };
  }, [scrollRef, zoom, nodes]);

  const box = contentBox.current;
  if (!nodes.length || box.width <= 0 || box.height <= 0) return null;

  const scale = Math.min(WIDTH / box.width, HEIGHT / box.height);
  const scaled = (value: number) => value * scale;

  // Nothing to navigate when the whole graph already fits.
  const viewportEl = scrollRef.current;
  if (viewportEl && box.width * zoom <= viewportEl.clientWidth) return null;

  const panTo = (event: React.MouseEvent<SVGSVGElement>) => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const layoutX = (event.clientX - rect.left) / scale;
    const layoutY = (event.clientY - rect.top) / scale;
    viewport.scrollLeft = layoutX * zoom - viewport.clientWidth / 2;
    viewport.scrollTop = layoutY * zoom - viewport.clientHeight / 2;
  };

  return (
    <svg
      className="graph-minimap"
      aria-hidden="true"
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      onMouseDown={panTo}
      onMouseMove={(event) => event.buttons === 1 && panTo(event)}
    >
      {nodes.map((node) => (
        <rect
          key={node.id}
          data-lane={node.lane}
          className={node.id === destinationId ? "is-destination" : ""}
          x={scaled(node.x)}
          y={scaled(node.y)}
          width={Math.max(1.5, scaled(node.w))}
          height={Math.max(1.5, scaled(node.h))}
          rx={1}
        />
      ))}
      <rect
        className="minimap-viewport"
        x={scaled(view.left)}
        y={scaled(view.top)}
        width={scaled(view.width)}
        height={scaled(view.height)}
      />
    </svg>
  );
}
