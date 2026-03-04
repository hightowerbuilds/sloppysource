import type { RefObject } from "react";
import {
  TRAVERSE_TAG_LABELS,
  type TraverseItem,
  type TraverseNavigationMode,
} from "../../lib/traverseModels.ts";
import "./TraverseSidebar.css";

interface TraverseSidebarProps {
  items: TraverseItem[];
  isOpen: boolean;
  selectedIndex: number;
  navigationMode: TraverseNavigationMode;
  listRef: RefObject<HTMLUListElement | null>;
  onSelect: (index: number) => void;
  onClose: () => void;
}

export function TraverseSidebar({
  items,
  isOpen,
  selectedIndex,
  navigationMode,
  listRef,
  onSelect,
  onClose,
}: TraverseSidebarProps) {
  if (!isOpen) return null;

  return (
    <aside className="traverse-sidebar" aria-label="Document element list">
      <div className="traverse-sidebar-header">
        <p className="traverse-sidebar-title">Traverse</p>
        <button type="button" className="traverse-close-button" onClick={onClose}>
          Close
        </button>
      </div>

      <p className="traverse-sidebar-meta">
        {items.length} elements · {navigationMode === "document" ? "Document mode" : "List mode"}
      </p>
      <p className="traverse-sidebar-hint">↑/↓ move · → open · ← back</p>

      {items.length === 0 ? (
        <p className="traverse-sidebar-empty">No markdown elements found.</p>
      ) : (
        <ul className="traverse-list" ref={listRef}>
          {items.map((item, index) => (
            <li key={item.id} className="traverse-list-item">
              <button
                type="button"
                className={`traverse-list-button${selectedIndex === index ? " is-active" : ""}`}
                data-traverse-index={index}
                onClick={() => onSelect(index)}
              >
                <span className="traverse-list-tag">{TRAVERSE_TAG_LABELS[item.type]}</span>
                <span className="traverse-list-text">{item.text}</span>
                {item.line ? (
                  <span className="traverse-list-line">L{item.line}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
