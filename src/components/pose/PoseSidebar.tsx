import type { ChangeEvent, RefObject } from "react";
import { TRAVERSE_TAG_LABELS, type TraverseItem } from "../../lib/traverseModels.ts";
import "./PoseSidebar.css";

interface PoseSidebarProps {
  items: TraverseItem[];
  selectedIndex: number;
  listRef: RefObject<HTMLUListElement | null>;
  tiltX: number;
  tiltY: number;
  onTiltXChange: (value: number) => void;
  onTiltYChange: (value: number) => void;
  onSelect: (index: number) => void;
}

export function PoseSidebar({
  items,
  selectedIndex,
  listRef,
  tiltX,
  tiltY,
  onTiltXChange,
  onTiltYChange,
  onSelect,
}: PoseSidebarProps) {
  function handleTiltXChange(event: ChangeEvent<HTMLInputElement>) {
    onTiltXChange(Number(event.currentTarget.value));
  }

  function handleTiltYChange(event: ChangeEvent<HTMLInputElement>) {
    onTiltYChange(Number(event.currentTarget.value));
  }

  return (
    <aside className="pose-sidebar" aria-label="Pose element list">
      <div className="pose-sidebar-header">
        <p className="pose-sidebar-title">Pose</p>
        <div className="pose-sidebar-tilt" role="group" aria-label="Pose tilt controls">
          <label className="pose-tilt-control">
            <span className="pose-tilt-label">X</span>
            <input
              type="range"
              min={0}
              max={35}
              step={1}
              value={tiltX}
              onChange={handleTiltXChange}
              aria-label="Pose tilt X"
            />
            <span className="pose-tilt-value">{tiltX}deg</span>
          </label>
          <label className="pose-tilt-control">
            <span className="pose-tilt-label">Y</span>
            <input
              type="range"
              min={-25}
              max={25}
              step={1}
              value={tiltY}
              onChange={handleTiltYChange}
              aria-label="Pose tilt Y"
            />
            <span className="pose-tilt-value">{tiltY}deg</span>
          </label>
        </div>
      </div>
      <p className="pose-sidebar-meta">{items.length} elements</p>
      <p className="pose-sidebar-hint">↑/↓ move selection</p>

      {items.length === 0 ? (
        <p className="pose-sidebar-empty">No markdown elements found.</p>
      ) : (
        <ul className="pose-list" ref={listRef}>
          {items.map((item, index) => (
            <li key={item.id} className="pose-list-item">
              <button
                type="button"
                className={`pose-list-button${selectedIndex === index ? " is-active" : ""}`}
                data-pose-index={index}
                onClick={() => onSelect(index)}
              >
                <span className="pose-list-tag">{TRAVERSE_TAG_LABELS[item.type]}</span>
                <span className="pose-list-text">{item.text}</span>
                {item.line ? (
                  <span className="pose-list-line">L{item.line}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
