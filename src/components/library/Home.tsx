import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useState } from "react";
import { useBoard } from "../../board";
import {
  STATUS_LABEL,
  bookLabel,
  counted,
  fmtDate,
  fmtDays,
  fmtMinutes,
  fullLabel,
  isListening,
  lastFinished,
  listened,
  nextBook,
  nowListening,
  remaining,
  statusOf,
  today,
  upcoming,
  yearStats,
  type Library,
  type LibSeries,
  type Status,
} from "../../library/model";
import {
  dismissNews,
  finishBook,
  pin,
  queueAdd,
  queueMove,
  queueRemove,
  setDates,
  startBook,
  startNext,
} from "../../library/store";
import { Cover } from "../common";
import { seriesHref } from "./links";

const TIER_COLOUR: Record<string, string> = { S: "#ff7f7f", A: "#ffbf7f", B: "#ffdf7f", C: "#ffff7f", D: "#bfff7f", F: "#7fbfff" };
const cover = (s: LibSeries) => ({ image: s.image, title: s.title });

/** "Finished! Start book 5?" after marking a book finished */
export interface FinishedNote {
  key: string;
  text: string;
  nextId: string | null;
  nextLabel: string;
}

export default function Home({
  lib,
  note,
  setNote,
  onAdd,
  onImport,
}: {
  lib: Library;
  note: FinishedNote | null;
  setNote: (n: FinishedNote | null) => void;
  onAdd: () => void;
  onImport: () => void;
}) {
  const empty = Object.keys(lib.series).length === 0;
  return (
    <div className="lib">
      <div className="lib-head">
        <div>
          <h1>Library</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            What you're listening to, what's next, and everything you've finished.
          </p>
        </div>
        <div className="lib-actions">
          <button type="button" className="lib-btn" onClick={onImport}>
            Import
          </button>
          <button type="button" className="lib-btn primary" onClick={onAdd}>
            ＋ Add a series
          </button>
        </div>
      </div>

      {note && (
        <div className="lib-notice" role="status">
          <span>
            <b>{note.text}</b> marked finished.
          </span>
          {note.nextId && (
            <button
              type="button"
              className="lib-sm"
              onClick={() => {
                startBook(note.key, note.nextId!);
                setNote(null);
              }}
            >
              Start {note.nextLabel}
            </button>
          )}
          <button type="button" className="lib-sm" aria-label="Dismiss" onClick={() => setNote(null)}>
            ✕
          </button>
        </div>
      )}

      {lib.news.map((n) => (
        <div key={n.key} className="lib-news" role="status">
          <span className="lib-new-tag">NEW</span>
          <span>
            <b>{n.text}</b> is out{n.queued ? ", so it's been added to Up next." : "."}
          </span>
          {n.queued ? (
            <button type="button" className="lib-sm" onClick={() => dismissNews(n.key, true)}>
              Undo
            </button>
          ) : (
            <button
              type="button"
              className="lib-sm"
              onClick={() => {
                queueAdd(n.key);
                dismissNews(n.key);
              }}
            >
              Add to Up next
            </button>
          )}
          <button type="button" className="lib-sm" aria-label="Dismiss" onClick={() => dismissNews(n.key)}>
            ✕
          </button>
        </div>
      ))}

      {empty ? (
        <div className="lib-card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <h2>Start your library</h2>
          <p className="muted">Add a series you're listening to, or import a list you keep somewhere else.</p>
          <div className="lib-actions" style={{ justifyContent: "center" }}>
            <button type="button" className="lib-btn primary" onClick={onAdd}>
              ＋ Add a series
            </button>
            <button type="button" className="lib-btn" onClick={onImport}>
              Import a CSV
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="lib-grid">
            <NowListening lib={lib} setNote={setNote} />
            <YearCard lib={lib} />
          </div>
          <div className="lib-grid">
            <UpNext lib={lib} />
            <Wishlist lib={lib} />
          </div>
          <SeriesTable lib={lib} />
        </>
      )}
    </div>
  );
}

/** A date you can tap to change: the label, with the date picker over it */
export function DateButton({ value, label, onChange, className = "lib-btn" }: { value: string; label: string; onChange: (d: string) => void; className?: string }) {
  return (
    <span className={`lib-date-btn`}>
      <button type="button" className={className} tabIndex={-1} aria-hidden="true">
        {label}
      </button>
      <input type="date" value={value} max={today()} aria-label={label} onChange={(e) => e.target.value && onChange(e.target.value)} />
    </span>
  );
}

function NowListening({ lib, setNote }: { lib: Library; setNote: (n: FinishedNote | null) => void }) {
  const items = nowListening(lib);
  const finish = (key: string, bookId: string, label: string) => {
    const next = finishBook(key, bookId);
    setNote({ key, text: label, nextId: next?.id ?? null, nextLabel: next ? bookLabel(next) : "" });
  };
  if (!items.length) {
    const first = lib.queue.map((k) => lib.series[k]).find(Boolean);
    const nb = first && nextBook(first);
    return (
      <section className="lib-card" aria-label="Now listening">
        <div className="lib-eyebrow">Now listening</div>
        <p className="lib-empty">Nothing in progress.</p>
        {first && nb && (
          <div className="lib-row">
            <Cover work={cover(first)} size={48} />
            <div className="lib-row-main">
              <div className="lib-row-title">{first.title}</div>
              <div className="lib-row-meta">First in Up next · {bookLabel(nb)}</div>
            </div>
            <button type="button" className="lib-sm primary" onClick={() => startBook(first.key, nb.id)}>
              Start {bookLabel(nb)}
            </button>
          </div>
        )}
      </section>
    );
  }
  const [main, ...others] = items;
  const { series: s, book: b } = main;
  const books = counted(s);
  const done = books.filter((x) => x.finished).length;
  return (
    <section className="lib-card lib-now" aria-label="Now listening">
      <Cover work={cover(s)} size={140} />
      <div className="lib-now-body">
        <div className="lib-eyebrow on">Now listening</div>
        <div>
          <a href={seriesHref(s.key)} className="lib-now-title" style={{ color: "inherit", textDecoration: "none" }}>
            {s.title}
          </a>
          <div className="muted">
            {s.kind === "book" ? "" : `${bookLabel(b)} · `}
            {fmtMinutes(b.minutes)}
            {s.authors[0] ? ` · ${s.authors[0]}` : ""}
          </div>
        </div>
        {books.length > 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="small muted" style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Series progress</span>
              <span>
                <b style={{ color: "var(--text)" }}>
                  {done} of {books.length}
                </b>{" "}
                books
              </span>
            </div>
            <div className="lib-segs">
              {books.slice(0, 40).map((x) => (
                <span key={x.id} className={x.finished ? "done" : ""} />
              ))}
            </div>
          </div>
        )}
        <div className="lib-actions" style={{ marginTop: 4 }}>
          <button type="button" className="lib-btn primary" onClick={() => finish(s.key, b.id, fullLabel(s, b))}>
            Mark {s.kind === "book" ? "it" : bookLabel(b)} finished
          </button>
          <DateButton value={b.started!} label={`Started ${fmtDate(b.started, false)}`} onChange={(d) => setDates(s.key, b.id, { started: d })} />
        </div>
      </div>
      {others.length > 0 && (
        <div className="lib-also">
          <div className="lib-eyebrow">Also listening</div>
          {others.map(({ series: o, book: ob }) => (
            <div className="lib-row" key={o.key + ob.id} style={{ margin: "0 -6px" }}>
              <Cover work={cover(o)} size={40} />
              <div className="lib-row-main">
                <div className="lib-row-title">
                  <a href={seriesHref(o.key)}>{o.title}</a>
                </div>
                <div className="lib-row-meta">
                  {o.kind === "book" ? "" : `${bookLabel(ob)} · `}
                  {fmtMinutes(ob.minutes)} · started {fmtDate(ob.started, false)}
                </div>
              </div>
              <button type="button" className="lib-sm" onClick={() => finish(o.key, ob.id, fullLabel(o, ob))}>
                Mark finished
              </button>
              <button type="button" className="lib-sm" aria-label={`Show ${o.title} in the main card`} title="Show this one big" onClick={() => pin(o.key)}>
                ⇅
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const MONTHS = "JFMAMJJASOND";

function YearCard({ lib }: { lib: Library }) {
  const year = new Date().getFullYear();
  const y = useMemo(() => yearStats(lib, year), [lib, year]);
  const max = Math.max(1, ...y.months.map((m) => m.minutes));
  const thisMonth = y.months[y.upTo];
  return (
    <section className="lib-card" aria-label="This year">
      <div className="lib-card-head">
        <h2 className="muted" style={{ fontSize: 15 }}>
          {year} so far
        </h2>
        <a href="#/library/stats" style={{ fontSize: 14, textDecoration: "none" }}>
          All stats →
        </a>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <span className="lib-big">{fmtMinutes(y.minutes, true)}</span>
        <span className="muted">{fmtDays(y.minutes)} of listening</span>
      </div>
      <div className="lib-spark" aria-hidden="true">
        {y.months.map((m, i) => (
          <div key={i}>
            <i
              className={i === y.upTo ? "now" : ""}
              style={{ height: i > y.upTo ? 2 : Math.max(3, Math.round((m.minutes / max) * 44)), opacity: i > y.upTo ? 0.4 : 1 }}
            />
            {MONTHS[i]}
          </div>
        ))}
      </div>
      <div className="lib-tiles">
        <div className="lib-tile">
          <b>{y.books}</b>
          <span>books finished</span>
        </div>
        <div className="lib-tile">
          <b>{fmtMinutes(y.perDay)}</b>
          <span>a day on average</span>
        </div>
        <div className="lib-tile">
          <b>{fmtMinutes(thisMonth.minutes, true)}</b>
          <span>this month</span>
        </div>
      </div>
    </section>
  );
}

function queueMeta(s: LibSeries): string {
  const left = remaining(s);
  const nb = nextBook(s);
  const started = counted(s).some((b) => b.finished);
  if (s.kind === "book") return `${s.authors[0] ?? "Standalone"} · ${fmtMinutes(left.minutes, true)}`;
  const soon = upcoming(s)[0];
  if (!nb && soon) return `${bookLabel(soon)} out ${fmtDate(soon.released)}`;
  if (started && nb) return `${bookLabel(nb)} next · ${left.books} book${left.books === 1 ? "" : "s"} left · ${fmtMinutes(left.minutes, true)}`;
  const n = counted(s).length;
  return `${s.authors[0] ? `${s.authors[0]} · ` : ""}${n} book${n === 1 ? "" : "s"} · ${fmtMinutes(left.minutes, true)}`;
}

function UpNext({ lib }: { lib: Library }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const queue = lib.queue.filter((k) => lib.series[k]);
  const total = queue.reduce((m, k) => m + remaining(lib.series[k]).minutes, 0);
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    queueMove(lib.queue.indexOf(String(e.active.id)), lib.queue.indexOf(String(e.over.id)));
  };
  return (
    <section className="lib-card" aria-label="Up next">
      <div className="lib-card-head">
        <h2>
          Up next{" "}
          <span className="muted">
            · {queue.length} series · {fmtMinutes(total, true)} to go
          </span>
        </h2>
        {queue.length > 1 && <span className="small muted">Drag to reorder</span>}
      </div>
      {!queue.length && <p className="lib-empty">Nothing queued. Add a series, or move one here from your wishlist.</p>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={queue} strategy={verticalListSortingStrategy}>
          {queue.map((k, i) => (
            <QueueRow key={k} s={lib.series[k]} n={i + 1} />
          ))}
        </SortableContext>
      </DndContext>
    </section>
  );
}

function QueueRow({ s, n }: { s: LibSeries; n: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: s.key });
  const nb = nextBook(s);
  const books = counted(s);
  const done = books.filter((b) => b.finished).length;
  return (
    <div
      ref={setNodeRef}
      className="lib-row"
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, background: isDragging ? "var(--panel-2)" : undefined }}
    >
      <button type="button" className="lib-handle" aria-label={`Move ${s.title}`} {...attributes} {...listeners}>
        ⋮⋮
      </button>
      <span className="lib-n">{n}</span>
      <Cover work={cover(s)} size={48} />
      <div className="lib-row-main">
        <div className="lib-row-title">
          <a href={seriesHref(s.key)}>{s.title}</a>
        </div>
        <div className="lib-row-meta">{queueMeta(s)}</div>
        {done > 0 && books.length > 1 && (
          <div className="lib-mini-bar">
            <span>
              <i style={{ width: `${Math.round((done / books.length) * 100)}%` }} />
            </span>
            <span>
              {done} of {books.length} done
            </span>
          </div>
        )}
      </div>
      {nb && (
        <button type="button" className="lib-sm" onClick={() => startNext(s.key)}>
          Start{done > 0 && s.kind !== "book" ? ` ${bookLabel(nb)}` : ""}
        </button>
      )}
      <button type="button" className="lib-sm" aria-label={`Take ${s.title} out of Up next`} title="Take out of Up next" onClick={() => queueRemove(s.key)}>
        ✕
      </button>
    </div>
  );
}

function Wishlist({ lib }: { lib: Library }) {
  const wish = Object.values(lib.series).filter((s) => statusOf(s, lib) === "wish");
  return (
    <section className="lib-card" aria-label="Wishlist">
      <div className="lib-card-head">
        <h2>
          Wishlist <span className="muted">· maybe one day</span>
        </h2>
      </div>
      {!wish.length && <p className="lib-empty">Nothing saved. Add series here from "Add a series", or from any series' details.</p>}
      {wish.map((s) => (
        <div className="lib-row" key={s.key}>
          <Cover work={cover(s)} size={48} />
          <div className="lib-row-main">
            <div className="lib-row-title">
              <a href={seriesHref(s.key)}>{s.title}</a>
            </div>
            <div className="lib-row-meta">{queueMeta(s)}</div>
          </div>
          <button type="button" className="lib-sm" onClick={() => queueAdd(s.key)}>
            Move to Up next
          </button>
        </div>
      ))}
    </section>
  );
}

const FILTERS: (Status | "all")[] = ["all", "listening", "next", "partway", "caught", "finished", "wish"];

function SeriesTable({ lib }: { lib: Library }) {
  const { bucketOf } = useBoard();
  const [filter, setFilter] = useState<Status | "all">("all");
  const [q, setQ] = useState("");
  const all = useMemo(
    () =>
      Object.values(lib.series)
        .map((s) => ({ s, status: statusOf(s, lib), last: lastFinished(s) ?? "" }))
        .sort((a, b) => {
          const al = a.status === "listening" ? "9" : a.last;
          const bl = b.status === "listening" ? "9" : b.last;
          return bl.localeCompare(al) || a.s.title.localeCompare(b.s.title);
        }),
    [lib],
  );
  const count = (f: Status | "all") => (f === "all" ? all.length : all.filter((r) => r.status === f).length);
  const term = q.trim().toLowerCase();
  const rows = all.filter(
    (r) => (filter === "all" || r.status === filter) && (!term || r.s.title.toLowerCase().includes(term) || r.s.authors.some((a) => a.toLowerCase().includes(term))),
  );
  const news = new Set(lib.news.map((n) => n.key));
  return (
    <section className="lib-card lib-table-card" aria-label="Your series">
      <div className="lib-table-tools">
        <h2 style={{ marginRight: 8 }}>Your series</h2>
        <div className="lib-pills">
          {FILTERS.filter((f) => f === "all" || count(f)).map((f) => (
            <button key={f} type="button" className={`lib-pill ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : STATUS_LABEL[f]}
              <span>{count(f)}</span>
            </button>
          ))}
        </div>
        <input className="lib-search" type="search" placeholder="Search your library" aria-label="Search your library" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="lib-scroll">
        <div className="lib-table">
          <div className="lib-tr lib-th">
            <span>Series</span>
            <span>Status</span>
            <span>Progress</span>
            <span>Listened</span>
            <span>Last finished</span>
            <span>Tier</span>
          </div>
          {rows.map(({ s, status, last }) => {
            const books = counted(s);
            const done = books.filter((b) => b.finished).length;
            const listening = books.find(isListening);
            const tier = bucketOf(s.key);
            const t = tier && tier !== "unplaced" ? tier : null;
            return (
              <a key={s.key} className="lib-tr" href={seriesHref(s.key)}>
                <span className="lib-cell-series">
                  <Cover work={cover(s)} size={44} />
                  <span style={{ minWidth: 0 }}>
                    <span className="lib-row-title" style={{ display: "block" }}>
                      {s.title}
                    </span>
                    <span className="lib-row-meta" style={{ display: "block" }}>
                      {s.authors.slice(0, 2).join(", ")}
                    </span>
                  </span>
                </span>
                <span>
                  <span className={`lib-status lib-status-${status}`}>{STATUS_LABEL[status]}</span>
                  {news.has(s.key) && <span className="lib-new-line">● New book out</span>}
                  {!news.has(s.key) && (status === "caught" || status === "partway") && !nextBook(s) && upcoming(s)[0] && (
                    <span className="lib-new-line" style={{ color: "var(--muted)" }}>
                      {bookLabel(upcoming(s)[0])} due {fmtDate(upcoming(s)[0].released)}
                    </span>
                  )}
                </span>
                <span className="lib-progress">
                  <span>
                    <b>{done}</b> of {books.length} {books.length === 1 ? "book" : "books"}
                  </span>
                  <span className="lib-bar">
                    <i
                      style={{
                        width: `${books.length ? Math.round((done / books.length) * 100) : 0}%`,
                        background: status === "finished" ? "#7fd49c" : status === "caught" ? "#8fbaff" : undefined,
                      }}
                    />
                  </span>
                </span>
                <span className="lib-num">{fmtMinutes(listened(s))}</span>
                <span className="muted small">{listening ? `Started ${fmtDate(listening.started, false)}` : fmtDate(last) || "–"}</span>
                <span className="lib-tier" style={t ? { background: TIER_COLOUR[t] } : { color: "var(--muted)" }}>
                  {t ?? "–"}
                </span>
              </a>
            );
          })}
          {!rows.length && <div className="lib-empty" style={{ padding: "28px 20px" }}>Nothing matches.</div>}
        </div>
      </div>
    </section>
  );
}

