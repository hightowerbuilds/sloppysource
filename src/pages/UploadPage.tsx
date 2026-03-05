import { useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createLazyRoute, useNavigate } from "@tanstack/react-router";
import {
  listDocuments,
  putDocument,
  type DocumentMeta,
  type StoredDocument,
} from "../lib/supabaseDb.ts";
import {
  documentQueryKey,
  documentsQueryKey,
  storageUsageQueryKey,
} from "../lib/queryKeys.ts";
import { useAuthUser } from "../lib/useAuthUser.ts";
import { useSelectedDoc } from "../lib/useSelectedDoc.ts";
import { formatBytes, formatDate } from "../lib/format.ts";
import "./UploadPage.css";

const MAX_MARKDOWN_BYTES = 5 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [".md", ".markdown"];

export const Route = createLazyRoute("/upload")({
  component: UploadPage,
});

function UploadPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { docId, setDocId } = useSelectedDoc();
  const user = useAuthUser();
  const userId = user?.id ?? null;
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const documentsQuery = useQuery({
    queryKey: documentsQueryKey(userId),
    queryFn: listDocuments,
    staleTime: 30_000,
    enabled: !!userId,
  });

  const uploadMutation = useMutation<StoredDocument, Error, File>({
    mutationFn: async (file: File) => {
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
    onSuccess: async (savedDocument: StoredDocument) => {
      setErrorMessage(null);
      setDocId(savedDocument.id);
      await queryClient.invalidateQueries({ queryKey: documentsQueryKey(userId) });
      await queryClient.invalidateQueries({
        queryKey: documentQueryKey(userId, savedDocument.id),
      });
      await queryClient.invalidateQueries({ queryKey: storageUsageQueryKey(userId) });
      await navigate({ to: "/display" });
    },
  });

  const documents = useMemo(() => documentsQuery.data ?? [], [documentsQuery.data]);
  const isLoadingDocuments = documentsQuery.isPending;
  const isUploading = uploadMutation.isPending;

  const duplicateNameCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const document of documents) {
      counts.set(document.name, (counts.get(document.name) ?? 0) + 1);
    }

    return counts;
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

  function handleUploadClick() {
    uploadInputRef.current?.click();
  }

  const displayedErrorMessage =
    errorMessage ?? getErrorMessage(documentsQuery.error, null);

  return (
    <section className="workspace">
      <div className="home-page">
        <section className="library" aria-label="Uploaded markdown documents">
          <div className="library-header">
            <p className="section-title">MD Files</p>
            <span className="library-count">{documents.length}</span>
            <button
              className="upload-button library-upload-button"
              type="button"
              onClick={handleUploadClick}
              disabled={isUploading}
            >
              {isUploading ? "Uploading..." : "Upload .md"}
            </button>
          </div>
          <input
            ref={uploadInputRef}
            className="upload-input"
            type="file"
            accept=".md,.markdown,text/markdown"
            onChange={handleUpload}
            disabled={isUploading}
          />

          {displayedErrorMessage ? (
            <p className="status error" role="status">
              {displayedErrorMessage}
            </p>
          ) : null}

          {isLoadingDocuments ? <p className="empty">Loading documents...</p> : null}

          {!isLoadingDocuments && documents.length === 0 ? (
            <p className="empty">No markdown docs yet. Upload your first file.</p>
          ) : null}

          {!isLoadingDocuments && documents.length > 0 ? (
            <ul className="document-list">
              {documents.map((document: DocumentMeta) => {
                const isDuplicate = (duplicateNameCounts.get(document.name) ?? 0) > 1;

                return (
                  <li className="document-item" key={document.id}>
                    <Link
                      className={`document-button${docId === document.id ? " is-active" : ""}`}
                      to="/display"
                      onClick={() => setDocId(document.id)}
                    >
                      <span className="document-name">{document.name}</span>
                      {isDuplicate ? (
                        <span className="duplicate-chip">Duplicate</span>
                      ) : null}
                      <span className="document-meta">
                        {formatBytes(document.sizeBytes)}
                      </span>
                      <span className="document-meta">
                        {formatDate(document.updatedAt)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>
      </div>
    </section>
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
