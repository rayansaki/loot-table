import { useState } from "react";
import { useBoard } from "../board";
import { customWork, deleteCustom, readCustom } from "../custom";
import { Cover, TierButtons } from "./common";
import CustomSeriesForm from "./CustomSeriesForm";
import "./custom.css";

/** The detail panel for a series you added yourself: no ratings or community data, but edit and delete */
export default function CustomSeriesDrawer({ workKey, onClose }: { workKey: string; onClose: () => void }) {
  const { reload, remove } = useBoard();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [, setVersion] = useState(0); // re-read after an edit
  const series = readCustom()[workKey];

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer">
        <button className="close" onClick={onClose} aria-label="Close">
          ×
        </button>
        {!series ? (
          <div className="muted">This series has been deleted.</div>
        ) : (
          <>
            <div className="drawer-head">
              <Cover work={customWork(series)} size={140} />
              <div>
                <h2>{series.title}</h2>
                <div>{series.authors.join(", ") || <span className="muted">No author given</span>}</div>
                <TierButtons work={customWork(series)} />
                {series.asin && (
                  <a
                    className="audible-link"
                    href={`https://www.audible.co.uk/pd/${series.asin}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open book 1 on Audible ↗
                  </a>
                )}
              </div>
            </div>
            <div className="custom-note">
              <b>Added by you.</b> Loot Table's data doesn't have this series, so it isn't used for recommendations,
              with one exception: rank it S or A and books by{" "}
              {series.authors.length ? series.authors.slice(0, 2).join(" and ") : "its author"} count as by an author
              you like.
            </div>
            <div className="custom-drawer-actions">
              <button type="button" onClick={() => setEditing(true)}>
                Edit
              </button>
              {confirmDelete ? (
                <>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      remove(workKey);
                      deleteCustom(workKey);
                      onClose();
                    }}
                  >
                    Delete it for good
                  </button>
                  <button type="button" className="link" onClick={() => setConfirmDelete(false)}>
                    Keep it
                  </button>
                </>
              ) : (
                <button type="button" className="link" onClick={() => setConfirmDelete(true)}>
                  Delete this series
                </button>
              )}
            </div>
            <p className="muted small">
              Taking it off your tier list keeps it here: search for it to put it back. Share links leave it out
              (they only carry series Loot Table knows), but Export takes it along.
            </p>
          </>
        )}
      </aside>
      {editing && series && (
        <CustomSeriesForm
          editing={series}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setVersion((v) => v + 1);
            void reload(); // tiles show the new title and cover
          }}
        />
      )}
    </>
  );
}
