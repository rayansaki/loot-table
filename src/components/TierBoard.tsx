import {
  closestCorners,
  DndContext,
  pointerWithin,
  type CollisionDetection,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, useSortable, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef, useState } from "react";
import { TIERS, type Board, type Bucket, type Tier, type Work } from "../api";
import { useBoard, useOpenWork } from "../board";
import { setTierNote, setTierNotesShown, useTierNotes } from "../tierNotes";
import { Cover } from "./common";

const BUCKETS: Bucket[] = [...TIERS, "unplaced"];

// Whatever is under the pointer, preferring a tile over the row it sits in; closestCorners
// alone pulls drops into a neighbouring row's tiles when the target row is empty
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length) {
    const tiles = hits.filter((h) => !(BUCKETS as string[]).includes(String(h.id)));
    return tiles.length ? tiles : hits;
  }
  return closestCorners(args);
};
const LABELS: Record<Bucket, string> = { S: "S", A: "A", B: "B", C: "C", D: "D", F: "F", unplaced: "Listened" };

function Tile({ work }: { work: Work }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: work.key });
  const openWork = useOpenWork();
  return (
    <div
      ref={setNodeRef}
      className={`tile ${isDragging ? "dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      title={`${work.title} — ${work.authors.join(", ")}${work.custom ? "\nAdded by you: not used for recommendations" : ""}`}
      onClick={() => openWork(work.key)}
      {...attributes}
      {...listeners}
    >
      <Cover work={work} />
      <span className="tile-title">{work.title}</span>
    </div>
  );
}

/** A tier's letter: hover for its comment, click to switch every tier between letters and comments,
 * double-click to write one */
function TierLabel({ tier, note, shown }: { tier: Tier; note: string; shown: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const clickTimer = useRef<number>();
  useEffect(() => () => window.clearTimeout(clickTimer.current), []);

  const startEditing = () => {
    window.clearTimeout(clickTimer.current); // a double-click isn't also a switch
    setText(note);
    setEditing(true);
  };
  const save = () => {
    setTierNote(tier, text);
    setEditing(false);
  };

  if (editing)
    return (
      <div className={`tier-label tier-${tier} editing`}>
        <textarea
          className="tier-note-edit"
          value={text}
          autoFocus
          maxLength={200}
          placeholder={`What ${tier} means to you`}
          aria-label={`Comment for tier ${tier}`}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setText(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              save();
            } else if (e.key === "Escape") setEditing(false);
          }}
        />
      </div>
    );

  const showNote = shown && !!note;
  return (
    <div
      className={`tier-label tier-${tier} clickable ${shown ? "notes" : ""}`}
      role="button"
      tabIndex={0}
      title={note ? note : "Double-click to add a comment"}
      aria-label={note ? `Tier ${tier}: ${note}` : `Tier ${tier}`}
      onClick={() => {
        window.clearTimeout(clickTimer.current);
        clickTimer.current = window.setTimeout(() => setTierNotesShown(!shown), 250);
      }}
      onDoubleClick={startEditing}
      onKeyDown={(e) => {
        if (e.key === "Enter") setTierNotesShown(!shown);
        else if (e.key === "F2" || e.key === "e") {
          e.preventDefault();
          startEditing();
        }
      }}
    >
      {showNote ? (
        <>
          <span className="tier-note-letter">{tier}</span>
          <span className="tier-note">{note}</span>
        </>
      ) : (
        tier
      )}
    </div>
  );
}

function Row({ bucket, works }: { bucket: Bucket; works: Work[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: bucket });
  const { notes, shown } = useTierNotes();
  return (
    <div className={`tier-row ${bucket === "unplaced" ? "pool" : ""}`}>
      {bucket === "unplaced" ? (
        <div className={`tier-label tier-${bucket} ${shown ? "notes" : ""}`}>
          {LABELS[bucket]}
          {works.length > 0 && <small>{works.length}</small>}
        </div>
      ) : (
        <TierLabel tier={bucket} note={notes[bucket] ?? ""} shown={shown} />
      )}
      <SortableContext id={bucket} items={works.map((w) => w.key)} strategy={rectSortingStrategy}>
        <div ref={setNodeRef} className={`tier-items ${isOver ? "over" : ""}`}>
          {works.map((w) => (
            <Tile key={w.key} work={w} />
          ))}
          {works.length === 0 && bucket === "unplaced" && (
            <span className="muted hint">
              Books you've listened to but haven't ranked yet. Add them from the search on the right.
            </span>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

export default function TierBoard() {
  const { board, setBoard } = useBoard();
  const [active, setActive] = useState<Work | null>(null);
  const sensors = useSensors(
    // A small distance so a click on a tile opens it instead of starting a drag
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const find = (b: Board, id: string): Bucket | null => {
    if ((BUCKETS as string[]).includes(id)) return id as Bucket;
    return BUCKETS.find((t) => b[t].some((w) => w.key === id)) ?? null;
  };

  const onStart = (e: DragStartEvent) => {
    const from = find(board, String(e.active.id));
    setActive(from ? board[from].find((w) => w.key === e.active.id) ?? null : null);
  };

  // Moving between rows happens while dragging, so the tile shows where it will land
  const onOver = (e: DragOverEvent) => {
    if (!e.over) return;
    const from = find(board, String(e.active.id));
    const to = find(board, String(e.over.id));
    if (!from || !to || from === to) return;
    const moving = board[from].find((w) => w.key === e.active.id)!;
    const target = board[to];
    const overIndex = target.findIndex((w) => w.key === e.over!.id);
    const index = overIndex >= 0 ? overIndex : target.length;
    setBoard({
      ...board,
      [from]: board[from].filter((w) => w.key !== e.active.id),
      [to]: [...target.slice(0, index), { ...moving, tier: to === "unplaced" ? null : to }, ...target.slice(index)],
    });
  };

  const onEnd = (e: DragEndEvent) => {
    setActive(null);
    if (!e.over) return;
    const from = find(board, String(e.active.id));
    const to = find(board, String(e.over.id));
    if (!from || from !== to) return;
    const items = board[from];
    const oldIndex = items.findIndex((w) => w.key === e.active.id);
    const newIndex = items.findIndex((w) => w.key === e.over!.id);
    if (newIndex >= 0 && oldIndex !== newIndex) setBoard({ ...board, [from]: arrayMove(items, oldIndex, newIndex) });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onStart}
      onDragOver={onOver}
      onDragEnd={onEnd}
      onDragCancel={() => setActive(null)}
    >
      <div className="board">
        {BUCKETS.map((b) => (
          <Row key={b} bucket={b} works={board[b]} />
        ))}
      </div>
      <DragOverlay>{active ? <div className="tile overlay"><Cover work={active} /></div> : null}</DragOverlay>
    </DndContext>
  );
}
