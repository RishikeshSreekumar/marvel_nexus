import type { Story } from "../lib/graph";
import { NexusSearchIcon } from "./icons";
import StoryArtwork from "./StoryArtwork";

/** Results rendered, and the ceiling for keyboard navigation. */
export const MAX_RESULTS = 18;

export default function SearchPalette({
  query,
  results,
  activeResult,
  inputRef,
  onQueryChange,
  onActiveResultChange,
  onKeyDown,
  onChoose,
  onClose,
}: {
  query: string;
  results: Story[];
  activeResult: number;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onQueryChange: (value: string) => void;
  onActiveResultChange: (index: number) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onChoose: (id: string) => void;
  onClose: () => void;
}) {
  const visible = results.slice(0, MAX_RESULTS);

  return (
    <div
      className="search-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Find a Marvel title"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="search-panel">
        <div className="search-input">
          <NexusSearchIcon />
          <input
            ref={inputRef}
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="title-results"
            aria-activedescendant={
              visible[activeResult] ? `result-${visible[activeResult].id}` : undefined
            }
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Where are you headed?"
          />
          <button onClick={onClose}>ESC</button>
        </div>
        <div className="search-meta">
          <span>{results.length} STORIES</span>
          <span>SELECT A DESTINATION</span>
        </div>
        <div className="search-results" id="title-results" role="listbox">
          {visible.map((story, index) => (
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
                <strong>{story.title}</strong>
                <small>{story.storyYearLabel} · {story.releaseYear} release</small>
              </span>
              <i>{story.deps.length ? `${story.deps.length} links` : "Origin"} <b>→</b></i>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
