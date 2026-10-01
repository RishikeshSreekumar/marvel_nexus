# Marvel Nexus

An Astro + React recreation of the Marvel Nexus MCU chronology and story-dependency navigator. It contains 79 canonical season-level timeline stops and 18 legacy branch titles from the October 2026 data cut.

## Run locally

Requires Node.js 20.11 or newer.

```bash
npm install
npm run dev
```

Astro prints the local URL, normally `http://localhost:4321`.

Production verification:

```bash
npm run check
npm test
npm run build
npm run preview
```

## Project structure

- `src/pages/index.astro` owns the HTML shell, metadata, icons, and React island.
- `src/components/MarvelNexus.tsx` contains the story dataset and interactive navigator.
- `src/lib/graph.ts` contains the exported types, validation, graph traversal, sorting, URL state, and watched-state helpers.
- `src/styles/global.css` contains the design tokens and responsive visual system.
- `tests/graph.test.ts` validates the dataset and derived behavior.

## Editing stories

Use a stable, URL-safe `id` and add each title through the `s(...)` helper in `src/lib/stories.ts`. Canonical MCU entries belong in `chronologyInput`; alternate legacy universes belong in `legacyInput`.

The dependency list contains story IDs that must already exist somewhere in the combined dataset. Dependencies point from required context toward the title that requires it. The application validates duplicate IDs, missing references, self-links, cycles, and the expected 97/79/18 counts at startup and in tests.

Add a new released title to `releaseSequence` if it should participate in release-order sorting. Mark texture-only entries with `optional: true`, announced titles with `upcoming: true`, and uncertain placements with `editorialPlacement: true`.

Watched progress is stored only in the browser under `marvel-nexus-watched`. The payload is versioned and unknown or malformed IDs are ignored.
