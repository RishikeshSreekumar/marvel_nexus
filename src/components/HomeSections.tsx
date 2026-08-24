import BrandLockup from "./BrandLockup";

/**
 * The branches drawn beside the hero copy.
 *
 * Not a decoration picked at random: the point of the product is that the MCU
 * is a *branching* structure, and the old hero — five character cards — said
 * the opposite. Each branch peels off the sacred timeline at a nexus event and
 * ends in a labelled universe, which is the same shape the dependency map
 * draws at full size.
 *
 * `end` is the branch tip in viewBox units; `label` sits just outside it.
 */
const branches = [
  { id: "838", label: "EARTH-838", note: "ILLUMINATI", from: [243, 112], end: [104, 168], delay: 0 },
  { id: "1610", label: "EARTH-1610", note: "ULTIMATE", from: [238, 198], end: [386, 152], delay: 900 },
  { id: "65", label: "EARTH-65", note: "SPIDER-GWEN", from: [243, 272], end: [96, 322], delay: 1800 },
  { id: "199999", label: "EARTH-199999", note: "SACRED", from: [236, 354], end: [392, 336], delay: 2700 },
] as const;

/** Where the trunk splits. Each one is a pulsing marker on the timeline. */
const nexusEvents = [112, 198, 272, 354];

const TRUNK = "M240 16 C 214 96, 266 172, 240 256 C 216 336, 262 400, 240 468";

function branchPath([x1, y1]: readonly [number, number] | number[], [x2, y2]: readonly [number, number] | number[]) {
  // Peel away horizontally first, so a branch reads as leaving the trunk
  // rather than as a straight line drawn between two dots.
  const midX = x1 + (x2 - x1) * .62;
  return `M${x1} ${y1} C ${midX} ${y1}, ${x2 + (x1 - x2) * .18} ${y2}, ${x2} ${y2}`;
}

/** Marketing hero for the landing page. */
export function HomeHero({
  chronologyCount,
  legacyCount,
  onOpenSearch,
}: {
  chronologyCount: number;
  legacyCount: number;
  onOpenSearch: () => void;
}) {
  return (
    <section className="hero">
      <div className="hero-copy">
        <div className="eyebrow"><i /> MCU STORY NAVIGATOR · UPDATED JUL 2026</div>
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
      <div className="multiverse-showcase" aria-hidden="true">
        <div className="multiverse-glow" />
        <div className="multiverse-grid" />
        <svg className="multiverse-canvas" viewBox="0 0 480 480" role="presentation">
          <path className="multiverse-trunk" d={TRUNK} />
          {/* Drawn twice: a steady line, and a short dash travelling along it
              so the timeline reads as flowing rather than as a static rule. */}
          <path className="multiverse-trunk-flow" d={TRUNK} />

          {branches.map((branch) => (
            <g className="multiverse-branch" key={branch.id} style={{ "--branch-delay": `${branch.delay}ms` } as React.CSSProperties}>
              <path className="branch-line" d={branchPath(branch.from, branch.end)} />
              <circle className="branch-halo" cx={branch.end[0]} cy={branch.end[1]} r="27" />
              <circle className="branch-ring" cx={branch.end[0]} cy={branch.end[1]} r="20" />
              <circle className="branch-core" cx={branch.end[0]} cy={branch.end[1]} r="5.5" />
              <text
                className="branch-label"
                x={branch.end[0]}
                y={branch.end[1] + 44}
                textAnchor="middle"
              >
                {branch.label}
              </text>
              <text
                className="branch-note"
                x={branch.end[0]}
                y={branch.end[1] + 56}
                textAnchor="middle"
              >
                {branch.note}
              </text>
            </g>
          ))}

          {nexusEvents.map((y, index) => (
            <rect
              className="multiverse-nexus"
              key={y}
              x="234"
              y={y - 6}
              width="12"
              height="12"
              style={{ "--branch-delay": `${index * 900}ms` } as React.CSSProperties}
            />
          ))}

          <text className="multiverse-spine-label" x="256" y="446">SACRED TIMELINE</text>
        </svg>
        <div className="showcase-caption"><i /> MULTIVERSE <span>{branches.length} BRANCHES</span></div>
      </div>
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
      <span>DATA CUT · JUL 2026</span>
    </footer>
  );
}
