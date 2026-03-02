import { useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createLazyRoute, useNavigate } from "@tanstack/react-router";
import {
  clearDocuments,
  getUserStorageUsage,
  listDocuments,
  putDocument,
  type StoredDocument,
} from "../lib/supabaseDb.ts";
import { formatBytes, formatDate } from "../lib/format.ts";
import "./HomePage.css";

const MAX_MARKDOWN_BYTES = 5 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [".md", ".markdown"];
const DOCUMENTS_QUERY_KEY = ["documents"] as const;

export const Route = createLazyRoute("/")({
  component: HomePage,
});

function HomePage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const documentsQuery = useQuery({
    queryKey: DOCUMENTS_QUERY_KEY,
    queryFn: listDocuments,
    staleTime: 30_000,
  });

  const storageQuery = useQuery({
    queryKey: ["storage-usage"],
    queryFn: getUserStorageUsage,
    staleTime: 30_000,
  });

  const uploadMutation = useMutation<StoredDocument, Error, File>({
    mutationFn: async (file) => {
      const markdown = await file.text();

      if (!markdown.trim()) {
        throw new Error("File is empty. Upload a markdown document with content.");
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

      return putDocument(documentToSave);
    },
    onSuccess: async (savedDocument) => {
      setErrorMessage(null);
      await queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: ["document", savedDocument.id] });
      await queryClient.invalidateQueries({ queryKey: ["storage-usage"] });
      await navigate({ to: "/doc/$docId", params: { docId: savedDocument.id } });
    },
  });

  const dumpMutation = useMutation<void, Error>({
    mutationFn: async () => {
      await clearDocuments();
    },
    onSuccess: async () => {
      setErrorMessage(null);
      await queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: ["storage-usage"] });
    },
  });

  const documents = documentsQuery.data ?? [];
  const isLoadingDocuments = documentsQuery.isPending;
  const isUploading = uploadMutation.isPending;
  const isDumping = dumpMutation.isPending;

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

    setErrorMessage(null);

    try {
      await uploadMutation.mutateAsync(file);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Upload failed."));
    }
  }

  async function handleDumpDocuments() {
    if (documents.length === 0 || isDumping) {
      return;
    }

    const shouldDump = window.confirm(
      `Delete all ${documents.length} markdown file(s) from your account?`,
    );

    if (!shouldDump) {
      return;
    }

    setErrorMessage(null);

    try {
      await dumpMutation.mutateAsync();
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error, "Failed to dump local markdown documents."),
      );
    }
  }

  const displayedErrorMessage =
    errorMessage ?? getErrorMessage(documentsQuery.error, null);

  return (
    <>
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
            Max file size: 5MB. Same filenames are saved as separate records.
          </p>
          {displayedErrorMessage ? (
            <p className="status error" role="status">
              {displayedErrorMessage}
            </p>
          ) : null}
        </section>

        <aside className="library" aria-label="Uploaded markdown documents">
          <div className="library-header">
            <p className="section-title">MD Files</p>
            <span>{documents.length}</span>
          </div>

          {isLoadingDocuments ? <p className="empty">Loading documents...</p> : null}

          {!isLoadingDocuments && documents.length === 0 ? (
            <p className="empty">No markdown docs yet. Upload your first file.</p>
          ) : null}

          {!isLoadingDocuments && documents.length > 0 ? (
            <ul className="document-list">
              {documents.map((document) => {
                const isDuplicate = (duplicateNameCounts.get(document.name) ?? 0) > 1;

                return (
                  <li className="document-item" key={document.id}>
                    <Link
                      className="document-button"
                      to="/doc/$docId"
                      params={{ docId: document.id }}
                    >
                      <span className="document-name-row">
                        <span className="document-name">{document.name}</span>
                        {isDuplicate ? (
                          <span className="duplicate-chip">Duplicate</span>
                        ) : null}
                      </span>
                      <span className="document-meta">
                        {formatBytes(document.sizeBytes)} · {formatDate(document.updatedAt)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </aside>

        <section className="local-view" aria-label="Storage usage">
          <p className="section-title">Storage</p>
          <p className="hint">Stored in your SloppySource account.</p>
          <p className="local-stat">Docs: {localSummary.documentCount}</p>
          <p className="local-stat">
            Used: {formatBytes(localSummary.totalSizeBytes)} / 100 MB
          </p>
          {storageQuery.data ? (
            <div className="quota-bar-container">
              <div className="quota-bar-track">
                <div
                  className={`quota-bar-fill${
                    storageQuery.data.usedBytes / storageQuery.data.limitBytes > 0.9
                      ? " is-danger"
                      : storageQuery.data.usedBytes / storageQuery.data.limitBytes > 0.7
                        ? " is-warning"
                        : ""
                  }`}
                  style={{
                    width: `${Math.min(
                      100,
                      (storageQuery.data.usedBytes / storageQuery.data.limitBytes) * 100,
                    )}%`,
                  }}
                />
              </div>
            </div>
          ) : null}
          <p className="local-stat">
            Last update:{" "}
            {localSummary.lastUpdatedAt ? formatDate(localSummary.lastUpdatedAt) : "None yet"}
          </p>
          <button
            className="dump-button"
            disabled={isDumping || localSummary.documentCount === 0}
            onClick={() => void handleDumpDocuments()}
            type="button"
          >
            {isDumping ? "Deleting..." : "Delete All"}
          </button>
          <p className="hint">Removes all your markdown files at once.</p>
        </section>
      </section>
    </>
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
    return "File exceeds the 5MB limit.";
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

  return `${normalizedName}-${Date.now()}-${crypto.randomUUID()}`;
}

function getErrorMessage(error: unknown, fallbackMessage: string | null): string | null {
  if (error instanceof Error) {
    return error.message;
  }

  return fallbackMessage;
}
