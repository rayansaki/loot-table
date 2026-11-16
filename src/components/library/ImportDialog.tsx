import { useEffect, useState } from "react";
import { importRows, parseCsv, type CsvRow, type ImportResult } from "../../library/importCsv";

const EXAMPLE = `series,book,title,length,started,finished,list
Cradle,1,Unsouled,8:52,2025-08-15,2025-08-20,
Cradle,2,Soulsmith,8:31,2025-08-20,2025-08-23,
He Who Fights with Monsters,,,,,,next
Mother of Learning,,,,,,wish`;

export default function ImportDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<CsvRow[] | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number; name: string } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !progress && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, progress]);

  const read = (csv: string) => {
    setText(csv);
    const parsed = parseCsv(csv);
    setError(parsed.error ?? "");
    setRows(parsed.error ? null : parsed.rows);
  };

  const run = async () => {
    if (!rows) return;
    setProgress({ done: 0, total: 1, name: "" });
    const r = await importRows(rows, (done, total, name) => setProgress({ done, total, name }));
    setProgress(null);
    setResult(r);
  };

  const seriesCount = rows ? new Set(rows.map((r) => r.seriesAsin || r.series.toLowerCase())).size : 0;

  return (
    <>
      <div className="scrim" onClick={() => !progress && onClose()} />
      <div className="lib-dialog" role="dialog" aria-label="Import your listening history">
        <button className="close" onClick={onClose} aria-label="Close" disabled={!!progress}>
          ×
        </button>
        <h2>Import</h2>
        {result ? (
          <>
            <p style={{ margin: 0 }}>
              Imported <b>{result.series}</b> series and <b>{result.books}</b> books. {result.onAudible} series were found on Audible, with their full book lists.
            </p>
            {result.notFound.length > 0 && (
              <p className="small" style={{ margin: 0 }}>
                Not found on Audible, so they only have the books from your file: {result.notFound.join(", ")}. Adding a <code>series_asin</code> column links them.
              </p>
            )}
            {result.problems.length > 0 && (
              <details>
                <summary className="small">{result.problems.length} things to check</summary>
                <ul className="small muted">
                  {result.problems.slice(0, 50).map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </details>
            )}
            <div className="lib-dialog-actions">
              <button type="button" className="lib-btn primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="small muted" style={{ margin: 0 }}>
              A CSV with one row per book you've listened to, and a row per series for Up next or your wishlist. Columns: <code>series</code>, then any of{" "}
              <code>series_asin</code>, <code>book</code> (its number), <code>title</code>, <code>length</code>, <code>pages</code>, <code>format</code> (<code>read</code> or <code>listen</code>), <code>started</code>, <code>finished</code> and <code>list</code> (
              <code>next</code> or <code>wish</code>). Dates as 2026-11-10 or 10/11/2026. Each series is looked up on Audible for its full book list.
            </p>
            <label>
              Choose a file
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) read(await f.text());
                }}
              />
            </label>
            <label>
              or paste it
              <textarea rows={7} value={text} placeholder={EXAMPLE} onChange={(e) => read(e.target.value)} />
            </label>
            {error && <span className="lib-error">{error}</span>}
            {rows && !error && (
              <span className="small">
                {rows.length} rows, {seriesCount} series. Books already in your library get the dates from the file; nothing is deleted.
              </span>
            )}
            {progress && (
              <div className="small" role="status">
                Looking up {progress.name || "…"} ({Math.min(progress.done + 1, progress.total)} of {progress.total})
                <div className="lib-bar" style={{ marginTop: 6 }}>
                  <i style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }} />
                </div>
              </div>
            )}
            <div className="lib-dialog-actions">
              <button type="button" className="lib-btn" onClick={onClose} disabled={!!progress}>
                Cancel
              </button>
              <button type="button" className="lib-btn primary" onClick={run} disabled={!rows?.length || !!progress}>
                {progress ? "Importing…" : "Import"}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
