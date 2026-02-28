import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createLazyRoute, useNavigate } from "@tanstack/react-router";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { DocumentSearchModal } from "../components/DocumentSearchModal.tsx";
import { deleteDocument, getDocument } from "../lib/supabaseDb.ts";
import "./ViewerPage.css";

const DOCUMENTS_QUERY_KEY = ["documents"] as const;
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
const remarkPluginsConfig = [remarkGfm];

export const Route = createLazyRoute("/doc/$docId")({
  component: ViewerPage,
});

function ViewerPage() {
  const { docId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  const documentQuery = useQuery({
    queryKey: ["document", docId] as const,
    queryFn: () => getDocument(docId),
    staleTime: 60_000,
  });

  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await deleteDocument(id);
    },
    onSuccess: async () => {
      setErrorMessage(null);
      await queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: ["storage-usage"] });
      await navigate({ to: "/" });
    },
  });

  const document = documentQuery.data ?? null;
  const isDeleting = deleteMutation.isPending;

  useEffect(() => {
    if (!document) {
      return;
    }

    function handleGlobalSearchShortcut(event: KeyboardEvent) {
      const isFindShortcut =
        (event.metaKey || event.ctrlKey) &&
        (event.key === "f" || event.key === "F");

      if (!isFindShortcut) {
        return;
      }

      event.preventDefault();
      setIsSearchModalOpen(true);
    }

    window.addEventListener("keydown", handleGlobalSearchShortcut);
    return () => window.removeEventListener("keydown", handleGlobalSearchShortcut);
  }, [document]);

  async function handleDelete() {
    setErrorMessage(null);

    try {
      await deleteMutation.mutateAsync(docId);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to delete document.",
      );
    }
  }

  return (
    <section className="workspace">
      <article className="viewer" aria-live="polite">
        <div className="viewer-nav">
          <Link to="/" className="back-link">
            &larr; Back to list
          </Link>
        </div>

        {documentQuery.isPending ? (
          <div className="viewer-empty">
            <p>Loading document...</p>
          </div>
        ) : document ? (
          <>
            <div className="viewer-header">
              <p className="section-title">{document.name}</p>
              <p>
                Updated {formatDate(document.updatedAt)} ·{" "}
                {formatBytes(document.sizeBytes)}
              </p>
              <div className="viewer-actions">
                <button
                  className="search-button"
                  type="button"
                  onClick={() => setIsSearchModalOpen(true)}
                >
                  Search
                </button>
                <button
                  className="delete-button"
                  disabled={isDeleting}
                  onClick={() => void handleDelete()}
                  type="button"
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
            {errorMessage ? (
              <p className="status error" role="status">
                {errorMessage}
              </p>
            ) : null}
            <div className="markdown-output">
              <ReactMarkdown
                components={markdownComponents}
                remarkPlugins={remarkPluginsConfig}
              >
                {document.markdown}
              </ReactMarkdown>
            </div>
            <DocumentSearchModal
              isOpen={isSearchModalOpen}
              onClose={() => setIsSearchModalOpen(false)}
              documentName={document.name}
              markdown={document.markdown}
            />
          </>
        ) : (
          <div className="viewer-empty">
            <p>Document not found.</p>
          </div>
        )}
      </article>
    </section>
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
