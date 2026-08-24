import { useRef } from "react";
import type { KindFilter } from "../lib/graph";
import type { MatchRange, SearchHit } from "../lib/search";
import { NexusSearchIcon } from "./icons";
import StoryArtwork from "./StoryArtwork";

/** Results rendered, and the ceiling for keyboard navigation. */
export const MAX_RESULTS = 18;

/** Elements the focus trap cycles between. */
const FOCUSABLE = 'input, button, [href], [tabindex]:not([tabindex="-1"])';

export default function SearchPalette({
  query,
  hits,
  total,
  kind,
  activeResult,
  inputRef,
  onQueryChange,
  onActiveResultChange,
  onKeyDown,
  onChoose,
  onClearKind,
  onClose,
}: {
  query: string;
  /** Already truncated to MAX_RESULTS by the caller. */
  hits: SearchHit[];
  /** Matches before truncation, so the count cannot overstate what is shown. */
  total: number;
  kind: KindFilter;
  activeResult: number;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onQueryChange: (value: string) => void;
  onActiveResultChange: (index: number) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onChoose: (id: string) => void;
  onClearKind: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  /**
   * Keep Tab inside the dialog. The previous behaviour bounced Tab back to the
   * input, which left the ESC button and every result unreachable by keyboard
   * while Shift+Tab escaped to the page behind.
   */
  const trapFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const empty = hits.length === 0;

  return (
    <div
      className="search-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Find a Marvel title"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="search-panel" ref={panelRef} onKeyDown={trapFocus}>
        <div className="search-input">
          <NexusSearchIcon />
          <input
            ref={inputRef}
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="title-results"
            aria-activedescendant={
              hits[activeResult] ? `result-${hits[activeResult].story.id}` : undefined
            }
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Where are you headed?"
          />
          {query.length > 0 && (
            <button
              className="search-clear"
              aria-label="Clear search"
              onClick={() => {
                onQueryChange("");
                inputRef.current?.focus();
              }}
            >
              ×
            </button>
          )}
          <button onClick={onClose}>ESC</button>
        </div>
        <div className="search-meta">
          <span>
            {total > MAX_RESULTS
              ? `SHOWING ${MAX_RESULTS} OF ${total}`
              : `${total} ${total === 1 ? "STORY" : "STORIES"}`}
          </span>
          <span>{query ? "SELECT A DESTINATION" : "POPULAR DESTINATIONS"}</span>
        </div>
        <div className="search-results" id="title-results" role="listbox">
          {empty ? (
            <div className="search-empty">
              <p>No titles match “{query}”.</p>
              {/* The kind filter applies to this list but is set elsewhere, so
                  without saying so the palette just looks broken. */}
              {kind !== "All" && (
                <p>
                  The <b>{kind}</b> filter is narrowing these results.{" "}
                  <button onClick={onClearKind}>Show all types</button>
                </p>
              )}
            </div>
          ) : (
            hits.map(({ story, ranges }, index) => (
              <button
                id={`result-${story.id}`}
                role="option"
                aria-selected={activeResult === index}
                className={activeResult === index ? "active" : ""}
                key={story.id}
                onMouseEnter={() => onActiveResultChange(index)}
                onClick={() => onChoose(story.id)}
              >
                <StoryArtwork story={story} variant="thumb" />
                <span className="result-copy">
                  <span className="result-badges">
                    <span className={`kind-badge ${story.kind.toLowerCase()}`}>{story.kind}</span>
                    <span>{story.lane}</span>
                  </span>
                  <strong><Highlight text={story.title} ranges={ranges} /></strong>
                  <small>{story.storyYearLabel} · {story.releaseYear} release</small>
                </span>
                <i>{story.deps.length ? `${story.deps.length} links` : "Origin"} <b>→</b></i>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/** Wrap the matched span so the reason a result is here is visible. */
function Highlight({ text, ranges }: { text: string; ranges: MatchRange[] }) {
  if (ranges.length === 0) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.start > cursor) parts.push(text.slice(cursor, range.start));
    parts.push(<mark key={index}>{text.slice(range.start, range.end)}</mark>);
    cursor = range.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}
