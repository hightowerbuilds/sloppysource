import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import "./App.css";
import {
  clearDocuments,
  deleteDocument,
  listDocuments,
  putDocument,
  type StoredDocument,
} from "./lib/docsDb";

const MAX_MARKDOWN_BYTES = 100 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [".md", ".markdown"];
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});
const markdownComponents: Components = {
  h1: "p",
  h2: "p",
  h3: "p",
  h4: "p",
  h5: "p",
  h6: "p",
};

function App() {
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [isDumping, setIsDumping] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeDocument = useMemo(
    () =>
      documents.find((document) => document.id === activeDocumentId) ?? null,
    [documents, activeDocumentId],
  );
  const duplicateNameCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const document of documents) {
      counts.set(document.name, (counts.get(document.name) ?? 0) + 1);
    }

    return counts;
  }, [documents]);
  const localSummary = useMemo(() => {
    const totalSizeBytes = documents.reduce(
      (total, document) => total + document.sizeBytes,
      0,
    );

    return {
      documentCount: documents.length,
      totalSizeBytes,
      lastUpdatedAt: documents[0]?.updatedAt ?? null,
    };
  }, [documents]);

  useEffect(() => {
    void loadDocuments();
  }, []);

  useEffect(() => {
    if (documents.length === 0) {
      setActiveDocumentId(null);
      return;
    }

    const hasActiveDocument = activeDocumentId
      ? documents.some((document) => document.id === activeDocumentId)
      : false;

    if (!hasActiveDocument) {
      setActiveDocumentId(documents[0].id);
    }
  }, [documents, activeDocumentId]);

  async function loadDocuments() {
    setIsLoadingDocuments(true);

    try {
      const storedDocuments = await listDocuments();
      setDocuments(storedDocuments);
      setErrorMessage(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load documents.";
      setErrorMessage(message);
    } finally {
      setIsLoadingDocuments(false);
    }
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    event.target.value = "";

    const validationError = validateMarkdownUpload(file);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);

    try {
      const markdown = await file.text();

      if (!markdown.trim()) {
        throw new Error(
          "File is empty. Upload a markdown document with content.",
        );
      }

      const timestamp = new Date().toISOString();
      const documentToSave: StoredDocument = {
        id: createDocumentKey(file.name),
        name: file.name,
        markdown,
        sizeBytes: file.size,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      const savedDocument = await putDocument(documentToSave);

      setDocuments((previousDocuments) =>
        sortDocumentsByRecent([savedDocument, ...previousDocuments]),
      );

      setActiveDocumentId(savedDocument.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed.";
      setErrorMessage(message);
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDeleteDocument(id: string) {
    setIsDeletingId(id);
    setErrorMessage(null);

    try {
      await deleteDocument(id);
      setDocuments((previousDocuments) =>
        previousDocuments.filter((document) => document.id !== id),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete document.";
      setErrorMessage(message);
    } finally {
      setIsDeletingId(null);
    }
  }

  async function handleDumpDocuments() {
    if (documents.length === 0 || isDumping) {
      return;
    }

    const shouldDump = window.confirm(
      `Delete all ${documents.length} markdown file(s) from local IndexedDB?`,
    );

    if (!shouldDump) {
      return;
    }

    setIsDumping(true);
    setErrorMessage(null);

    try {
      await clearDocuments();
      setDocuments([]);
      setActiveDocumentId(null);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to dump local markdown documents.";
      setErrorMessage(message);
    } finally {
      setIsDumping(false);
    }
  }

  return (
    <main className="app-shell">
      <p className="brand">sloppysource.dev</p>
      <p className="subtitle">
        Upload markdown files from your machine. Documents stay in your browser
        via IndexedDB.
      </p>

      <section className="top-panels">
        <section className="toolbar">
          <p className="section-title">Upload</p>
          <label className="upload-button" htmlFor="markdown-upload">
            {isUploading ? "Uploading..." : "Upload .md"}
          </label>
          <input
            className="upload-input"
            id="markdown-upload"
            type="file"
            accept=".md,.markdown,text/markdown"
            onChange={handleUpload}
            disabled={isUploading}
          />
          <p className="hint">
            Max file size: 100MB. Same filenames are saved as separate records.
          </p>
          {errorMessage ? (
            <p className="status error" role="status">
              {errorMessage}
            </p>
          ) : null}
        </section>

        <aside className="library" aria-label="Uploaded markdown documents">
          <div className="library-header">
            <p className="section-title">MD Files</p>
            <span>{documents.length}</span>
          </div>

          {isLoadingDocuments ? (
            <p className="empty">Loading documents...</p>
          ) : null}

          {!isLoadingDocuments && documents.length === 0 ? (
            <p className="empty">
              No markdown docs yet. Upload your first file.
            </p>
          ) : null}

          {!isLoadingDocuments && documents.length > 0 ? (
            <ul className="document-list">
              {documents.map((document) => {
                const isDuplicate = (duplicateNameCounts.get(document.name) ?? 0) > 1;

                return (
                  <li className="document-item" key={document.id}>
                    <button
                      className={`document-button ${
                        document.id === activeDocumentId ? "is-active" : ""
                      }`}
                      onClick={() => setActiveDocumentId(document.id)}
                      type="button"
                    >
                      <span className="document-name-row">
                        <span className="document-name">{document.name}</span>
                        {isDuplicate ? (
                          <span className="duplicate-chip">Duplicate</span>
                        ) : null}
                      </span>
                      <span className="document-meta">
                        {formatBytes(document.sizeBytes)} ·{" "}
                        {formatDate(document.updatedAt)}
                      </span>
                    </button>
                    <button
                      className="delete-button"
                      disabled={isDeletingId === document.id}
                      onClick={() => void handleDeleteDocument(document.id)}
                      type="button"
                    >
                      {isDeletingId === document.id ? "..." : "Delete"}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </aside>

        <section className="local-view" aria-label="Local indexedDB summary">
          <p className="section-title">Local View</p>
          <p className="hint">
            Stored in this browser profile via IndexedDB.
          </p>
          <p className="local-stat">
            Docs: {localSummary.documentCount}
          </p>
          <p className="local-stat">
            Total size: {formatBytes(localSummary.totalSizeBytes)}
          </p>
          <p className="local-stat">
            Last update:{" "}
            {localSummary.lastUpdatedAt
              ? formatDate(localSummary.lastUpdatedAt)
              : "None yet"}
          </p>
          <button
            className="dump-button"
            disabled={isDumping || localSummary.documentCount === 0}
            onClick={() => void handleDumpDocuments()}
            type="button"
          >
            {isDumping ? "Dumping..." : "Dump"}
          </button>
          <p className="hint">Removes all markdown files at once.</p>
        </section>
      </section>

      <section className="workspace">
        <article className="viewer" aria-live="polite">
          {activeDocument ? (
            <>
              <div className="viewer-header">
                <p className="section-title">{activeDocument.name}</p>
                <p>
                  Updated {formatDate(activeDocument.updatedAt)} ·{" "}
                  {formatBytes(activeDocument.sizeBytes)}
                </p>
              </div>
              <div className="markdown-output">
                <ReactMarkdown
                  components={markdownComponents}
                  remarkPlugins={[remarkGfm]}
                >
                  {activeDocument.markdown}
                </ReactMarkdown>
              </div>
            </>
          ) : (
            <div className="viewer-empty">
              <p>
                Pick a document from the left or upload a markdown file to
                preview it here.
              </p>
            </div>
          )}
        </article>
      </section>
    </main>
  );
}

function validateMarkdownUpload(file: File): string | null {
  const lowercaseName = file.name.toLowerCase();
  const isAcceptedExtension = ACCEPTED_EXTENSIONS.some((extension) =>
    lowercaseName.endsWith(extension),
  );

  if (!isAcceptedExtension) {
    return "Only .md and .markdown files are supported.";
  }

  if (file.size === 0) {
    return "File is empty. Upload a markdown document with content.";
  }

  if (file.size > MAX_MARKDOWN_BYTES) {
    return "File exceeds the 100MB limit.";
  }

  return null;
}

function createDocumentKey(fileName: string): string {
  const normalizedName =
    fileName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "md-file";

  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${normalizedName}-${Date.now()}-${crypto.randomUUID()}`;
  }

  return `${normalizedName}-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
}

function sortDocumentsByRecent(documents: StoredDocument[]): StoredDocument[] {
  return [...documents].sort((firstDocument, secondDocument) =>
    secondDocument.updatedAt.localeCompare(firstDocument.updatedAt),
  );
}

function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let value = sizeBytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function formatDate(value: string): string {
  return dateFormatter.format(new Date(value));
}

export default App;
