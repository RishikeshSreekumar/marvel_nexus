import { useMemo, useState } from "react";
import BrandLockup from "./BrandLockup";
import HeroParticles, { type FlowLane } from "./HeroParticles";
import type { Lane } from "../lib/graph";
import { allStories } from "../lib/stories";

/**
 * The hero's Yggdrasil.
 *
 * Not a decoration picked at random. The product's claim is that the MCU is a
 * *branching* structure, so the headline graphic is the branching structure:
 * Loki at the End of Time holding the timelines, one bough per saga lane, drawn
 * from the same `allStories` array the graph page reads.
 *
 * Everything below the `LANES` table is geometry. Everything in it is data.
 */

/** Where the trunk splits into boughs. `loki-1` depends on `endgame`; this is that edge. */
const FORK = [240, 296] as const;

/** Where the threads gather above the figure and become one trunk. */
const GATHER = [240, 350] as const;

type LaneSpec = {
  lane: Lane;
  /** Bough tip in viewBox units. */
  tip: readonly [number, number];
  /** Label offset from the tip. Negative dy pushes the label above the tip. */
  labelDy: number;
  /** Destination the bough navigates to — a representative title for the saga. */
  anchorId: string;
};

/**
 * Left-to-right reading order, with Multiverse dead centre: it is both the
 * largest lane and the one the whole visual is about.
 */
const LANE_SPECS: readonly LaneSpec[] = [
  { lane: "Legacy", tip: [60, 206], labelDy: 32, anchorId: "logan" },
  { lane: "Infinity", tip: [132, 112], labelDy: -28, anchorId: "endgame" },
  { lane: "Multiverse", tip: [240, 70], labelDy: -28, anchorId: "loki-2" },
  { lane: "Street", tip: [348, 112], labelDy: -28, anchorId: "daredevil-ba" },
  { lane: "Future", tip: [420, 206], labelDy: 32, anchorId: "doomsday" },
] as const;

function cubicAt(
  [x0, y0]: readonly [number, number],
  [x1, y1]: readonly [number, number],
  [x2, y2]: readonly [number, number],
  [x3, y3]: readonly [number, number],
  t: number,
): [number, number] {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [
    a * x0 + b * x1 + c * x2 + d * x3,
    a * y0 + b * y1 + c * y2 + d * y3,
  ];
}

/**
 * A bough leaves the fork travelling straight up before peeling outward, and
 * flattens out as it reaches its tip. The flat arrival is what makes room for
 * the label: come in steeply and the bough runs straight through its own text.
 * Returns the control points too, so twigs can be planted along the same curve
 * instead of guessing at it.
 */
function boughCurve(tip: readonly [number, number]) {
  const [tx, ty] = tip;
  const rise = FORK[1] - ty;
  const c1: [number, number] = [FORK[0] + (tx - FORK[0]) * .05, FORK[1] - rise * .55];
  const c2: [number, number] = [tx - (tx - FORK[0]) * .55, ty + rise * .02];
  return {
    d: `M${FORK[0]} ${FORK[1]} C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${tx} ${ty}`,
    c1,
    c2,
  };
}

function branchPath([x1, y1]: readonly [number, number], [x2, y2]: readonly [number, number]) {
  // Peel away horizontally first, so a twig reads as leaving its bough
  // rather than as a straight line drawn between two dots.
  const midX = x1 + (x2 - x1) * .62;
  return `M${x1.toFixed(1)} ${y1.toFixed(1)} C ${midX.toFixed(1)} ${y1.toFixed(1)}, ${(x2 + (x1 - x2) * .18).toFixed(1)} ${y2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

/**
 * Real universe designations, lifted from `storyYearLabel` rather than invented.
 * The Legacy lane carries Earth-10005 (the Fox mutants) and Earth-92131 (X-Men
 * '97); Fantastic Four carries Earth-828.
 *
 * These are read out in the caption rather than printed on the twigs. Set as
 * labels they need 7.5px type wedged between branches, where they collide with
 * the lane names and with neighbouring boughs at every size worth shipping.
 */
const DESIGNATIONS = new Map<Lane, string[]>();
for (const story of allStories) {
  const match = /Earth-\d+/.exec(story.storyYearLabel);
  if (!match) continue;
  const found = DESIGNATIONS.get(story.lane) ?? [];
  if (!found.includes(match[0])) found.push(match[0]);
  DESIGNATIONS.set(story.lane, found);
}

/**
 * Static per-lane geometry and membership. Only the watched tally changes as
 * the user ticks stories off, so everything else is built once at module load.
 */
const LANES = LANE_SPECS.map((spec) => {
  const ids = allStories.filter((story) => story.lane === spec.lane).map(({ id }) => id);
  const curve = boughCurve(spec.tip);
  const designations = DESIGNATIONS.get(spec.lane) ?? [];
  // One twig per seven titles, capped: past four the tip labels stop being legible.
  const twigCount = Math.min(4, Math.max(2, Math.ceil(ids.length / 7)));
  // Twigs lean away from the trunk. The centre bough has no "away", so it
  // alternates instead — sending them all one way walks them into its neighbour.
  const lean = Math.sign(spec.tip[0] - FORK[0]);
  const twigs = Array.from({ length: twigCount }, (_, index) => {
    const outward = lean || (index % 2 === 0 ? -1 : 1);
    const t = .38 + (index * .46) / Math.max(1, twigCount - 1);
    const root = cubicAt(FORK, curve.c1, curve.c2, spec.tip, t);
    const reach = 17 + index * 4;
    const end: [number, number] = [root[0] + outward * reach, root[1] + 11 + index * 3];
    return { d: branchPath(root, end), end };
  });
  return {
    ...spec,
    ids,
    designations,
    count: ids.length,
    d: curve.d,
    // Kept alongside the path string so the particle canvas rides the exact
    // same cubic instead of re-deriving (and eventually diverging from) it.
    curve: { p0: FORK, c1: curve.c1, c2: curve.c2, p3: spec.tip },
    // Thickness carries the count: Multiverse is the heavy bough, Future a new shoot.
    width: 1.3 + ids.length / 11,
    twigs,
  };
});

const TOTAL = allStories.length;

/**
 * The story each bough links to. Exported so a test can assert they all still
 * resolve: a renamed id would not throw here, it would quietly send the reader
 * to the unfiltered graph (`parseUrlState` falls back to ALL_STORIES_ID), which
 * is exactly the kind of rot nobody notices.
 */
export const HERO_ANCHOR_IDS = LANE_SPECS.map(({ anchorId }) => anchorId);

/** The trunk: one sacred timeline from Loki's hands to the nexus event. */
const TRUNK_CURVE = {
  p0: GATHER,
  c1: [232, 366],
  c2: [248, 330],
  p3: FORK,
} as const;
const TRUNK = `M${GATHER[0]} ${GATHER[1]} C ${TRUNK_CURVE.c1.join(" ")}, ${TRUNK_CURVE.c2.join(" ")}, ${FORK[0]} ${FORK[1]}`;

/** Shared by the SVG viewBox and the canvas transform. Module-level identity
    matters: a fresh array per render would restart the particle effect on
    every hover. */
const VIEW_BOX = [480, 540] as const;

/** What the particle canvas needs from each bough: its cubic and its traffic. */
const FLOW_LANES: readonly FlowLane[] = LANES.map(({ lane, curve, count }) => ({
  lane,
  curve,
  weight: count,
}));

/**
 * Loki at the End of Time, staged the way the finale stages him: cloaked
 * shoulders, the horned helm above them, and both arms raised with the
 * timeline threads gathered in his hands. Still a silhouette — a full
 * illustration needs assets the project does not have — but a figure this
 * time, not a floating helmet, and the threads leave his *hands*: on screen
 * he holds the strands, he does not wear them.
 */
const LOKI =
  // Cloak, base on the plinth, drawn up to the shoulder line.
  "M210 518 C 207 494, 211 474, 221 461 C 227 454, 253 454, 259 461 " +
  "C 269 474, 273 494, 270 518 C 251 523, 229 523, 210 518 Z " +
  // Helm dome, closed flat where it meets the shoulders: the line reads as a
  // collar. No cheek-guard curls — at this scale they read as a drooping jaw.
  "M226 461 C 226 442, 232 433, 240 433 C 248 433, 254 442, 254 461 Z " +
  // Left horn: a tall crescent off the brow, hooked back in at the tip. The
  // inner edge returns straight to the brow so the horn's root leaves room
  // for the raised arm beside the helm.
  "M223 443 C 209 437, 197 423, 192 403 C 188 387, 192 374, 202 367 " +
  "C 199 380, 199 393, 203 405 C 207 419, 213 431, 223 443 Z " +
  // Right horn, mirrored about the spine.
  "M257 443 C 271 437, 283 423, 288 403 C 292 387, 288 374, 278 367 " +
  "C 281 380, 281 393, 277 405 C 273 419, 267 431, 257 443 Z";

/** Arms lifted from the shoulders, hugging the helm, no inward hook. */
const ARMS = [
  "M227 462 C 221 453, 220 440, 222 426",
  "M253 462 C 259 453, 260 440, 258 426",
] as const;

/** The hands the threads leave from — raised beside the crown of the helm. */
const HAND_TIPS = [
  [222, 424],
  [258, 424],
] as const;

/** Threads running from each hand (and over the crown) up into the trunk. */
const THREADS = [
  "M222 421 C 226 396, 230 372, 236 352",
  "M240 431 C 240 404, 240 376, 240 350",
  "M258 421 C 254 396, 250 372, 244 352",
] as const;

/** A timeline the TVA cut off. Draws, flares, dissolves, repeats. */
const PRUNED = branchPath([236, 326], [148, 372]);

/** Marketing hero for the landing page. */
export function HomeHero({
  chronologyCount,
  legacyCount,
  watched,
  onOpenSearch,
}: {
  chronologyCount: number;
  legacyCount: number;
  watched: ReadonlySet<string>;
  onOpenSearch: () => void;
}) {
  const [active, setActive] = useState<Lane | null>(null);

  // The only part of the tree that is not static. `watched` is a fresh Set on
  // every tick, so identity comparison is enough to keep this honest.
  const progress = useMemo(() => {
    const map = new Map<Lane, { seen: number; percent: number }>();
    for (const lane of LANES) {
      const seen = lane.ids.reduce((total, id) => total + (watched.has(id) ? 1 : 0), 0);
      map.set(lane.lane, {
        seen,
        percent: lane.count === 0 ? 0 : Math.round((seen / lane.count) * 100),
      });
    }
    return map;
  }, [watched]);

  const activeLane = active ? LANES.find(({ lane }) => lane === active) : undefined;
  const activeProgress = activeLane ? progress.get(activeLane.lane) : undefined;

  return (
    <section className="hero">
      <div className="hero-copy">
        <div className="eyebrow"><i /> MCU STORY NAVIGATOR · {TOTAL} TITLES · {LANES.length} SAGAS</div>
        <h1>Every story.<br /><em>One connected universe.</em></h1>
        <p>
          Pick any Marvel title. See what it depends on, trace every branch backward,
          then mark your way through {chronologyCount} MCU season-level stops
          + {legacyCount} legacy branch titles.
        </p>
        <div className="hero-actions">
          <button className="primary" onClick={onOpenSearch}>
            Choose your destination <span>→</span>
          </button>
          <a className="secondary" href="/timeline">Browse the timeline</a>
        </div>
      </div>

      <nav className="multiverse-showcase" aria-label="Explore the multiverse by saga">
        <div className="multiverse-glow" aria-hidden="true" />
        <div className="multiverse-grid" aria-hidden="true" />
        <div className="yggdrasil-stage">
        <svg className="multiverse-canvas yggdrasil" viewBox={`0 0 ${VIEW_BOX[0]} ${VIEW_BOX[1]}`}>
          {/* Loki, at the End of Time, holding the timelines. */}
          <g className="yggdrasil-root" aria-hidden="true">
            <path className="yggdrasil-plinth" d="M156 522 L324 522" />
            <path className="yggdrasil-figure" d={LOKI} />
            {ARMS.map((d) => <path className="yggdrasil-arm" key={d} d={d} />)}
            {HAND_TIPS.map(([x, y]) => <circle className="yggdrasil-hand" key={x} cx={x} cy={y} r="3" />)}
            {THREADS.map((d) => <path className="yggdrasil-thread" key={d} d={d} />)}
            <text className="yggdrasil-caption" x="240" y="534" textAnchor="middle">END OF TIME</text>
          </g>

          {/* The trunk, drawn twice: a steady line, and a short dash travelling
              along it so the timeline reads as flowing rather than as a rule. */}
          <path className="multiverse-trunk" d={TRUNK} aria-hidden="true" />
          <path className="multiverse-trunk-flow" d={TRUNK} aria-hidden="true" />

          {/* A branch the TVA pruned. */}
          <path className="prune-branch" d={PRUNED} aria-hidden="true" />

          {LANES.map((lane, index) => {
            const seen = progress.get(lane.lane) ?? { seen: 0, percent: 0 };
            const unwatched = lane.count - seen.seen;
            return (
              <a
                key={lane.lane}
                href={`/graph?to=${lane.anchorId}`}
                aria-label={
                  `${lane.lane} saga, ${lane.count} titles, ${unwatched} unwatched` +
                  (lane.designations.length ? `, ${lane.designations.join(", ")}` : "")
                }
                onMouseEnter={() => setActive(lane.lane)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(lane.lane)}
                onBlur={() => setActive(null)}
              >
                <g
                  className="bough-group"
                  data-lane={lane.lane}
                  style={{ "--branch-delay": `${index * 420}ms` } as React.CSSProperties}
                >
                  {/* Widened invisible hit target: a 3px stroke is not a click target. */}
                  <path className="bough-hit" d={lane.d} />
                  <path className="bough" d={lane.d} pathLength={100} style={{ strokeWidth: lane.width }} />
                  {/* Watched completion, as a fraction of the bough's own length.
                      pathLength normalises it to 100 so no measurement is needed. */}
                  <path
                    className="bough-progress"
                    d={lane.d}
                    pathLength={100}
                    style={{ strokeWidth: lane.width, strokeDasharray: `${seen.percent} 100` }}
                  />

                  {lane.twigs.map((twig) => (
                    <g className="twig-group" key={twig.d}>
                      <path className="twig" d={twig.d} />
                      <circle className="twig-bud" cx={twig.end[0]} cy={twig.end[1]} r="2.2" />
                    </g>
                  ))}

                  <circle className="branch-halo" cx={lane.tip[0]} cy={lane.tip[1]} r="24" />
                  <circle className="branch-ring" cx={lane.tip[0]} cy={lane.tip[1]} r="17" />
                  <circle className="branch-core" cx={lane.tip[0]} cy={lane.tip[1]} r="5" />
                  <text
                    className="branch-label"
                    x={lane.tip[0]}
                    y={lane.tip[1] + lane.labelDy}
                    textAnchor="middle"
                  >
                    {lane.lane.toUpperCase()}
                  </text>
                  <text
                    className="branch-note"
                    x={lane.tip[0]}
                    y={lane.tip[1] + lane.labelDy + (lane.labelDy < 0 ? -11 : 12)}
                    textAnchor="middle"
                  >
                    {lane.count} TITLES
                  </text>
                </g>
              </a>
            );
          })}

          {/* The nexus event itself: where Loki branches off Endgame. */}
          <g aria-hidden="true">
            <rect className="multiverse-nexus" x={FORK[0] - 6} y={FORK[1] - 6} width="12" height="12" />
            <text className="multiverse-spine-label" x={FORK[0] + 16} y={FORK[1] + 3}>NEXUS EVENT · ENDGAME</text>
            {/* The trunk's own designation: the MCU mainline is Earth-616
                (named on screen in Multiverse of Madness), and the TVA's name
                for it is the Sacred Timeline. */}
            <text className="multiverse-spine-sub" x={FORK[0] + 16} y={FORK[1] + 15}>SACRED TIMELINE · EARTH-616</text>
          </g>
        </svg>
        {/* Canvas weather over the SVG skeleton: motes flowing hands → trunk →
            boughs. Painted above the strokes (additive light), but it is
            pointer-events:none and every mote dies before the labels. */}
        <HeroParticles
          trunk={TRUNK_CURVE}
          lanes={FLOW_LANES}
          viewBox={VIEW_BOX}
          active={active}
        />
        </div>

        <div className="showcase-caption" aria-hidden="true">
          <i />
          {activeLane && activeProgress
            ? <>
                {activeLane.lane.toUpperCase()}
                <span>
                  {activeLane.count} TITLES · {activeLane.count - activeProgress.seen} UNWATCHED
                  {activeLane.designations.length ? ` · ${activeLane.designations.join(" ")}` : ""}
                </span>
              </>
            : <>YGGDRASIL <span>{TOTAL} TITLES · {LANES.length} SAGAS</span></>}
        </div>
      </nav>
    </section>
  );
}

/** The three-step explainer. Revealed by the shared data-reveal observer. */
export function HomeMethod() {
  const steps = [
    {
      n: "01",
      title: "Pick the destination",
      body: "Choose the story you want to watch. The graph collapses the universe around it.",
    },
    {
      n: "02",
      title: "Trace the branches",
      body: "Direct links are the important setup. Deep cuts add texture, not homework.",
    },
    {
      n: "03",
      title: "Build your own path",
      body: "Mark stories watched. Your remaining prerequisite count updates on this device.",
    },
  ];

  return (
    <section className="method" data-reveal>
      <div>
        <div className="section-kicker">HOW TO READ THE MAP</div>
        <h2>Chronology tells you <em>when.</em><br />Dependencies tell you <em>why.</em></h2>
      </div>
      <div className="method-grid">
        {steps.map((step) => (
          <div key={step.n}>
            <span>{step.n}</span>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function HomeFooter() {
  return (
    <footer>
      {/* No ancestor names this one, so the lockup provides its own label. */}
      <div className="brand footer-brand"><BrandLockup size="footer" labelled /></div>
      <p>
        An independent fan-made story navigator. Timeline placement follows Marvel’s
        published Disney+ chronology; narrative dependencies are editorial.
      </p>
      <span>DATA CUT · OCT 2026</span>
    </footer>
  );
}
