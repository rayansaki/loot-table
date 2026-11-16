import { useEffect, useRef, useState } from "react";
import { api, type Work } from "../../api";
import { fmtMinutes, type AudibleSeries, type Library } from "../../library/model";
import { addFromAudible, addManual, asinFromKey, fetchSeries, searchAudible, type Place } from "../../library/store";
import { Cover } from "../common";
import { seriesHref } from "./links";

interface Candidate {
  asin: string | null;
  title: string;
  authors: string[];
  image: string | null;
  /** Finished being written, when Loot Table knows */
  complete?: boolean;
  from: "loot" | "audible";
}

type Choice = "next" | "wish" | "listening" | "done";

/** Search, pick, then say where it goes: Up next, wishlist, listening now, or already finished */
export default function AddSeries({ lib, onClose, initial }: { lib: Library; onClose: () => void; initial?: Work }) {
  const [q, setQ] = useState(initial?.title ?? "");
  const [results, setResults] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Candidate | null>(null);
  const [info, setInfo] = useState<AudibleSeries | null>(null);
  const [error, setError] = useState("");
  const [choice, setChoice] = useState<Choice>("next");
  const [bookIdx, setBookIdx] = useState(0);
  const [earlierDone, setEarlierDone] = useState(true);
  const seq = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Opened from a series' details: go straight to it
  useEffect(() => {
    if (initial) void pick(fromWork(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Search as you type: Loot Table's series straight away, Audible's when you pause
  useEffect(() => {
    if (initial && !results.length && q === initial.title) return;
    const term = q.trim();
    const id = ++seq.current;
    if (term.length < 2) {
      setResults([]);
      return;
    }
    void api.search(term, 6).then((works) => {
      if (id === seq.current) setResults((prev) => merge(works.map(fromWork), prev.filter((c) => c.from === "audible")));
    });
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const found = await searchAudible(term);
        if (id === seq.current) setResults((prev) => merge(prev.filter((c) => c.from === "loot"), found.map((m) => ({ ...m, from: "audible" as const }))));
      } catch {
        /* no server: Loot Table's results only */
      } finally {
        if (id === seq.current) setSearching(false);
      }
    }, 450);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function pick(c: Candidate) {
    setPicked(c);
    setInfo(null);
    setError("");
    if (!c.asin) {
      setError("This one isn't linked to Audible.");
      return;
    }
    try {
      const got = await fetchSeries(c.asin);
      setInfo(got);
      setBookIdx(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reach Audible");
    }
  }

  const existing = info ? lib.series[`${info.kind === "book" ? "book" : "series"}:${info.asin}`] : null;
  const main = info ? info.books.filter((b) => !b.extra) : [];

  const add = () => {
    if (!info) return;
    const place: Place = choice === "wish" ? "wish" : choice === "next" ? "next" : "library";
    const key = addFromAudible(info, {
      place,
      complete: picked?.complete,
      ...(choice === "listening" ? { startIndex: bookIdx, ...(earlierDone ? { finishedBefore: bookIdx } : {}) } : {}),
      ...(choice === "done" ? { finishedBefore: main.length } : {}),
    });
    onClose();
    window.location.hash = seriesHref(key);
  };

  const addWithoutAudible = (place: Place) => {
    if (!picked) return;
    const key = addManual(picked.title, picked.authors, place);
    onClose();
    window.location.hash = seriesHref(key);
  };

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="lib-dialog" role="dialog" aria-label="Add a series">
        <button className="close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>Add a series</h2>

        {!picked ? (
          <>
            <input type="search" placeholder="Series, book or author" aria-label="Search for a series" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            <div className="lib-results">
              {results.map((c) => (
                <button type="button" key={(c.asin ?? c.title) + c.from} onClick={() => pick(c)}>
                  <Cover work={{ image: c.image, title: c.title }} size={44} />
                  <span style={{ minWidth: 0 }}>
                    <span className="lib-row-title" style={{ display: "block" }}>
                      {c.title}
                    </span>
                    <span className="lib-row-meta" style={{ display: "block" }}>
                      {c.authors.slice(0, 2).join(", ")}
                    </span>
                  </span>
                </button>
              ))}
              {q.trim().length >= 2 && !results.length && !searching && <p className="lib-empty">Nothing found. Try the author's name, or a book's title.</p>}
              {searching && <p className="lib-empty">Searching Audible…</p>}
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <Cover work={{ image: info?.image ?? picked.image, title: picked.title }} size={72} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 17 }}>{info?.title || picked.title}</div>
                <div className="muted small">{(info?.authors.length ? info.authors : picked.authors).join(", ")}</div>
                {info && (
                  <div className="muted small">
                    {info.kind === "book" ? "Standalone" : `${main.length} book${main.length === 1 ? "" : "s"}`} · {fmtMinutes(main.reduce((m, b) => m + (b.minutes ?? 0), 0), true)}
                    {info.books.length > main.length ? ` · ${info.books.length - main.length} extra` : ""}
                  </div>
                )}
                {!info && !error && <div className="muted small">Getting its books from Audible…</div>}
              </div>
            </div>

            {error && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span className="lib-error">{error}</span>
                <span className="small muted">You can add it without Audible and type its books in yourself.</span>
                <div className="lib-actions">
                  <button type="button" className="lib-sm" onClick={() => addWithoutAudible("next")}>
                    Add to Up next without Audible
                  </button>
                  <button type="button" className="lib-sm" onClick={() => addWithoutAudible("wish")}>
                    Add to wishlist without Audible
                  </button>
                </div>
              </div>
            )}

            {info && existing && (
              <p className="small">
                Already in your library. <a href={seriesHref(existing.key)} onClick={onClose}>Open it</a>
              </p>
            )}

            {info && !existing && (
              <>
                <div className="lib-choices" role="radiogroup" aria-label="Where it goes">
                  {(
                    [
                      ["next", "Up next", "Queue it"],
                      ["wish", "Wishlist", "Maybe one day"],
                      ["listening", "Listening now", "Started a book"],
                      ["done", "Finished it", "Every book so far"],
                    ] as [Choice, string, string][]
                  ).map(([id, label, hint]) => (
                    <button key={id} type="button" role="radio" aria-checked={choice === id} className={`lib-choice ${choice === id ? "on" : ""}`} onClick={() => setChoice(id)}>
                      <b>{label}</b>
                      <span>{hint}</span>
                    </button>
                  ))}
                </div>
                {choice === "listening" && main.length > 1 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <label>
                      Which book?
                      <select value={bookIdx} onChange={(e) => setBookIdx(Number(e.target.value))}>
                        {main.map((b, i) => (
                          <option key={b.asin} value={i}>
                            {b.n ? `Book ${b.n}: ` : ""}
                            {b.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    {bookIdx > 0 && (
                      <label className="lib-toggle" style={{ flexDirection: "row" }}>
                        <input type="checkbox" checked={earlierDone} onChange={(e) => setEarlierDone(e.target.checked)} />
                        I've finished the books before it (you can add their dates later)
                      </label>
                    )}
                  </div>
                )}
                {choice === "listening" && <p className="small muted" style={{ margin: 0 }}>It starts today; change the date on the series page if you started earlier.</p>}
                {choice === "done" && <p className="small muted" style={{ margin: 0 }}>Marked finished without dates, so they won't be in your stats until you add them.</p>}
              </>
            )}

            <div className="lib-dialog-actions">
              <button
                type="button"
                className="lib-btn"
                onClick={() => {
                  setPicked(null);
                  setInfo(null);
                  setError("");
                }}
              >
                Back
              </button>
              {info && !existing && (
                <button type="button" className="lib-btn primary" onClick={add}>
                  Add
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function fromWork(w: Work): Candidate {
  const asin = asinFromKey(w.key) ?? (w.firstAsin || null);
  const state = w.status?.state;
  return {
    asin,
    title: w.title,
    authors: w.authors,
    image: w.image,
    from: "loot",
    ...(state ? { complete: state === "complete" || state === "standalone" } : {}),
  };
}

/** Loot Table's matches first, then Audible's that aren't the same series */
function merge(loot: Candidate[], audible: Candidate[]): Candidate[] {
  const seen = new Set(loot.map((c) => c.asin).filter(Boolean));
  return [...loot, ...audible.filter((c) => !c.asin || !seen.has(c.asin))];
}
