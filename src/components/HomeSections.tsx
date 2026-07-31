import BrandLockup from "./BrandLockup";

/** Marketing hero for the landing page. */
export function HomeHero({
  chronologyCount,
  legacyCount,
  totalCount,
  onOpenSearch,
}: {
  chronologyCount: number;
  legacyCount: number;
  totalCount: number;
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
      <div className="hero-orbit" aria-hidden="true">
        <div className="orbit orbit-a"><span /></div>
        <div className="orbit orbit-b"><span /></div>
        <div className="arc-core">{totalCount}<span>STORIES</span></div>
        <div className="orbit-label one">INFINITY</div>
        <div className="orbit-label two">MULTIVERSE</div>
        <div className="orbit-label three">STREET</div>
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
