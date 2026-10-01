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

/**
 * Requests in flight, keyed like the cache. The same title is often mounted
 * twice at once (a graph node and the Inspector backdrop), and the cache only
 * fills on resolve, so without this both would hit Wikipedia.
 */
const inflight = new Map<string, Promise<string | null | undefined>>();

/**
 * Resolves to the image URL, null for "no poster exists" (cached), or
 * undefined for a network failure after one retry (not cached, so a later
 * mount can try again). Never aborted by an unmount: other mounts may share it.
 */
function fetchArtwork(title: string) {
  const pending = inflight.get(title);
  if (pending) return pending;
  const load = async (attempt: number): Promise<string | null | undefined> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
        { signal: controller.signal },
      );
      // A 404 is a real answer: this title has no Wikipedia summary. Cache it.
      if (!response.ok) {
        artworkCache.set(title, null);
        return null;
      }
      const data = await response.json();
      const image: string | null = data?.thumbnail?.source ?? data?.originalimage?.source ?? null;
      artworkCache.set(title, image);
      return image;
    } catch (error) {
      // Timed out: give up without caching. A flaky request must not kill a
      // poster for the whole session, since the cache never expires.
      if ((error as Error)?.name === "AbortError") return undefined;
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        return load(1);
      }
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  };
  const request = load(0).finally(() => inflight.delete(title));
  inflight.set(title, request);
  return request;
}

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

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        setLoading(true);
        void fetchArtwork(lookupTitle).then((image) => {
          if (cancelled) return;
          setLoading(false);
          // undefined = transient failure: show the fallback, cache nothing.
          setSrc(image ?? null);
        });
      },
      { rootMargin: "300px" },
    );
    observer.observe(host);
    return () => {
      cancelled = true;
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

