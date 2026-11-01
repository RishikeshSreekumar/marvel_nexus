import { useEffect, useMemo, useRef, useState } from "react";
import {
  appearancesInOrder,
  characterById,
  characters,
  debutOf,
  mantleChains,
  portraitOf,
  relationsOf,
  teams,
  type Character,
  type TeamId,
} from "../lib/characters";
import { FEATURED_STORY_ID, type Story } from "../lib/graph";
import { normalize } from "../lib/search";
import { allStories } from "../lib/stories";
import { CheckIcon } from "./icons";
import PremiereCountdown from "./PremiereCountdown";

type TreeMode = "teams" | "mantles";

const initials = (name: string) =>
  name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

/**
 * Portrait resolved ahead of time into portraits.json, over the initials on
 * the team colour. The initials stay underneath, so a slow or broken image
 * never leaves an empty circle.
 */
function Portrait({ character, size = "sm" }: { character: Character; size?: "sm" | "lg" }) {
  const src = portraitOf(character);
  const [failed, setFailed] = useState(false);
  return (
    <span className={`char-portrait char-portrait-${size}`} aria-hidden="true">
      <span>{initials(character.name)}</span>
      {src && !failed && (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

/**
 * The character bible: a team → character tree, the mantle lineages, and a
 * detail panel that ties every character back to the story graph.
 *
 * Selection lives in `?c=` so a character can be linked to directly — the
 * graph Inspector's cast chips do exactly that.
 */
export default function CharacterTree({
  byId,
  watched,
  onTraceStory,
}: {
  byId: Map<string, Story>;
  watched: Set<string>;
  onTraceStory: (id: string) => void;
}) {
  const [mode, setMode] = useState<TreeMode>("teams");
  const [query, setQuery] = useState("");
  const [rosterOnly, setRosterOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<TeamId>>(new Set());
  const detailRef = useRef<HTMLElement>(null);

  // URL → state after mount (never during render: the HTML is static).
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("c");
    if (id && characterById.has(id)) setSelectedId(id);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (selectedId) params.set("c", selectedId);
    else params.delete("c");
    const search = params.toString();
    history.replaceState(null, "", `/characters${search ? `?${search}` : ""}`);
  }, [selectedId]);

  const featured = byId.get(FEATURED_STORY_ID);
  const rosterCount = characters.filter((character) => character.doomsday).length;

  const visible = useMemo(() => {
    const needle = normalize(query);
    return characters.filter((character) => {
      if (rosterOnly && !character.doomsday) return false;
      if (!needle) return true;
      return [character.name, character.alias ?? "", character.actor]
        .some((text) => normalize(text).includes(needle));
    });
  }, [query, rosterOnly]);
  const visibleIds = useMemo(() => new Set(visible.map(({ id }) => id)), [visible]);

  const progressOf = (character: Character) => {
    const total = character.appearances.length;
    const seen = character.appearances.filter((id) => watched.has(id)).length;
    return { seen, total, percent: total ? Math.round((seen / total) * 100) : 0 };
  };

  const select = (id: string) => {
    setSelectedId(id);
    // On a phone the panel is a sheet; on desktop it is beside the tree, so
    // bring it into view if the reader has scrolled away from it.
    requestAnimationFrame(() => {
      if (matchMedia("(min-width: 901px)").matches) {
        detailRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    });
  };

  const toggleTeam = (id: TeamId) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selected = selectedId ? characterById.get(selectedId) ?? null : null;
  const chains = useMemo(() => mantleChains(), []);

  return (
    <section className="characters">
      <header className="characters-head">
        <div className="section-kicker">THE CHARACTER BIBLE</div>
        <h1>Who’s who in the <span>multiverse</span></h1>
        <p>
          {characters.length} characters across {teams.length} teams · tap anyone to see where
          they appear and what to watch
        </p>
        <PremiereCountdown stories={allStories} activeId={null} onTrace={onTraceStory} />
        <div className="characters-controls">
          <label className="characters-search">
            <span className="sr-only">Filter characters</span>
            <input
              type="search"
              value={query}
              placeholder="Name, codename or actor"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {featured && (
            <button
              type="button"
              className={`roster-toggle ${rosterOnly ? "active" : ""}`}
              aria-pressed={rosterOnly}
              onClick={() => setRosterOnly((on) => !on)}
            >
              {featured.title.replace(/^Avengers: /, "")} roster <i>{rosterCount}</i>
            </button>
          )}
          <div className="segmented" role="group" aria-label="Tree view">
            <button
              aria-pressed={mode === "teams"}
              className={mode === "teams" ? "active" : ""}
              onClick={() => setMode("teams")}
            >
              Teams
            </button>
            <button
              aria-pressed={mode === "mantles"}
              className={mode === "mantles" ? "active" : ""}
              onClick={() => setMode("mantles")}
            >
              Mantles
            </button>
          </div>
        </div>
      </header>

      <div className={`characters-body ${selected ? "has-selection" : ""}`}>
        {mode === "teams" ? (
          <div className="char-tree">
            <div className="char-root">
              <b>Marvel Nexus</b>
              <i>{visible.length} of {characters.length} characters</i>
            </div>
            {visible.length === 0 && (
              <p className="char-empty">
                Nobody matches <b>{query}</b>.{" "}
                <button type="button" onClick={() => { setQuery(""); setRosterOnly(false); }}>
                  Clear filters
                </button>
              </p>
            )}
            <ol className="char-branches">
              {teams.map((team) => {
                const members = visible.filter((character) => character.team === team.id);
                if (!members.length) return null;
                const isOpen = !collapsed.has(team.id);
                const roster = members.filter((character) => character.doomsday).length;
                return (
                  <li key={team.id} className="char-branch" data-tone={team.tone}>
                    <button
                      type="button"
                      className="char-branch-head"
                      aria-expanded={isOpen}
                      onClick={() => toggleTeam(team.id)}
                    >
                      <b>{team.name}</b>
                      <i>{team.blurb}</i>
                      <span>
                        {members.length}
                        {roster > 0 && !rosterOnly && <em title={`${roster} in the ${featured?.title} cast`}>{roster}★</em>}
                      </span>
                    </button>
                    {isOpen && (
                      <ul className="char-leaves">
                        {members.map((character) => {
                          const progress = progressOf(character);
                          const debut = debutOf(character, byId);
                          return (
                            <li key={character.id}>
                              <button
                                type="button"
                                className={`char-node ${character.id === selectedId ? "selected" : ""}`}
                                aria-pressed={character.id === selectedId}
                                onClick={() => select(character.id)}
                              >
                                <Portrait character={character} />
                                <span className="char-node-text">
                                  <strong>{character.name}</strong>
                                  <small>
                                    {character.alias ?? character.actor}
                                    {debut && ` · ${debut.releaseYear}`}
                                  </small>
                                </span>
                                {character.doomsday && <em className="char-star" title={`In ${featured?.title}`}>★</em>}
                                <span
                                  className="char-meter"
                                  style={{ "--progress": `${progress.percent}%` } as React.CSSProperties}
                                  title={`${progress.seen} of ${progress.total} appearances watched`}
                                />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        ) : (
          <div className="mantle-list">
            <p className="mantle-intro">
              Titles that have changed hands. Each line runs from the first holder to the
              current one.
            </p>
            {chains.map((chain) => (
              <section className="mantle-chain" key={`${chain.title}-${chain.holders.join()}`}>
                <h3>{chain.title}</h3>
                <ol>
                  {chain.holders.map((id, index) => {
                    const character = characterById.get(id);
                    if (!character) return null;
                    return (
                      <li key={id} className={visibleIds.has(id) ? "" : "is-dim"}>
                        {index > 0 && <span className="mantle-arrow" aria-label="passed to">→</span>}
                        <button
                          type="button"
                          className={`char-node ${id === selectedId ? "selected" : ""}`}
                          onClick={() => select(id)}
                        >
                          <Portrait character={character} />
                          <span className="char-node-text">
                            <strong>{character.name}</strong>
                            <small>{character.actor}</small>
                          </span>
                          {character.doomsday && <em className="char-star">★</em>}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        )}

        {selected ? (
          <CharacterDetail
            key={selected.id}
            panelRef={detailRef}
            character={selected}
            byId={byId}
            watched={watched}
            featured={featured ?? null}
            onSelect={select}
            onTraceStory={onTraceStory}
            onClose={() => setSelectedId(null)}
          />
        ) : (
          <aside className="char-detail char-detail-empty" ref={detailRef}>
            <b>Pick a character</b>
            <p>
              See every appearance in story order, which titles you have already watched, the
              mantles they carry, and who they are tied to.
            </p>
          </aside>
        )}
      </div>
    </section>
  );
}

function CharacterDetail({
  panelRef,
  character,
  byId,
  watched,
  featured,
  onSelect,
  onTraceStory,
  onClose,
}: {
  panelRef: React.RefObject<HTMLElement | null>;
  character: Character;
  byId: Map<string, Story>;
  watched: Set<string>;
  featured: Story | null;
  onSelect: (id: string) => void;
  onTraceStory: (id: string) => void;
  onClose: () => void;
}) {
  const appearances = appearancesInOrder(character, byId);
  const seen = appearances.filter(({ id }) => watched.has(id)).length;
  const percent = appearances.length ? Math.round((seen / appearances.length) * 100) : 0;
  const team = teams.find(({ id }) => id === character.team);
  const inherited = character.mantles ?? [];
  const passed = characters.flatMap((other) =>
    (other.mantles ?? [])
      .filter((mantle) => mantle.from === character.id)
      .map((mantle) => ({ title: mantle.title, to: other })),
  );
  const ties = relationsOf(character.id);
  const nextUp = appearances.find(({ id }) => !watched.has(id));
  const dragRef = useRef<number | null>(null);

  return (
    <aside
      className="char-detail"
      ref={panelRef}
      role="region"
      aria-label={`Character: ${character.name}`}
      data-tone={team?.tone}
    >
      <div
        className="sheet-handle"
        onTouchStart={(event) => { dragRef.current = event.touches[0]?.clientY ?? null; }}
        onTouchMove={(event) => {
          const start = dragRef.current;
          const y = event.touches[0]?.clientY;
          if (start !== null && y !== undefined && y - start > 56) {
            dragRef.current = null;
            onClose();
          }
        }}
        onTouchEnd={() => { dragRef.current = null; }}
      >
        <i aria-hidden="true" />
        <button type="button" className="sheet-close" onClick={onClose} aria-label="Close character">
          ×
        </button>
      </div>
      <div className="char-detail-top">
        <Portrait character={character} size="lg" />
        <div>
          <span className="char-team">{team?.name}</span>
          <h2>{character.name}</h2>
          {character.alias && <p className="char-alias">{character.alias}</p>}
          <p className="char-actor">{character.actor}</p>
        </div>
      </div>
      {character.doomsday && featured && (
        <p className="char-roster-note">★ Announced for {featured.title}</p>
      )}
      <p className="char-note">{character.note}</p>

      <div className="char-progress" style={{ "--progress": `${percent}%` } as React.CSSProperties}>
        <span>
          <b>{seen}</b> of {appearances.length} appearances watched
        </span>
        <i aria-hidden="true" />
      </div>
      {nextUp && (
        <button type="button" className="destination-button" onClick={() => onTraceStory(nextUp.id)}>
          Next up: {nextUp.title} ↗
        </button>
      )}

      {(inherited.length > 0 || passed.length > 0) && (
        <div className="char-section">
          <span>MANTLES</span>
          <ul className="char-mantles">
            {inherited.map((mantle) => {
              const from = characterById.get(mantle.from);
              return (
                <li key={`in-${mantle.title}`}>
                  Took up <b>{mantle.title}</b> from{" "}
                  <button type="button" onClick={() => onSelect(mantle.from)}>{from?.name}</button>
                </li>
              );
            })}
            {passed.map(({ title, to }) => (
              <li key={`out-${title}-${to.id}`}>
                Passed <b>{title}</b> to{" "}
                <button type="button" onClick={() => onSelect(to.id)}>{to.name}</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ties.length > 0 && (
        <div className="char-section">
          <span>TIES</span>
          <div className="char-ties">
            {ties.map((tie) => {
              const other = characterById.get(tie.id);
              if (!other) return null;
              return (
                <button type="button" key={tie.id} onClick={() => onSelect(tie.id)}>
                  {other.name} <i>{tie.label}</i>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="char-section">
        <span>APPEARANCES · STORY ORDER</span>
        <ol className="char-appearances">
          {appearances.map((story) => (
            <li key={story.id} className={watched.has(story.id) ? "is-watched" : ""} data-lane={story.lane}>
              <span className="char-appearance-tick" aria-label={watched.has(story.id) ? "Watched" : "Not watched"}>
                {watched.has(story.id) && <CheckIcon />}
              </span>
              <a href={`/graph?to=${story.id}`} onClick={(event) => { event.preventDefault(); onTraceStory(story.id); }}>
                <strong>{story.title}</strong>
                <small>
                  {story.storyYearLabel} · {story.kind}
                  {story.upcoming ? " · upcoming" : ""}
                </small>
              </a>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}
