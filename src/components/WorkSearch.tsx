import { useEffect, useState } from "react";
import { api, type Work } from "../api";
import { useBoard, useOpenWork } from "../board";
import { customWork } from "../custom";
import { Cover, TierButtons } from "./common";
import CustomSeriesForm from "./CustomSeriesForm";

/** Catalog search with one-click ranking: the fastest way to fill a tier list from memory. */
export default function WorkSearch({ autoFocus }: { autoFocus?: boolean }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Work[]>([]);
  const [loading, setLoading] = useState(false);
  const openWork = useOpenWork();
  const { place } = useBoard();
  const [adding, setAdding] = useState(false);
  const [refresh, setRefresh] = useState(0); // search again after adding a series

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = window.setTimeout(async () => {
      const r = await api.search(q);
      if (!cancelled) {
        setResults(r);
        setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [q, refresh]);

  return (
    <div className="search">
      <input
        className="search-input"
        placeholder="Search series, author or narrator…"
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="muted small search-caption">
        {q ? (loading ? "Searching…" : `${results.length} results`) : "Most rated on Audible UK"}
      </div>
      <button type="button" className="add-custom" onClick={() => setAdding(true)}>
        ＋ {q.trim() ? `Can't find it? Add “${q.trim()}” as your own series` : "Add a series that isn't here"}
      </button>
      <div className="search-results">
        {results.map((w) => (
          <div key={w.key} className="search-item" onClick={() => openWork(w.key)}>
            <Cover work={w} size={48} />
            <div className="search-text">
              <div className="search-title">{w.title}</div>
              <div className="muted small">
                {w.authors.slice(0, 2).join(", ")}
                {w.custom ? (
                  <span className="custom-tag"> · added by you</span>
                ) : (
                  ` · ${w.bookCount} book${w.bookCount !== 1 ? "s" : ""}`
                )}
              </div>
              <TierButtons work={w} compact />
            </div>
          </div>
        ))}
      </div>
      {adding && (
        <CustomSeriesForm
          initialTitle={q}
          onClose={() => setAdding(false)}
          onSaved={(series, bucket) => {
            if (bucket) place(customWork(series), bucket);
            setAdding(false);
            setRefresh((r) => r + 1);
          }}
        />
      )}
    </div>
  );
}
