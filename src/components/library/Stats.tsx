import { useMemo, useState } from "react";
import { bookLabel, fmtDate, fmtDays, fmtMinutes, yearStats, yearsWithData, type Library } from "../../library/model";
import { seriesHref } from "./links";

const NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const COLOURS = ["#f0a640", "#8fbaff", "#7fd49c", "#d9a6ff", "#ff9f8f", "#9be3e0"];

export default function Stats({ lib }: { lib: Library }) {
  const years = useMemo(() => yearsWithData(lib), [lib]);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const y = useMemo(() => yearStats(lib, year), [lib, year]);
  const thisYear = year === new Date().getFullYear();
  // The scale: the busiest month, rounded up so the three lines fall on round numbers
  const busiest = Math.max(...y.months.map((m) => m.minutes / 60));
  const step = [5, 10, 20, 30, 50, 100].find((st) => st * 3 >= busiest) ?? Math.ceil(busiest / 300) * 100;
  const top = step * 3;
  const lines = [top, step * 2, step];
  const peakIdx = y.peak?.month ?? -1;

  return (
    <div className="lib">
      <div className="lib-head">
        <div>
          <a href="#/library" style={{ fontSize: 14, textDecoration: "none" }}>
            ← Library
          </a>
          <h1 style={{ marginTop: 6 }}>Listening stats</h1>
        </div>
        <div className="lib-seg" role="group" aria-label="Year">
          {years.map((v) => (
            <button key={v} type="button" className={v === year ? "on" : ""} aria-pressed={v === year} onClick={() => setYear(v)}>
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="lib-kpis">
        <div className="lib-card lib-kpi">
          <div className="small muted">Listened</div>
          <b>{fmtMinutes(y.minutes)}</b>
          <div className="small muted">{fmtDays(y.minutes)}</div>
        </div>
        <div className="lib-card lib-kpi">
          <div className="small muted">Books finished</div>
          <b>{y.books}</b>
          <div className="small muted">
            across {y.series} series
          </div>
        </div>
        <div className="lib-card lib-kpi">
          <div className="small muted">Daily average</div>
          <b>{fmtMinutes(y.perDay)}</b>
          <div className="small muted">{thisYear ? "a day so far" : "a day"}</div>
        </div>
        <div className="lib-card lib-kpi">
          <div className="small muted">Biggest month</div>
          <b>{y.peak ? fmtMinutes(y.peak.minutes, true) : "–"}</b>
          <div className="small muted">{y.peak ? LONG[y.peak.month] : "Nothing yet"}</div>
        </div>
      </div>

      <section className="lib-card" aria-label="Hours by month">
        <div className="lib-card-head" style={{ marginBottom: 18 }}>
          <h2>Hours by month</h2>
          <span className="small muted">Each book's hours are spread over the days you were listening to it · a dot is a book finished</span>
        </div>
        <div className="lib-scroll">
          <div className="lib-chart">
            <div className="lib-chart-lines" aria-hidden="true">
              {lines.map((h) => (
                <div key={h}>{h}h</div>
              ))}
              <div />
            </div>
            <div className="lib-chart-bars">
              {y.months.map((m, i) => {
                const future = thisYear && i > y.upTo;
                const h = future ? 4 : Math.max(m.minutes ? 4 : 0, Math.round((m.minutes / 60 / top) * 240));
                return (
                  <div key={i} className="lib-col" title={`${LONG[i]}: ${fmtMinutes(m.minutes)}, ${m.books} book${m.books === 1 ? "" : "s"} finished`}>
                    <div className="lib-col-plot">
                      {!future && m.minutes > 0 && (
                        <span className={`lib-col-label ${i === peakIdx || (thisYear && i === y.upTo) ? "show" : ""}`} style={{ bottom: h + 8 }}>
                          {fmtMinutes(m.minutes, true)}
                        </span>
                      )}
                      <i className={future ? "future" : thisYear && i === y.upTo ? "now" : ""} style={{ height: h }} />
                    </div>
                    <div className="lib-dots" aria-label={`${m.books} books finished`}>
                      {Array.from({ length: Math.min(m.books, 8) }, (_, k) => (
                        <i key={k} />
                      ))}
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
        <section className="lib-card" aria-label="Most listened series">
          <div className="lib-card-head" style={{ marginBottom: 14 }}>
            <h2>
              Most listened series <span className="muted">· {year}</span>
            </h2>
          </div>
          {!y.top.length && <p className="lib-empty">Nothing finished in {year}.</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {y.top.map((t, i) => (
              <div className="lib-hbar" key={t.key}>
                <div>
                  <a href={seriesHref(t.key)} style={{ color: "var(--text)", textDecoration: "none", fontWeight: 600 }}>
                    {t.title}
                  </a>
                  <span className="muted lib-num">{fmtMinutes(t.minutes, true)}</span>
                </div>
                <div className="lib-bar">
                  <i style={{ width: `${Math.round((t.minutes / y.top[0].minutes) * 100)}%`, background: COLOURS[i % COLOURS.length] }} />
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
            {y.finished.map(({ key, series, book }) => (
              <a key={key + book.id} className="lib-hist" href={seriesHref(key)} style={{ color: "inherit", textDecoration: "none" }}>
                <span className="muted small">{fmtDate(book.finished, false)}</span>
                <span style={{ minWidth: 0 }}>
                  <span className="lib-row-title" style={{ display: "block" }}>
                    {series}
                  </span>
                  <span className="lib-row-meta" style={{ display: "block" }}>
                    {book.n ? `${bookLabel(book)}: ${book.title}` : book.title}
                  </span>
                </span>
                <span className={`lib-num ${book.minutes ? "" : "lib-warn"}`}>{book.minutes ? fmtMinutes(book.minutes) : "No length"}</span>
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
