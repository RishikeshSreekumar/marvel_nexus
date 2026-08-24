/**
 * The floating status bar at the bottom of the chronology.
 *
 * Replaces the vertical progress rail. A bar drawn as a filled track spent a
 * lot of pixels on a number that reads better as a number, and it could not
 * carry the two things a reader actually wants after scrolling half a
 * chronology: a way back to the top, and a way back to where they left off.
 *
 * The position readout is written straight into `positionRef` by the caller's
 * scroll pass — it changes on every frame, and a setState per frame would
 * re-render every row behind it.
 */
export default function StatusDock({
  total,
  watchedCount,
  percent,
  positionRef,
  lastWatched,
  nextUnwatched,
  onJump,
  onBackToTop,
}: {
  total: number;
  watchedCount: number;
  percent: number;
  /** Receives the "34 / 78" text on each scroll frame. */
  positionRef: React.RefObject<HTMLSpanElement | null>;
  /** Most recently ticked story, if it is still on screen somewhere. */
  lastWatched: { id: string; title: string } | null;
  /** First title still unwatched in the current chronology order. */
  nextUnwatched: { id: string; title: string } | null;
  onJump: (id: string) => void;
  onBackToTop: () => void;
}) {
  return (
    <div className="status-dock">
      <p className="status-dock-text">
        <span className="status-dock-position" ref={positionRef}>1 / {total}</span>
        <i />
        <span>
          <b>{watchedCount}</b>/{total} watched
        </span>
        <i />
        <span className="status-dock-percent">{percent}%</span>
      </p>

      <div className="status-dock-actions">
        <button type="button" onClick={onBackToTop}>
          <span aria-hidden="true">↑</span> Back to top
        </button>
        <button
          type="button"
          disabled={!lastWatched}
          // The title is the whole point of the control, so it is named rather
          // than left as a generic "last watched" for a screen reader.
          aria-label={
            lastWatched
              ? `Go to last watched, ${lastWatched.title}`
              : "Go to last watched — nothing watched yet"
          }
          title={lastWatched?.title ?? "Nothing watched yet"}
          onClick={() => lastWatched && onJump(lastWatched.id)}
        >
          <span aria-hidden="true">◆</span> Last watched
        </button>
        <button
          type="button"
          disabled={!nextUnwatched}
          aria-label={
            nextUnwatched
              ? `Go to next unwatched, ${nextUnwatched.title}`
              : "Go to next unwatched — everything here is watched"
          }
          title={nextUnwatched?.title ?? "Everything here is watched"}
          onClick={() => nextUnwatched && onJump(nextUnwatched.id)}
        >
          <span aria-hidden="true">→</span> Next unwatched
        </button>
      </div>
    </div>
  );
}
