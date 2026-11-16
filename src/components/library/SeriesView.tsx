import { useState } from "react";
import { useBoard } from "../../board";
import {
  STATUS_LABEL,
  UNDATED,
  bookLabel,
  counted,
  daysBetween,
  fmtDate,
  fmtMinutes,
  hasDate,
  isListening,
  listened,
  mainBooks,
  nextBook,
  parseLength,
  splitByMonth,
  statusOf,
  today,
  type LibBook,
  type LibSeries,
  type Library,
} from "../../library/model";
import {
  addBook,
  clearBook,
  finishBook,
  queueAdd,
  queueRemove,
  refreshSeries,
  removeBook,
  removeSeries,
  setDates,
  setInclude,
  setLength,
  setSkip,
  startBook,
  toWishlist,
  updateSeries,
} from "../../library/store";
import { Cover } from "../common";

const TIER_COLOUR: Record<string, string> = { S: "#ff7f7f", A: "#ffbf7f", B: "#ffdf7f", C: "#ffff7f", D: "#bfff7f", F: "#7fbfff" };
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function SeriesView({ lib, seriesKey }: { lib: Library; seriesKey: string }) {
  const s = lib.series[seriesKey];
  const { bucketOf } = useBoard();
  const [editing, setEditing] = useState<string | null>(null);
  const [bad, setBad] = useState<{ id: string; text: string } | null>(null);
  const [refreshing, setRefreshing] = useState<"" | "busy" | "done" | string>("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [adding, setAdding] = useState(false);

  if (!s) {
    return (
      <div className="lib">
        <a href="#/library" style={{ fontSize: 14, textDecoration: "none" }}>
          ← Library
        </a>
        <div className="lib-card">
          <h2>Not in your library</h2>
          <p className="muted">It may have been removed, or the link is from someone else's library.</p>
        </div>
      </div>
    );
  }

  const status = statusOf(s, lib);
  const books = counted(s);
  const done = books.filter((b) => b.finished).length;
  const listening = books.find(isListening);
  const nb = nextBook(s);
  const queued = lib.queue.includes(s.key);
  const tier = bucketOf(s.key);
  const t = tier && tier !== "unplaced" ? tier : null;
  const extras = s.books.filter((b) => b.extra).length;
  const isNew = lib.news.some((n) => n.key === s.key);
  const dated = books.filter((b) => hasDate(b.started) && hasDate(b.finished) && b.started! <= b.finished!);
  const firstDate = s.books.map((b) => (hasDate(b.started) ? b.started : hasDate(b.finished) ? b.finished : null)).filter(Boolean).sort()[0] ?? null;
  const lastDate = s.books.map((b) => (hasDate(b.finished) ? b.finished : null)).filter(Boolean).sort().pop() ?? null;

  const changeDate = (b: LibBook, which: "started" | "finished", value: string) => {
    const next = { started: b.started ?? null, finished: b.finished ?? null, [which]: value || null };
    if (hasDate(next.started) && hasDate(next.finished) && next.finished < next.started) {
      setBad({ id: b.id, text: which === "finished" ? "The finish date is before the start date." : "The start date is after the finish date." });
      return;
    }
    if (hasDate(next.finished) && next.finished > today()) {
      setBad({ id: b.id, text: "That finish date hasn't happened yet." });
      return;
    }
    setBad(null);
    setDates(s.key, b.id, { [which]: value || null });
  };

  const refresh = async () => {
    setRefreshing("busy");
    try {
      await refreshSeries(s.key, true);
      setRefreshing("done");
    } catch (e) {
      setRefreshing(e instanceof Error ? e.message : "Couldn't reach Audible");
    }
  };

  return (
    <div className="lib">
      <a href="#/library" style={{ fontSize: 14, textDecoration: "none" }}>
        ← Library
      </a>

      <section className="lib-series-head">
        <Cover work={{ image: s.image, title: s.title }} size={160} />
        <div style={{ flex: "1 1 420px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="lib-chips">
            <span className={`lib-status lib-status-${status}`}>{STATUS_LABEL[status]}</span>
            {isNew && nb && <span className="lib-status lib-status-finished">{bookLabel(nb)} out</span>}
            {s.kind === "manual" && <span className="lib-status lib-status-unstarted">Not on Audible</span>}
          </div>
          <h1>{s.title}</h1>
          <div className="muted">
            {s.authors.join(", ") || "No author"}
            {s.kind === "series" &&
              ` · ${mainBooks(s).length} book${mainBooks(s).length === 1 ? "" : "s"} on Audible${extras ? ` + ${extras} extra${extras === 1 ? "" : "s"}` : ""}`}
          </div>
          <div className="lib-actions" style={{ marginTop: 4 }}>
            {listening ? (
              <button type="button" className="lib-btn primary" onClick={() => finishBook(s.key, listening.id)}>
                Mark {s.kind === "book" ? "it" : bookLabel(listening)} finished
              </button>
            ) : nb ? (
              <button type="button" className="lib-btn primary" onClick={() => startBook(s.key, nb.id)}>
                Start {s.kind === "book" ? "it" : bookLabel(nb)}
              </button>
            ) : null}
            {!listening && nb && (
              <button type="button" className="lib-btn" onClick={() => (queued ? queueRemove(s.key) : queueAdd(s.key))}>
                {queued ? "✓ In Up next" : "Add to Up next"}
              </button>
            )}
            {!listening && done === 0 && !queued && (
              <button type="button" className="lib-btn" onClick={() => (s.wish ? updateSeries(s.key, { wish: false }) : toWishlist(s.key))}>
                {s.wish ? "✓ On wishlist" : "Add to wishlist"}
              </button>
            )}
            <a className="lib-btn" href="#/tierlist" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--panel-2)", color: "var(--text)", textDecoration: "none", fontSize: 14 }}>
              Tier
              <span className="lib-tier" style={{ width: 22, height: 22, fontSize: 12, ...(t ? { background: TIER_COLOUR[t] } : { color: "var(--muted)" }) }}>
                {t ?? "–"}
              </span>
            </a>
          </div>
        </div>
      </section>

      <div className="lib-two">
        <section className="lib-card lib-table-card" aria-label="Books">
          <div className="lib-table-tools" style={{ justifyContent: "space-between" }}>
            <h2>
              Books{" "}
              <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>
                · {done} of {books.length} finished
              </span>
            </h2>
            <button type="button" className="link" onClick={() => setAdding(!adding)}>
              ＋ Add a book
            </button>
          </div>
          {adding && <AddBookRow seriesKey={s.key} onDone={() => setAdding(false)} nextN={String(mainBooks(s).length + 1)} />}
          <div className="lib-scroll">
            <div className="lib-books">
              <div className="lib-book head">
                <span />
                <span>#</span>
                <span>Book</span>
                <span>Length</span>
                <span>Started</span>
                <span>Finished</span>
                <span style={{ textAlign: "right" }}>Days</span>
                <span />
              </div>
              {s.books.map((b) => {
                const off = !!b.skip || (b.extra && b.include === false);
                const days = hasDate(b.started) && hasDate(b.finished) && b.started <= b.finished ? daysBetween(b.started, b.finished) + 1 : null;
                const open = editing === b.id || bad?.id === b.id;
                const split = open && !off ? splitByMonth(b) : null;
                const fresh = isNew && !b.finished && !b.started && b.id === nb?.id;
                return (
                  <div key={b.id} className={`lib-book ${off ? "off" : ""}`} onFocus={() => setEditing(b.id)}>
                    <span className={`lib-check ${off ? "" : b.finished ? "done" : isListening(b) ? "listening" : fresh ? "new" : ""}`} aria-hidden="true">
                      {off ? "–" : b.finished ? "✓" : isListening(b) ? "▸" : ""}
                    </span>
                    <span className="muted small">{b.n ?? (b.extra ? "Extra" : "")}</span>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }} title={b.title}>
                      {b.title}
                      {off ? (
                        <span className="muted" style={{ fontWeight: 400, marginLeft: 8 }}>Skipped</span>
                      ) : b.extra && b.n ? (
                        <span className="muted" style={{ fontWeight: 400, marginLeft: 8 }}>Extra</span>
                      ) : null}
                      {fresh && <span className="lib-new-line" style={{ display: "inline", marginLeft: 8 }}>New</span>}
                    </span>
                    <LengthInput value={b.minutes} onChange={(m) => setLength(s.key, b.id, m)} label={`Length of ${b.title}`} />
                    <input
                      className={`lib-date ${bad?.id === b.id ? "bad" : ""}`}
                      type="date"
                      value={hasDate(b.started) ? b.started : ""}
                      max={today()}
                      aria-label={`Started ${b.title}`}
                      onChange={(e) => changeDate(b, "started", e.target.value)}
                    />
                    <input
                      className={`lib-date ${bad?.id === b.id ? "bad" : ""}`}
                      type="date"
                      value={hasDate(b.finished) ? b.finished : ""}
                      max={today()}
                      aria-label={`Finished ${b.title}`}
                      title={b.finished === UNDATED ? "Finished, no date" : undefined}
                      onChange={(e) => changeDate(b, "finished", e.target.value)}
                    />
                    <span className="muted lib-num" style={{ textAlign: "right" }}>
                      {days ?? ""}
                    </span>
                    <BookAction s={s} b={b} />
                    {open && (bad?.id === b.id || (split && split.size > 0) || b.finished === UNDATED) && (
                      <div className="lib-split">
                        {bad?.id === b.id ? (
                          <span className="lib-error">{bad.text} Not saved.</span>
                        ) : split && split.size ? (
                          <>
                            <span className="lib-eyebrow">Counts in your stats as</span>
                            {[...split].map(([month, part]) => (
                              <div className="lib-split-row" key={month}>
                                <span>
                                  {MONTH[Number(month.slice(5)) - 1]} {month.slice(0, 4)}
                                </span>
                                <span className="lib-bar">
                                  <i style={{ width: `${Math.round((part.minutes / (b.minutes || 1)) * 100)}%` }} />
                                </span>
                                <span>
                                  {part.days ? `${part.days} day${part.days === 1 ? "" : "s"} · ` : ""}
                                  <b style={{ color: "var(--text)" }}>{fmtMinutes(part.minutes)}</b>
                                </span>
                              </div>
                            ))}
                            {!hasDate(b.started) && <span className="muted">No start date, so it all counts in the month you finished.</span>}
                          </>
                        ) : b.finished === UNDATED ? (
                          <span className="muted">Finished without a date, so it isn't in your stats. Add a finish date to count it.</span>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
              {!s.books.length && <div className="lib-empty" style={{ padding: "20px" }}>No books yet. Add one above.</div>}
            </div>
          </div>
        </section>

        <aside>
          <section className="lib-card lib-facts" aria-label="Summary">
            <div>
              <b>{fmtMinutes(listened(s))}</b>
              <span className="small muted">listened</span>
            </div>
            <div>
              <b>
                {done} / {books.length}
              </b>
              <span className="small muted">books</span>
            </div>
            <div>
              <b style={{ fontSize: 16 }}>{fmtDate(firstDate) || "–"}</b>
              <span className="small muted">started</span>
            </div>
            <div>
              <b style={{ fontSize: 16 }}>{fmtDate(lastDate) || "–"}</b>
              <span className="small muted">latest finish</span>
            </div>
          </section>

          {dated.length >= 2 && (
            <section className="lib-card" aria-label="Pace">
              <h2 style={{ fontSize: 16 }}>Pace</h2>
              <p className="small muted" style={{ margin: "2px 0 12px" }}>
                Days each book took, start to finish
              </p>
              <Pace books={dated} />
            </section>
          )}

          <section className="lib-card" aria-label="Notes" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label htmlFor="lib-notes" style={{ fontWeight: 700 }}>
              Your notes
            </label>
            <textarea
              id="lib-notes"
              rows={3}
              key={s.key}
              defaultValue={s.notes ?? ""}
              placeholder="Where you left off, favourite narrator, anything"
              onBlur={(e) => e.target.value !== (s.notes ?? "") && updateSeries(s.key, { notes: e.target.value })}
            />
          </section>

          <section className="lib-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {s.kind === "series" && (
              <label className="lib-toggle">
                <input type="checkbox" checked={!!s.complete} onChange={(e) => updateSeries(s.key, { complete: e.target.checked })} />
                The author has finished this series
              </label>
            )}
            {s.asin && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <button type="button" className="lib-sm" onClick={refresh} disabled={refreshing === "busy"}>
                  {refreshing === "busy" ? "Checking Audible…" : "Check Audible for changes"}
                </button>
                <span className="small muted">
                  {refreshing === "done"
                    ? "Up to date."
                    : refreshing && refreshing !== "busy"
                      ? refreshing
                      : s.refreshedAt
                        ? `Checked ${fmtDate(s.refreshedAt.slice(0, 10), false)}`
                        : ""}
                </span>
              </div>
            )}
            {confirmRemove ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="lib-sm danger"
                  onClick={() => {
                    removeSeries(s.key);
                    window.location.hash = "#/library";
                  }}
                >
                  Remove it and its dates
                </button>
                <button type="button" className="lib-sm" onClick={() => setConfirmRemove(false)}>
                  Keep it
                </button>
              </div>
            ) : (
              <button type="button" className="link" style={{ alignSelf: "flex-start", color: "var(--danger)" }} onClick={() => setConfirmRemove(true)}>
                Remove from library
              </button>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

/** A book's buttons: start or skip it, finish it, or undo */
function BookAction({ s, b }: { s: LibSeries; b: LibBook }) {
  if (b.skip || (b.extra && b.include === false))
    return (
      <button
        type="button"
        className="lib-sm"
        title="Count this book again"
        onClick={() => {
          setSkip(s.key, b.id, false);
          if (b.include === false) setInclude(s.key, b.id, true);
        }}
      >
        Unskip
      </button>
    );
  if (isListening(b))
    return (
      <button type="button" className="lib-sm" title="Mark finished today" aria-label={`Mark ${b.title} finished`} onClick={() => finishBook(s.key, b.id)}>
        ✓
      </button>
    );
  if (b.finished)
    return b.manual ? (
      <button type="button" className="lib-sm" title="Remove this book" aria-label={`Remove ${b.title}`} onClick={() => removeBook(s.key, b.id)}>
        ✕
      </button>
    ) : (
      <button type="button" className="lib-sm" title="Not listened: clear its dates" aria-label={`Clear the dates of ${b.title}`} onClick={() => clearBook(s.key, b.id)}>
        ↺
      </button>
    );
  return (
    <span style={{ display: "flex", gap: 4 }}>
      <button type="button" className="lib-sm" title="Start today" aria-label={`Start ${b.title}`} onClick={() => startBook(s.key, b.id)}>
        ▸
      </button>
      <button type="button" className="lib-sm" title="Not listening to this one: it won't count" aria-label={`Skip ${b.title}`} onClick={() => setSkip(s.key, b.id, true)}>
        Skip
      </button>
    </span>
  );
}

function LengthInput({ value, onChange, label }: { value: number | null; onChange: (m: number | null) => void; label: string }) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (value == null ? "" : `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`);
  return (
    <input
      className="lib-len"
      value={shown}
      placeholder="h:mm"
      aria-label={label}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text === null) return;
        const m = parseLength(text);
        if (text.trim() === "" || m !== null) onChange(m);
        setText(null);
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

function AddBookRow({ seriesKey, onDone, nextN }: { seriesKey: string; onDone: () => void; nextN: string }) {
  const [title, setTitle] = useState("");
  const [n, setN] = useState(nextN);
  const [len, setLen] = useState("");
  const save = () => {
    if (!title.trim()) return;
    addBook(seriesKey, { title: title.trim(), n: n.trim() || null, minutes: parseLength(len) });
    onDone();
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "0 20px 14px", alignItems: "flex-end" }}>
      <label className="small" style={{ display: "flex", flexDirection: "column", gap: 3, flex: "1 1 220px" }}>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && save()} />
      </label>
      <label className="small" style={{ display: "flex", flexDirection: "column", gap: 3, width: 70 }}>
        Number
        <input value={n} onChange={(e) => setN(e.target.value)} />
      </label>
      <label className="small" style={{ display: "flex", flexDirection: "column", gap: 3, width: 90 }}>
        Length
        <input value={len} placeholder="h:mm" onChange={(e) => setLen(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
      </label>
      <button type="button" className="lib-sm primary" onClick={save} disabled={!title.trim()}>
        Add
      </button>
      <button type="button" className="lib-sm" onClick={onDone}>
        Cancel
      </button>
    </div>
  );
}

function Pace({ books }: { books: LibBook[] }) {
  const days = books.map((b) => daysBetween(b.started!, b.finished!) + 1);
  const max = Math.max(...days);
  const avg = Math.round(days.reduce((a, b) => a + b, 0) / days.length);
  return (
    <>
      <div className="lib-pace" aria-hidden="true">
        {days.slice(-16).map((d, i) => (
          <div key={i}>
            {d}
            <i style={{ height: Math.max(3, Math.round((d / max) * 66)) }} />
          </div>
        ))}
      </div>
      <p className="small muted" style={{ margin: "10px 0 0" }}>
        About <b style={{ color: "var(--text)" }}>{avg} days</b> a book.
      </p>
    </>
  );
}
