import { useMemo, useState } from "react";
import { bookLabel, fmtDate, fmtDays, fmtMinutes, fmtPages, yearStats, yearsWithData, type Library } from "../../library/model";
import { seriesHref } from "./links";

const NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const COLOURS = ["#f0a640", "#8fbaff", "#7fd49c", "#d9a6ff", "#ff9f8f", "#9be3e0"];

type Measure = "hours" | "pages" | "books";
const FIELD: Record<Measure, "minutes" | "pages" | "books"> = { hours: "minutes", pages: "pages", books: "books" };

/** A value in the measure's unit: minutes as hours, pages, books */
function show(m: Measure, v: number, long = false): string {
  if (m === "hours") return long ? fmtMinutes(v) : fmtMinutes(v, true);
  if (m === "pages") return long ? fmtPages(v) : Math.round(v).toLocaleString("en-GB");
  return `${v}${long ? ` book${v === 1 ? "" : "s"}` : ""}`;
}

export default function Stats({ lib }: { lib: Library }) {
  const years = useMemo(() => yearsWithData(lib), [lib]);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const y = useMemo(() => yearStats(lib, year), [lib, year]);
  const thisYear = year === new Date().getFullYear();

  // Hours, pages or books: your usual, unless that year has none of it
  const usual: Measure = lib.settings.format === "read" ? "pages" : "hours";
  const [picked, setPicked] = useState<Measure | null>(null);
  const has = { hours: y.minutes > 0, pages: y.pages > 0, books: y.books > 0 };
  const measure: Measure = picked ?? (has[usual] ? usual : has.hours ? "hours" : has.pages ? "pages" : usual);
  const field = FIELD[measure];
  const both = has.hours && has.pages;

  const values = y.months.map((m) => (measure === "hours" ? m.minutes / 60 : m[field]));
  const busiest = Math.max(...values);
  const steps = measure === "pages" ? [100, 250, 500, 1000, 2000, 5000] : measure === "books" ? [1, 2, 3, 5, 10, 20] : [5, 10, 20, 30, 50, 100];
  const step = steps.find((st) => st * 3 >= busiest) ?? Math.ceil(busiest / 3);
  const top = step * 3;
  const peakIdx = y.months.reduce((best, m, i) => (m[field] > y.months[best][field] ? i : best), 0);
  const peak = y.months[peakIdx][field] ? peakIdx : -1;
  const ranked = [...y.top].filter((t) => t[field] > 0).sort((a, b) => b[field] - a[field]).slice(0, 6);

  return (
    <div className="lib">
      <div className="lib-head">
        <div>
          <a href="#/library" style={{ fontSize: 14, textDecoration: "none" }}>
            ← Library
          </a>
          <h1 style={{ marginTop: 6 }}>Stats</h1>
        </div>
        <div className="lib-actions">
          {(both || picked) && (
            <div className="lib-seg" role="group" aria-label="Measure">
              {(["hours", "pages", "books"] as Measure[]).map((m) => (
                <button key={m} type="button" className={m === measure ? "on" : ""} aria-pressed={m === measure} onClick={() => setPicked(m)}>
                  {m === "hours" ? "Hours" : m === "pages" ? "Pages" : "Books"}
                </button>
              ))}
            </div>
          )}
          <div className="lib-seg" role="group" aria-label="Year">
            {years.map((v) => (
              <button key={v} type="button" className={v === year ? "on" : ""} aria-pressed={v === year} onClick={() => setYear(v)}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="lib-kpis">
        <div className="lib-card lib-kpi">
          <div className="small muted">{measure === "pages" ? "Read" : measure === "books" ? "Finished" : "Listened"}</div>
          <b>{measure === "books" ? y.books : show(measure, y[measure === "pages" ? "pages" : "minutes"], true)}</b>
          <div className="small muted">
            {measure === "hours" ? fmtDays(y.minutes) : measure === "pages" ? (y.minutes ? `and ${fmtMinutes(y.minutes, true)} listened` : `in ${y.readBooks} book${y.readBooks === 1 ? "" : "s"}`) : `${y.series} series`}
          </div>
        </div>
        <div className="lib-card lib-kpi">
          <div className="small muted">Books finished</div>
          <b>{y.books}</b>
          <div className="small muted">
            {y.readBooks && y.listenedBooks ? `${y.readBooks} read · ${y.listenedBooks} listened` : `across ${y.series} series`}
          </div>
        </div>
        <div className="lib-card lib-kpi">
          <div className="small muted">Daily average</div>
          <b>
            {measure === "pages"
              ? Math.round(y.perDay.pages)
              : measure === "books"
                ? (y.books / Math.max(1, y.upTo + 1)).toFixed(1)
                : fmtMinutes(y.perDay.minutes)}
          </b>
          <div className="small muted">{measure === "pages" ? "pages a day" : measure === "books" ? "books a month" : thisYear ? "a day so far" : "a day"}</div>
        </div>
        <div className="lib-card lib-kpi">
          <div className="small muted">Biggest month</div>
          <b>{peak >= 0 ? show(measure, y.months[peak][field]) : "–"}</b>
          <div className="small muted">{peak >= 0 ? LONG[peak] : "Nothing yet"}</div>
        </div>
      </div>

      <section className="lib-card" aria-label="By month">
        <div className="lib-card-head" style={{ marginBottom: 18 }}>
          <h2>{measure === "hours" ? "Hours" : measure === "pages" ? "Pages" : "Books"} by month</h2>
          <span className="small muted">
            {measure === "books" ? "Books finished each month" : "Each book is spread over the days you spent on it · a dot is a book finished"}
          </span>
        </div>
        <div className="lib-scroll">
          <div className="lib-chart">
            <div className="lib-chart-lines" aria-hidden="true">
              {[top, step * 2, step].map((v) => (
                <div key={v}>{measure === "hours" ? `${v}h` : v.toLocaleString("en-GB")}</div>
              ))}
              <div />
            </div>
            <div className="lib-chart-bars">
              {y.months.map((m, i) => {
                const future = thisYear && i > y.upTo;
                const v = values[i];
                const h = future ? 4 : Math.max(v ? 4 : 0, Math.round((v / top) * 240));
                return (
                  <div
                    key={i}
                    className="lib-col"
                    title={`${LONG[i]}: ${[m.minutes ? fmtMinutes(m.minutes) : "", m.pages ? fmtPages(m.pages) : ""].filter(Boolean).join(", ") || "nothing"}; ${m.books} book${m.books === 1 ? "" : "s"} finished`}
                  >
                    <div className="lib-col-plot">
                      {!future && v > 0 && (
                        <span className={`lib-col-label ${i === peak || (thisYear && i === y.upTo) ? "show" : ""}`} style={{ bottom: h + 8 }}>
                          {show(measure, m[field])}
                        </span>
                      )}
                      <i className={future ? "future" : thisYear && i === y.upTo ? "now" : ""} style={{ height: h }} />
                    </div>
                    <div className="lib-dots" aria-label={`${m.books} books finished`}>
                      {measure !== "books" && Array.from({ length: Math.min(m.books, 8) }, (_, k) => <i key={k} />)}
                    </div>
                    <div className="small muted">{NAMES[i]}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <div className="lib-grid">
        <section className="lib-card" aria-label="Most of the year">
          <div className="lib-card-head" style={{ marginBottom: 14 }}>
            <h2>
              Most {measure === "pages" ? "read" : measure === "books" ? "finished" : "listened"} <span className="muted">· {year}</span>
            </h2>
          </div>
          {!ranked.length && <p className="lib-empty">Nothing in {year}.</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {ranked.map((t, i) => (
              <div className="lib-hbar" key={t.key}>
                <div>
                  <a href={seriesHref(t.key)} style={{ color: "var(--text)", textDecoration: "none", fontWeight: 600 }}>
                    {t.title}
                  </a>
                  <span className="muted lib-num">{show(measure, t[field], measure === "books")}</span>
                </div>
                <div className="lib-bar">
                  <i style={{ width: `${Math.round((t[field] / ranked[0][field]) * 100)}%`, background: COLOURS[i % COLOURS.length] }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="lib-card" aria-label="Finished">
          <div className="lib-card-head">
            <h2>
              Finished <span className="muted">· {y.books} in {year}</span>
            </h2>
          </div>
          {!y.finished.length && <p className="lib-empty">Nothing finished in {year}.</p>}
          <div style={{ maxHeight: 520, overflowY: "auto" }}>
            {y.finished.map(({ key, series, book, format }) => {
              const amount = format === "read" ? book.pages : book.minutes;
              return (
                <a key={key + book.id} className="lib-hist" href={seriesHref(key)} style={{ color: "inherit", textDecoration: "none" }}>
                  <span className="muted small">{fmtDate(book.finished, false)}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="lib-row-title" style={{ display: "block" }}>
                      {series}
                    </span>
                    <span className="lib-row-meta" style={{ display: "block" }}>
                      {book.n && book.title !== series ? `${bookLabel(book)}: ${book.title}` : format === "read" ? "Read" : "Listened"}
                    </span>
                  </span>
                  <span className={`lib-num ${amount ? "" : "lib-warn"}`}>
                    {amount ? (format === "read" ? fmtPages(amount) : fmtMinutes(amount)) : format === "read" ? "No pages" : "No length"}
                  </span>
                </a>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
