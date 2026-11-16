import { useEffect, useState } from "react";
import "../components/library/library.css";
import AddSeries from "../components/library/AddSeries";
import Home, { type FinishedNote } from "../components/library/Home";
import ImportDialog from "../components/library/ImportDialog";
import { libraryRoute, type LibraryRoute } from "../components/library/links";
import SeriesView from "../components/library/SeriesView";
import Stats from "../components/library/Stats";
import { refreshStale, useLibrary } from "../library/store";

/** The Library tab: #/library, #/library/stats, #/library/series/<key> */
export default function LibraryPage() {
  const lib = useLibrary();
  const [route, setRoute] = useState<LibraryRoute>(() => libraryRoute());
  const [dialog, setDialog] = useState<"add" | "import" | null>(null);
  const [note, setNote] = useState<FinishedNote | null>(null);

  useEffect(() => {
    const onHash = () => setRoute(libraryRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Book lists from Audible, at most once a day per series: new releases show up here
  useEffect(() => {
    void refreshStale();
    // On a phone the tabs scroll sideways: show that this one is open
    document.querySelector(".top nav a.active")?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, []);

  return (
    <>
      {route.view === "stats" ? (
        <Stats lib={lib} />
      ) : route.view === "series" ? (
        <SeriesView lib={lib} seriesKey={route.key} />
      ) : (
        <Home lib={lib} note={note} setNote={setNote} onAdd={() => setDialog("add")} onImport={() => setDialog("import")} />
      )}
      {dialog === "add" && <AddSeries lib={lib} onClose={() => setDialog(null)} />}
      {dialog === "import" && <ImportDialog onClose={() => setDialog(null)} />}
    </>
  );
}
