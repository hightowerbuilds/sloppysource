import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listDocuments, type DocumentMeta } from "../lib/supabaseDb.ts";
import { useSelectedDoc } from "../lib/useSelectedDoc.ts";
import "./DocPicker.css";

interface DocPickerProps {
  onSelect?: () => void;
}

export function DocPicker({ onSelect }: DocPickerProps) {
  const { docId, setDocId } = useSelectedDoc();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const documentsQuery = useQuery({
    queryKey: ["documents"] as const,
    queryFn: listDocuments,
    staleTime: 30_000,
  });

  const documents = documentsQuery.data ?? [];
  const selectedName = documents.find((d) => d.id === docId)?.name ?? null;

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  function handleSelect(doc: DocumentMeta) {
    const changed = doc.id !== docId;
    setDocId(doc.id);
    setIsOpen(false);
    if (changed && onSelect) {
      onSelect();
    }
  }

  return (
    <div className="doc-picker" ref={containerRef}>
      <button
        type="button"
        className="doc-picker-button"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        {selectedName ?? "Select MD"}
        <span className="doc-picker-arrow">{isOpen ? "\u25B2" : "\u25BC"}</span>
      </button>

      {isOpen ? (
        <div className="doc-picker-dropdown">
          {documents.length === 0 ? (
            <p className="doc-picker-empty">No documents uploaded yet.</p>
          ) : (
            <ul className="doc-picker-list">
              {documents.map((doc) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    className={`doc-picker-item${doc.id === docId ? " is-active" : ""}`}
                    onClick={() => handleSelect(doc)}
                  >
                    {doc.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
