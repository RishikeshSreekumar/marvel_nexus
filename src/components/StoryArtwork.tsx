import { memo, useEffect, useRef, useState } from "react";
import type { Story } from "../lib/graph";
import { artworkTitle } from "../lib/stories";

/**
 * Poster art fetched lazily from the Wikipedia REST summary API.
 *
 * The cache is module scope on purpose: it has to outlive individual mounts,
 * so the same title is never fetched twice in a session. Moving it into the
 * component (or a hook) would silently disable caching.
 */
const artworkCache = new Map<string, string | null>();

/** Give up on a poster rather than leaving a shimmer running forever. */
const FETCH_TIMEOUT_MS = 6000;
/** One retry, network errors only — never a 404. */
const RETRY_DELAY_MS = 800;

function StoryArtwork({
  story,
  variant = "poster",
}: {
  story: Story;
  variant?: "poster" | "backdrop" | "thumb";
}) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const lookupTitle = artworkTitle(story);
  const [src, setSrc] = useState<string | null | undefined>(
    artworkCache.get(lookupTitle),
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (src !== undefined) return;
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    const controller = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const load = async (attempt = 0): Promise<void> => {
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const response = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(lookupTitle)}`,
          { signal: controller.signal },
        );
        // A 404 is a real answer: this title has no Wikipedia summary. Cache it.
        if (!response.ok) {
          artworkCache.set(lookupTitle, null);
          if (!cancelled) { setSrc(null); setLoading(false); }
          return;
        }
        const data = await response.json();
        const image = data?.thumbnail?.source ?? data?.originalimage?.source ?? null;
        artworkCache.set(lookupTitle, image);
        if (!cancelled) { setSrc(image); setLoading(false); }
      } catch (error) {
        // Unmounted or timed out: leave the cache alone. Caching null here is
        // what used to make one flaky request kill a poster for the whole
        // session, since the cache is module scope and never expires.
        if (cancelled || (error as Error)?.name === "AbortError") {
          if (!cancelled) setLoading(false);
          return;
        }
        if (attempt === 0) {
          retryTimer = setTimeout(() => void load(1), RETRY_DELAY_MS);
          return;
        }
        artworkCache.set(lookupTitle, null);
        setSrc(null);
        setLoading(false);
      } finally {
        clearTimeout(timer);
      }
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          observer.disconnect();
          setLoading(true);
          void load();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(host);
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      controller.abort();
      observer.disconnect();
    };
  }, [lookupTitle, src]);

  return (
    <span
      ref={hostRef}
      className={`story-artwork story-artwork-${variant} artwork-${story.lane.toLowerCase()} ${loading ? "is-loading" : ""}`}
      aria-hidden="true"
    >
      {src && <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" />}
      <span className="artwork-monogram">{story.title.replace(/^The /, "").charAt(0)}</span>
    </span>
  );
}

/**
 * Memoised: it depends only on the story and the variant, both stable, so
 * without this every hover on the graph re-renders 95 of these.
 */
export default memo(StoryArtwork);

