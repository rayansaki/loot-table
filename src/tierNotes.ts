// Comments on the tier letters ("S: Great, would re-read"), and whether the letters or the comments
// are showing. Kept per account under "loot-table.", so they sync like the board.
import { useEffect, useState } from "react";
import type { Tier } from "./api";

const NOTES_KEY = "loot-table.tier-notes";
const VIEW_KEY = "loot-table.tier-notes-shown";

export type TierNotes = Partial<Record<Tier, string>>;

function readNotes(): TierNotes {
  try {
    const v = JSON.parse(localStorage.getItem(NOTES_KEY) ?? "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
const readShown = () => {
  try {
    return localStorage.getItem(VIEW_KEY) === "1";
  } catch {
    return false;
  }
};

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function setTierNote(tier: Tier, text: string): void {
  const notes = readNotes();
  const t = text.trim();
  if (t) notes[tier] = t;
  else delete notes[tier];
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
  } catch {
    /* storage unavailable: nothing to keep */
  }
  notify();
}

export function setTierNotesShown(shown: boolean): void {
  try {
    localStorage.setItem(VIEW_KEY, shown ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
  notify();
}

export function useTierNotes(): { notes: TierNotes; shown: boolean } {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    // Another tab, or a sync, may have changed them
    const onStorage = (e: StorageEvent) => {
      if (e.key === NOTES_KEY || e.key === VIEW_KEY) l();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(l);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return { notes: readNotes(), shown: readShown() };
}
