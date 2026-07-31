import type { GraphEdge, Story } from "../lib/graph";
import StoryArtwork from "./StoryArtwork";

/**
 * Detail panel for the inspected story.
 *
 * The caller keys this on the story id to force a remount, which is what
 * replays the inspector-in animation — do not drop that key.
 */
export default function Inspector({
  story,
  destination,
  chronology,
  byId,
  edges,
  visibleIds,
  watched,
  totalPrerequisites,
  onChoose,
  onInspect,
  onToggleWatched,
}: {
  story: Story;
  destination: Story;
  chronology: readonly Story[];
  byId: Map<string, Story>;
  edges: GraphEdge[];
  visibleIds: Set<string>;
  watched: Set<string>;
  totalPrerequisites: number;
  onChoose: (id: string) => void;
  onInspect: (id: string) => void;
  onToggleWatched: (id: string) => void;
}) {
  const position = chronology.findIndex((entry) => entry.id === story.id);
  const requires = story.deps.filter((id) => visibleIds.has(id));
  // Why this story is on the map at all: the visible stories that depend on it.
  const requiredBy = edges
    .filter((edge) => edge.from === story.id && visibleIds.has(edge.to))
    .map((edge) => edge.to);

  return (
    <aside className="inspector" style={{ viewTransitionName: "story-inspector" }}>
      <StoryArtwork story={story} variant="backdrop" />
      <div className="inspector-top">
        <span className={`kind-badge ${story.kind.toLowerCase()}`}>{story.kind}</span>
        <span>{story.releaseYear} RELEASE</span>
      </div>
      <span className="index-label">Timeline position</span>
      <div className="inspector-index">
        {position >= 0 ? String(position + 1).padStart(2, "0") : "BR"}
      </div>
      <h3>{story.title}</h3>
      <p>{story.note}</p>
      <dl>
        <div>
          <dt>Story year</dt>
          <dd>{story.storyYearLabel}{story.editorialPlacement ? " †" : ""}</dd>
        </div>
        <div><dt>Release year</dt><dd>{story.releaseYear}</dd></div>
        <div><dt>Branch</dt><dd>{story.lane} Saga</dd></div>
        <div><dt>Direct links</dt><dd>{story.deps.length}</dd></div>
        <div><dt>Total path</dt><dd>{totalPrerequisites} prerequisites</dd></div>
      </dl>
      {story.id === destination.id ? (
        <p className="destination-note">
          {totalPrerequisites === 0
            ? `${destination.title} is an origin point — nothing is required. Start here.`
            : "This is your destination. Watched progress applies to prerequisites."}
        </p>
      ) : (
        <>
          <button className="destination-button" onClick={() => onChoose(story.id)}>
            Set as destination
          </button>
          <button
            className={`watch-button ${watched.has(story.id) ? "done" : ""}`}
            onClick={() => onToggleWatched(story.id)}
          >
            {watched.has(story.id) ? "✓ Watched" : "+ Mark as watched"}
          </button>
        </>
      )}
      {requires.length > 0 && (
        <div className="direct-list">
          <span>DIRECTLY REQUIRES</span>
          {requires.map((id) => (
            <button key={id} onClick={() => onInspect(id)}>
              {byId.get(id)?.title} <i>Inspect</i>
            </button>
          ))}
        </div>
      )}
      {requiredBy.length > 0 && (
        <div className="direct-list">
          <span>ON THIS MAP BECAUSE OF</span>
          {requiredBy.map((id) => (
            <button key={id} onClick={() => onInspect(id)}>
              {byId.get(id)?.title} <i>Inspect</i>
            </button>
          ))}
        </div>
      )}
      {story.editorialPlacement && (
        <p className="editorial-note">
          † Story placement is an editorial estimate; Marvel has not fixed an official year.
        </p>
      )}
    </aside>
  );
}
