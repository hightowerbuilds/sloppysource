import { Link, createLazyRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { documentsQueryKey } from "../lib/queryKeys.ts";
import { listDocuments } from "../lib/supabaseDb.ts";
import { useAuthUser } from "../lib/useAuthUser.ts";
import { useSelectedDoc } from "../lib/useSelectedDoc.ts";
import "./HomePage.css";

export const Route = createLazyRoute("/")({
  component: HomePage,
});

function HomePage() {
  const user = useAuthUser();
  const { docId } = useSelectedDoc();
  const userId = user?.id ?? null;
  const username = user?.user_metadata?.username as string | undefined;

  const documentsQuery = useQuery({
    queryKey: documentsQueryKey(userId),
    queryFn: listDocuments,
    staleTime: 30_000,
    enabled: !!userId,
  });

  const totalDocuments = documentsQuery.data?.length ?? 0;

  return (
    <section className="workspace">
      <article className="home-landing">
        <header className="home-landing-header">
          <p className="section-title">Home</p>
          <h1 className="home-landing-title">
            Welcome{username ? `, ${username}` : ""}.
          </h1>
          <p className="home-landing-subtitle">
            Choose where you want to work next.
          </p>
        </header>

        <div className="home-landing-grid">
          <Link className="home-landing-card fx-tv-static fx-tv-static-hover" to="/upload">
            <p className="home-landing-card-title">Upload</p>
            <p className="home-landing-card-text">
              Add markdown files and manage your document list.
            </p>
          </Link>

          <Link className="home-landing-card fx-tv-static fx-tv-static-hover" to="/project">
            <p className="home-landing-card-title">Projects</p>
            <p className="home-landing-card-text">
              Open project-level tools, notes, and roadmap workflows.
            </p>
          </Link>

          <Link className="home-landing-card fx-tv-static fx-tv-static-hover" to="/display">
            <p className="home-landing-card-title">Display</p>
            <p className="home-landing-card-text">
              Read and present the selected markdown document.
            </p>
          </Link>

          <Link className="home-landing-card fx-tv-static fx-tv-static-hover" to="/search">
            <p className="home-landing-card-title">Search</p>
            <p className="home-landing-card-text">
              Filter lines by text, regex, and markdown tags.
            </p>
          </Link>
        </div>

        <footer className="home-landing-footer">
          {documentsQuery.isPending ? (
            <p className="hint">Loading document stats...</p>
          ) : (
            <p className="hint">
              {totalDocuments} document{totalDocuments === 1 ? "" : "s"} available
              {docId ? " · a document is selected" : " · no document selected"}.
            </p>
          )}
        </footer>
      </article>
    </section>
  );
}
