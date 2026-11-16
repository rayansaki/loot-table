import { useState } from "react";
import type { Work } from "../../api";
import { asinFromKey, useLibrary } from "../../library/store";
import AddSeries from "./AddSeries";
import "./library.css";
import { seriesHref } from "./links";

/** In a series' details: open it in your Library, or add it there */
export default function LibraryButton({ work }: { work: Work }) {
  const lib = useLibrary();
  const [adding, setAdding] = useState(false);
  const asin = asinFromKey(work.key) ?? (work.firstAsin || null);
  const have = lib.series[work.key] ?? Object.values(lib.series).find((s) => asin && s.asin === asin);
  if (have)
    return (
      <a className="audible-link" href={seriesHref(have.key)}>
        In your Library →
      </a>
    );
  return (
    <>
      <button type="button" className="link" style={{ alignSelf: "flex-start", padding: 0 }} onClick={() => setAdding(true)}>
        ＋ Add to your Library
      </button>
      {adding && <AddSeries lib={lib} initial={work} onClose={() => setAdding(false)} />}
    </>
  );
}
