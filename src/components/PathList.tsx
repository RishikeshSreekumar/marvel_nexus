import { columnLabel, type GraphEdge, type KindFilter, type Story } from "../lib/graph";
import { CheckIcon } from "./icons";

/**
 * The map as a vertical list: the same waves, the same filters, read top to
 * bottom. On a phone this is the easier way to follow a path — no panning,
 * one thumb — and it doubles as a watch order, because every wave only needs
 * the waves above it.
 *
 * Takes the columns the map already computed, so the two layouts can never
 * disagree about what is on the path or which wave a title sits in.
 */
export default function PathList({
  columns,
  hasDestination,
  destinationId,
  inspectedId,
  kind,
  watched,
  edges,
  byId,
  onInspect,
  onToggleWatched,
}: {
  columns: Story[][];
  hasDestination: boolean;
  destinationId: string | null;
  inspectedId: string;
  kind: KindFilter;
  watched: Set<string>;
  edges: GraphEdge[];
  byId: Map<string, Story>;
  onInspect: (id: string) => void;
  onToggleWatched: (id: string) => void;
}) {
  const requires = new Map<string, string[]>();
  for (const edge of edges) {
    if (!requires.has(edge.to)) requires.set(edge.to, []);
    requires.get(edge.to)!.push(edge.from);
  }
  const lastIndex = columns.length - 1;

  return (
    <div className="path-list" aria-label="Watch-order list">
      {columns.map((column, index) => {
        const label = columnLabel(column, index, lastIndex, hasDestination);
        const done = column.filter(({ id }) => watched.has(id)).length;
        return (
          <section className="path-wave" key={index}>
            <header>
              <b>{label.title}</b>
              <i>{label.detail}</i>
              <span>{done}/{column.length}</span>
            </header>
            <ol>
              {column.map((story) => {
                const needs = (requires.get(story.id) ?? [])
                  .map((id) => byId.get(id)?.title)
                  .filter(Boolean);
                const isWatched = watched.has(story.id);
                return (
                  <li
                    key={story.id}
                    data-lane={story.lane}
                    className={[
                      "path-item",
                      isWatched ? "is-watched" : "",
                      story.optional ? "is-optional" : "",
                      story.id === destinationId ? "is-destination" : "",
                      story.id === inspectedId ? "is-inspected" : "",
                      kind !== "All" && story.kind !== kind ? "is-filtered" : "",
                    ].join(" ")}
                  >
                    <button
                      type="button"
                      className="path-item-main"
                      onClick={() => onInspect(story.id)}
                    >
                      <span className="path-item-meta">
                        {story.kind} · {story.releaseYear}
                        {story.optional && <em>Deep cut</em>}
                        {story.upcoming && <em className="soon">Upcoming</em>}
                      </span>
                      <strong>{story.title}</strong>
                      <span className="path-item-needs">
                        {needs.length ? `Needs ${needs.join(", ")}` : "Origin — start anywhere here"}
                      </span>
                    </button>
                    {story.id !== destinationId && (
                      <button
                        type="button"
                        className={`path-check ${isWatched ? "done" : ""}`}
                        aria-pressed={isWatched}
                        aria-label={`${isWatched ? "Unmark" : "Mark"} ${story.title} as watched`}
                        onClick={() => onToggleWatched(story.id)}
                      >
                        <CheckIcon />
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
