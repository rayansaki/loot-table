import { useEffect, useRef, useState } from "react";
import { TIERS, type Bucket } from "../api";
import { findCovers, saveCustom, type CoverMatch, type CustomSeries } from "../custom";
import { Cover } from "./common";
import "./custom.css";

/** Add a series that isn't in Loot Table's data, or edit one you added: a title, its author, and a
 * cover picked from Audible's matches (or a link, or none).
 *
 * Adding finishes with a tier: onSaved gets the series and where to put it. Editing finishes with
 * Save, and no tier. */
export default function CustomSeriesForm({
  initialTitle = "",
  editing,
  onSaved,
  onClose,
}: {
  initialTitle?: string;
  editing?: CustomSeries;
  onSaved: (series: CustomSeries, bucket: Bucket | null) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(editing?.title ?? initialTitle);
  const [author, setAuthor] = useState(editing?.authors.join(", ") ?? "");
  const [image, setImage] = useState<string | null>(editing?.image ?? null);
  const [asin, setAsin] = useState<string | null>(editing?.asin ?? null);
  const [matches, setMatches] = useState<CoverMatch[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [noServer, setNoServer] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");
  const searched = useRef("");

  const search = async (t = title, a = author) => {
    if (!t.trim()) return;
    searched.current = `${t}|${a}`;
    setSearching(true);
    const found = await findCovers(t.trim(), a.trim());
    setSearching(false);
    setNoServer(found === null);
    setMatches(found ?? []);
  };

  // Adding from a search: look for covers straight away
  useEffect(() => {
    if (!editing && initialTitle.trim()) void search(initialTitle, "");
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Picking a match means "this is the series": its name and authors come too (still editable)
  const pick = (m: CoverMatch) => {
    setImage(m.image);
    setAsin(m.asin);
    if (m.title) setTitle(m.title);
    if (m.authors.length) setAuthor(m.authors.join(", "));
  };

  const useLink = () => {
    const url = link.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) return;
    setImage(url);
    setAsin(null);
    setLinkOpen(false);
  };

  const save = (bucket: Bucket | null) => {
    if (!title.trim()) return;
    const saved = saveCustom({
      key: editing?.key,
      title,
      authors: author.split(",").map((a) => a.trim()).filter(Boolean),
      image,
      asin,
    });
    onSaved(saved, bucket);
  };

  const stale = searched.current !== `${title}|${author}`;
  const preview = { title: title || "?", image, custom: true };

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="custom-form" role="dialog" aria-label={editing ? "Edit your series" : "Add your own series"}>
        <button className="close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>{editing ? "Edit your series" : "Add your own series"}</h2>
        <p className="muted small">
          For a series Loot Table doesn't have. It goes on your tier list with an amber frame, and doesn't count
          towards recommendations — except its author, if you rank it S or A.
        </p>

        <div className="custom-fields">
          <Cover work={preview} size={96} />
          <div className="custom-inputs">
            <label>
              <span className="muted small">Series</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Series name" autoFocus />
            </label>
            <label>
              <span className="muted small">Author</span>
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Author (commas between several)"
                onKeyDown={(e) => e.key === "Enter" && search()}
              />
            </label>
          </div>
        </div>

        <div className="custom-cover-head">
          <span className="small">Cover</span>
          <button type="button" onClick={() => search()} disabled={!title.trim() || searching}>
            {searching ? "Searching Audible…" : matches && !stale ? "Search again" : "Find on Audible"}
          </button>
          <button type="button" className="link" onClick={() => setLinkOpen(!linkOpen)}>
            Use an image link
          </button>
          {image && (
            <button
              type="button"
              className="link"
              onClick={() => {
                setImage(null);
                setAsin(null);
              }}
            >
              No cover
            </button>
          )}
        </div>

        {linkOpen && (
          <div className="custom-link">
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://… (right-click a cover image → Copy image address)"
              onKeyDown={(e) => e.key === "Enter" && useLink()}
            />
            <button type="button" onClick={useLink} disabled={!/^https?:\/\/\S+$/i.test(link.trim())}>
              Use
            </button>
          </div>
        )}

        {noServer && (
          <p className="muted small">
            Couldn't search Audible: that needs your own server, and it couldn't reach Audible just now. You can use
            an image link instead, or no cover.
          </p>
        )}
        {matches && !noServer && matches.length === 0 && !searching && (
          <p className="muted small">Nothing on Audible for that. Try the author's name, or use an image link.</p>
        )}
        {matches && matches.length > 0 && (
          <div className="custom-matches">
            {matches.map((m) => (
              <button
                type="button"
                key={m.asin}
                className={`custom-match ${asin === m.asin ? "picked" : ""}`}
                onClick={() => pick(m)}
                title={`${m.title} — ${m.authors.join(", ")}`}
              >
                <Cover work={m} size={84} />
                <span className="custom-match-title">{m.title}</span>
                <span className="muted custom-match-author">{m.authors.join(", ")}</span>
              </button>
            ))}
          </div>
        )}

        <div className="custom-actions">
          {editing ? (
            <>
              <button type="button" className="primary" onClick={() => save(null)} disabled={!title.trim()}>
                Save
              </button>
              <button type="button" onClick={onClose}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <span className="small">Add to</span>
              <div className="tier-buttons">
                {TIERS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`tier-btn tier-${t}`}
                    disabled={!title.trim()}
                    title={`Put in ${t} tier`}
                    onClick={() => save(t)}
                  >
                    {t}
                  </button>
                ))}
                <button
                  type="button"
                  className="tier-btn tier-unplaced"
                  disabled={!title.trim()}
                  title="Listened, rank later"
                  onClick={() => save("unplaced")}
                >
                  ✓
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
