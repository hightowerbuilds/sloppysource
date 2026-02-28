# Display Page — Search, Word Analysis & Note-Cards

**Decision: TypeScript (in-browser) for search + Bun.serve API layer for analysis and note-cards**

---

## Goal

Build three connected features on the Display (viewer) page:

1. **Find in document** — search for words and phrases, highlight matches, navigate between them
2. **Word frequency analysis** — surface repeated words/phrases, rank by count, visualize usage patterns
3. **Note-cards** — save searches and analysis results into compilable, reusable cards

All three should feel instant and native to the SPA experience.

---

## Why TypeScript for In-Document Search

We evaluated Go WASM, Rust WASM, a Go backend, and pure TypeScript. TypeScript won:

- **Fastest search.** V8's `String.indexOf` is native C++ with SIMD — searches 5 MB in <1 ms. No WASM module can beat this.
- **Zero overhead.** No binary to download/compile/initialize. No new toolchain.
- **Best React integration.** The CSS Custom Highlight API highlights matches without mutating the DOM.
- **Simplest to build.** One custom hook + one component + CSS.

| Ruled Out | Why |
|-----------|-----|
| Go WASM | 800 KB–1.5 MB bundle, 200–800 ms cold start, slower than V8 for string search |
| Rust WASM | Good perf but can't beat V8 for substring matching. Adds Rust toolchain. Overkill here |
| Go backend | Network latency (70–800 ms) kills search-as-you-type. Document is already client-side |

---

## Why Bun for the Analysis Layer

Bun is already our package manager. Its runtime capabilities give us a lightweight server layer that fills gaps the browser and Supabase can't cover efficiently:

### What Bun Brings

| Capability | What It Does for Us |
|-----------|---------------------|
| **`Bun.serve`** | Thin API server — 2.5–4x faster throughput than Node/Express. Handles word frequency requests, note-card CRUD, cross-document search |
| **`bun:sqlite`** | Built-in SQLite with zero npm dependencies. 3–6x faster row-to-JS conversion than Node's better-sqlite3. Gives us FTS5 full-text search |
| **Bun Workers** | Background document indexing. 241x faster than Node for passing 3 MB strings to a worker. Pre-computes word frequency at upload time |
| **`Bun.hash`** | Wyhash (nanosecond-scale) for note-card deduplication |

### Why Not Just Do Everything Client-Side?

| Concern | Client-Only | With Bun Layer |
|---------|-------------|----------------|
| Word freq on 5 MB doc | 20–50 ms, blocks main thread | Computed once at upload, cached, served in <0.1 ms |
| Repeat analysis on same doc | Recomputed every time | Cached in SQLite |
| Cross-document search | Must load all docs into browser memory | FTS5 query across index in <1 ms |
| Note-card persistence | Supabase only (20–100 ms per read) | SQLite cache <0.1 ms, synced to Supabase |
| Browser responsiveness | Main thread busy during analysis | Main thread free for CSS Highlight API |

### Why Not Just Use Supabase for Everything?

Supabase is the source of truth for documents and auth. But every query has 20–100 ms network latency. For features that need instant response (word frequency lookup, note-card browsing, search-as-you-type across documents), a local SQLite cache served by Bun is 100–1000x faster on reads.

---

## The Core Challenge

Rendered markdown splits visible text across many DOM nodes. A search for "bold and italic" in `This is **bold** and *italic* text` spans three nodes (`<strong>`, text, `<em>`). The search must work against visible text and highlight across element boundaries — without breaking React's virtual DOM.

The CSS Custom Highlight API solves this by operating entirely outside React's awareness.

---

## Feature 1: Find in Document

### Performance Budget

| Operation | 5 MB document | Notes |
|-----------|---------------|-------|
| `element.textContent` | ~5–10 ms | Extracts all visible text |
| `String.indexOf` loop | **<1 ms** | Native C++, SIMD-accelerated |
| `RegExp.exec` loop | 2–10 ms | JIT-compiled to machine code |
| `TreeWalker` traversal | ~10–20 ms | Build text node map (cacheable) |
| Create `Range` objects | ~0.1 ms/match | 100 matches = 10 ms |
| `CSS.highlights.set()` | ~5–10 ms | Browser renders natively |
| **Total** | **~25–50 ms** | Under the 100 ms "instant" threshold |

### CSS Custom Highlight API

```typescript
// 1. Walk the DOM to find text nodes
const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
const textNodes: Text[] = [];
while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

// 2. Search and create Range objects
const ranges: Range[] = [];
for (const node of textNodes) {
  const text = node.textContent!.toLowerCase();
  let idx = text.indexOf(query);
  while (idx !== -1) {
    const range = new Range();
    range.setStart(node, idx);
    range.setEnd(node, idx + query.length);
    ranges.push(range);
    idx = text.indexOf(query, idx + 1);
  }
}

// 3. Apply highlights — NO DOM mutation, React is unaware
CSS.highlights.set("search-results", new Highlight(...ranges));
```

```css
::highlight(search-results) {
  background-color: rgba(255, 200, 50, 0.35);
}
::highlight(current-match) {
  background-color: rgba(255, 140, 0, 0.55);
}
```

### Browser Support

| Browser | Support |
|---------|---------|
| Chrome / Edge | 105+ |
| Safari | 17.2+ |
| Firefox | Not supported — fallback to `<mark>` via rehype plugin or "use Ctrl+F" message |

### Search Capabilities

| Feature | Implementation | Complexity |
|---------|---------------|------------|
| Exact substring | `String.indexOf` loop | Trivial |
| Case-insensitive | `toLowerCase()` both strings | Trivial |
| Regex mode | `new RegExp(userInput, 'gi')` with toggle | Low |
| Whole word | `\b${escaped}\b` regex | Low |
| Match count | `ranges.length` | Free |
| Next/Previous | Index into ranges + `scrollIntoView()` | Low |
| Keyboard shortcuts | `Ctrl+F`, `Enter`/`Shift+Enter`, `Escape` | Low |

### UX Flow

1. User presses `Ctrl+F` or clicks search icon in viewer header
2. Search bar slides in above the markdown content
3. User types — matches highlight in real time (debounced 150 ms)
4. Match count badge: "3 of 17"
5. `Enter` = next match (scrolls into view, orange highlight)
6. `Shift+Enter` = previous match
7. `Escape` = close search bar, clear highlights

---

## Feature 2: Word Frequency Analysis

### What It Does

Surfaces repeated words and phrases in a document. Users see which words appear most often, spot patterns, and can click any word to highlight all its occurrences using the same CSS Highlight API.

### How Bun Powers This

**At upload time** (not at view time):

1. Document uploaded to Supabase via SPA
2. Bun server detects new document (Supabase realtime subscription or webhook)
3. Bun Worker receives the markdown content (passing a 3 MB string: **~1.3 microseconds**)
4. Worker tokenizes text and counts word frequency (~20–40 ms for 5 MB)
5. Results cached in `bun:sqlite` word_freq table
6. When user opens the document, frequency data loads from cache in **<0.1 ms**

```typescript
// Worker: word frequency computation
function computeWordFrequency(text: string): Map<string, number> {
  const freq = new Map<string, number>();
  // Strip markdown syntax, lowercase, split on whitespace + punctuation
  const words = text
    .replace(/[#*_`~\[\]()>|\\-]/g, " ")
    .toLowerCase()
    .split(/\s+/);
  for (const word of words) {
    if (word.length > 1) {
      freq.set(word, (freq.get(word) ?? 0) + 1);
    }
  }
  return freq;
}
```

```sql
-- bun:sqlite schema for word frequency cache
CREATE TABLE word_freq (
  doc_id TEXT NOT NULL,
  word   TEXT NOT NULL,
  count  INTEGER NOT NULL,
  PRIMARY KEY (doc_id, word)
);

CREATE INDEX idx_word_freq_count ON word_freq (doc_id, count DESC);
```

### Phrase Frequency (n-grams)

Beyond single words, detect repeated 2-word and 3-word phrases:

```typescript
function computeNgramFrequency(words: string[], n: number): Map<string, number> {
  const freq = new Map<string, number>();
  for (let i = 0; i <= words.length - n; i++) {
    const ngram = words.slice(i, i + n).join(" ");
    freq.set(ngram, (freq.get(ngram) ?? 0) + 1);
  }
  return freq;
}
```

Store bigrams and trigrams in the same table with a `type` column (`word`, `bigram`, `trigram`).

### UX Ideas

- **Sidebar panel** on the Display page — toggled via a "Word Stats" button in the viewer header
- **Top N list** — show the 20 most-used words with bar chart visualization
- **Stop word filter** — toggle to hide common words ("the", "and", "is", etc.)
- **Click to highlight** — clicking any word in the frequency list highlights all its occurrences in the document via CSS Highlight API (same infrastructure as search)
- **Phrase detection** — separate tabs for single words, 2-word phrases, 3-word phrases
- **Comparison view** — if viewing multiple documents, compare word usage across them

### Performance

| Step | Time | Where |
|------|------|-------|
| Document upload → index | 80–220 ms | Bun Worker (background, non-blocking) |
| Fetch cached frequency data | <0.1 ms | bun:sqlite |
| Render frequency sidebar | ~5–10 ms | React (small component) |
| Click word → highlight in doc | ~25–50 ms | Client-side CSS Highlight API |

---

## Feature 3: Note-Cards

### What It Does

Users save searches and analysis results as "note-cards" — small, titled snapshots that can be organized, tagged, and compiled into collections. Think of them as bookmarks with context.

### What a Note-Card Contains

```typescript
interface NoteCard {
  id: string;
  userId: string;
  documentId: string;          // which document it came from
  documentName: string;        // human-readable source name
  type: "search" | "frequency" | "manual";
  title: string;               // user-editable title
  query: string;               // the search term or word
  matchCount: number;          // how many times it appeared
  snippets: string[];          // surrounding context for each match (first N)
  tags: string[];              // user-defined tags for organization
  contentHash: string;         // Bun.hash wyhash for dedup
  createdAt: string;
  updatedAt: string;
}
```

### How Note-Cards Are Created

**From search:**
- User searches for "algorithm" → finds 12 matches
- Clicks "Save as Note-Card" button next to the match count
- Card auto-populates: title = "algorithm", query = "algorithm", matchCount = 12, snippets = first 5 surrounding-context extracts

**From word frequency:**
- User views frequency sidebar, sees "function" appears 47 times
- Clicks a save icon next to the word
- Card auto-populates: title = "function (47x)", type = "frequency"

**Manual:**
- User creates a blank note-card and types custom notes about the document

### Storage: bun:sqlite + Supabase Sync

Note-cards live in two places:

| Layer | Role | Latency |
|-------|------|---------|
| **bun:sqlite** | Fast local cache. All reads come from here. | <0.1 ms |
| **Supabase Postgres** | Source of truth. Cross-device sync. | 20–100 ms |

Write path: write to SQLite first (instant), then async sync to Supabase in the background.
Read path: always read from SQLite (instant).
Conflict resolution: last-write-wins based on `updatedAt` timestamp.

```sql
-- bun:sqlite note-card schema
CREATE TABLE notecards (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  document_id   TEXT NOT NULL,
  document_name TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'search',
  title         TEXT NOT NULL,
  query         TEXT NOT NULL DEFAULT '',
  match_count   INTEGER NOT NULL DEFAULT 0,
  snippets      TEXT NOT NULL DEFAULT '[]',    -- JSON array
  tags          TEXT NOT NULL DEFAULT '[]',     -- JSON array
  content_hash  TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  synced        INTEGER NOT NULL DEFAULT 0     -- 0 = pending sync, 1 = synced
);

CREATE INDEX idx_notecards_user ON notecards (user_id, updated_at DESC);
CREATE INDEX idx_notecards_doc ON notecards (document_id);
CREATE INDEX idx_notecards_hash ON notecards (content_hash, user_id);
```

```sql
-- Supabase Postgres mirror table
CREATE TABLE public.notecards (
  id            text PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id   text NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  document_name text NOT NULL,
  type          text NOT NULL DEFAULT 'search',
  title         text NOT NULL,
  query         text NOT NULL DEFAULT '',
  match_count   integer NOT NULL DEFAULT 0,
  snippets      jsonb NOT NULL DEFAULT '[]',
  tags          jsonb NOT NULL DEFAULT '[]',
  content_hash  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notecards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own cards" ON public.notecards
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

### Deduplication with Bun.hash

Before saving a note-card, hash its meaningful content to prevent duplicates:

```typescript
const contentToHash = JSON.stringify({
  documentId: card.documentId,
  query: card.query,
  type: card.type,
});
const hash = Bun.hash(contentToHash); // wyhash — nanosecond-scale

const existing = db.prepare(
  "SELECT id FROM notecards WHERE content_hash = $hash AND user_id = $userId"
).get({ $hash: hash.toString(), $userId: card.userId });

if (existing) {
  // Update existing card instead of creating a duplicate
}
```

### Note-Card Compilation

Users can select multiple note-cards and compile them into a single view:

- **"Compile" button** opens a panel showing selected cards stacked together
- Cards are ordered by document, then by position in document
- Compiled view can be exported as a markdown file (via `Bun.write`)
- Think of it like assembling research notes from highlights across sources

**UX flow:**
1. User browses their note-cards (list view, filterable by document/tag/type)
2. Checks boxes on cards they want to compile
3. Clicks "Compile" — cards render in a stacked layout with document headers
4. User can reorder, add section headers, write connecting notes between cards
5. "Export" saves as `.md` file — or "Save as Collection" persists the compilation

### Note-Card UX Ideas

- **Card grid view** — note-cards displayed as a grid of small cards, color-coded by type (search = blue, frequency = green, manual = gray)
- **Tag filtering** — sidebar with tag chips, click to filter
- **Document grouping** — group cards by source document
- **Quick preview** — hover a card to see full snippets
- **Drag to reorder** — within a compilation
- **Search note-cards** — FTS5 search across all your note-cards via bun:sqlite

---

## Full Architecture

```
[Browser — React SPA]
│
├── In-document search (client-side)
│   ├── useDocumentSearch hook
│   ├── CSS Custom Highlight API
│   └── SearchBar component
│
├── Word frequency sidebar (client renders, data from Bun API)
│   ├── useWordFrequency hook → GET /api/word-frequency/:docId
│   └── FrequencySidebar component
│
├── Note-cards (client renders, data from Bun API)
│   ├── useNotecards hook → CRUD /api/notecards
│   └── NoteCardGrid / NoteCardCompiler components
│
└── fetch() ──→
                │
[Bun.serve — Thin API Layer]
│
├── GET  /api/word-frequency/:docId    → reads cached data from SQLite (<0.1 ms)
├── GET  /api/search?q=...             → FTS5 cross-document search (<1 ms)
├── GET  /api/notecards                → list user's note-cards
├── POST /api/notecards                → create note-card (SQLite + async Supabase sync)
├── PUT  /api/notecards/:id            → update note-card
├── DELETE /api/notecards/:id          → delete note-card
├── POST /api/notecards/compile        → generate compiled markdown export
│
├── [Bun Worker — Background Indexer]
│   ├── Receives document content (1.3 us for 3 MB string)
│   ├── Tokenizes + word/phrase frequency (20–40 ms)
│   ├── Updates FTS5 index (50–150 ms)
│   └── Caches everything in SQLite
│
├── [bun:sqlite — WAL mode]
│   ├── word_freq table (cached frequency data per document)
│   ├── document_fts (FTS5 virtual table — cross-document search, BM25 ranking)
│   └── notecards table (fast local CRUD, dedup via Bun.hash)
│
└── Async sync ──→ Supabase Postgres (source of truth for documents, auth, note-cards)
```

---

## Implementation Plan

### Phase 1: In-Document Search (client-side only, no Bun server needed)

**New files:**
```
src/hooks/useDocumentSearch.ts    — search logic + CSS Highlight API
src/components/SearchBar.tsx      — input + match count + prev/next
src/components/SearchBar.css      — search bar styling
```

**Modified files:**
```
src/pages/ViewerPage.tsx          — add SearchBar + containerRef
src/pages/ViewerPage.css          — add ::highlight() rules
```

**Hook API:**
```typescript
interface SearchResult {
  matchCount: number;
  currentIndex: number;
  next: () => void;
  prev: () => void;
}

function useDocumentSearch(
  containerRef: RefObject<HTMLElement | null>,
  query: string,
  options?: { caseSensitive?: boolean; regex?: boolean; wholeWord?: boolean }
): SearchResult;
```

### Phase 2: Bun Server + Word Frequency

**New files:**
```
server/index.ts                   — Bun.serve entry point
server/db.ts                      — bun:sqlite setup (WAL mode, tables, FTS5)
server/workers/indexer.ts          — background document indexing
server/routes/frequency.ts         — GET /api/word-frequency/:docId
server/routes/search.ts            — GET /api/search?q=...
```

**New client files:**
```
src/hooks/useWordFrequency.ts      — fetches cached frequency data from Bun API
src/components/FrequencySidebar.tsx — top words list, bar chart, click-to-highlight
src/components/FrequencySidebar.css
```

**Modified files:**
```
src/pages/ViewerPage.tsx           — add frequency sidebar toggle
src/pages/ViewerPage.css           — sidebar layout
vite.config.ts                     — add proxy to Bun server for dev
```

### Phase 3: Note-Cards

**New server files:**
```
server/routes/notecards.ts         — CRUD endpoints + compile export
server/sync.ts                     — async SQLite → Supabase sync
```

**New client files:**
```
src/hooks/useNotecards.ts          — TanStack Query hooks for note-card CRUD
src/components/NoteCard.tsx         — single card component
src/components/NoteCard.css
src/components/NoteCardGrid.tsx     — grid/list view with filtering
src/components/NoteCardCompiler.tsx — compilation builder + export
src/pages/NotecardsPage.tsx         — dedicated page (new route: /notecards)
src/pages/NotecardsPage.css
```

**Modified files:**
```
src/router.tsx                      — add /notecards route
src/pages/ViewerPage.tsx            — add "Save as Note-Card" buttons
```

**New Supabase migration:**
```sql
CREATE TABLE public.notecards ( ... );
-- RLS policies
```

---

## Bun Server Setup

### Entry Point

```typescript
// server/index.ts
import { Database } from "bun:sqlite";
import { initDb } from "./db.ts";
import { handleFrequency } from "./routes/frequency.ts";
import { handleSearch } from "./routes/search.ts";
import { handleNotecards } from "./routes/notecards.ts";

const db = initDb();
const indexWorker = new Worker("./workers/indexer.ts");

Bun.serve({
  port: 3001,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname.startsWith("/api/word-frequency")) return handleFrequency(req, db);
    if (url.pathname.startsWith("/api/search")) return handleSearch(req, db);
    if (url.pathname.startsWith("/api/notecards")) return handleNotecards(req, db);

    return new Response("Not found", { status: 404 });
  },
});

console.log("Bun API server running on :3001");
```

### Vite Dev Proxy

```typescript
// vite.config.ts addition
server: {
  proxy: {
    "/api": {
      target: "http://localhost:3001",
      changeOrigin: true,
    },
  },
},
```

### Running Both in Dev

```json
// package.json scripts
{
  "dev": "bun run dev:vite & bun run dev:api",
  "dev:vite": "vite",
  "dev:api": "bun --watch server/index.ts"
}
```

---

## What We're NOT Using from Bun

| Capability | Why Not |
|-----------|---------|
| `Bun.build()` (bundler) | CSS module support gaps. Vite is mature and working. Keep it |
| `Bun.password` | Supabase handles auth. Not needed |
| `Bun.Transpiler` | Internal API, no application here |
| `Bun.semver` / `Bun.glob` | Not relevant to these features |

---

## Open Questions

1. **FTS5 availability** — Need to verify `bun:sqlite` ships with FTS5 compiled in. Quick test:
   ```typescript
   const db = new Database(":memory:");
   db.run("CREATE VIRTUAL TABLE test USING fts5(content)"); // throws if not available
   ```

2. **Supabase realtime vs webhook** — How does the Bun server learn about new document uploads? Options: Supabase Realtime subscription from the Bun process, or a POST from the SPA after upload succeeds.

3. **Auth forwarding** — The Bun API needs to verify the user. Options: forward the Supabase JWT in request headers and verify it server-side, or use Supabase's `getUser()` with the token.

4. **Deployment topology** — Does the Bun server run on the same host as the static SPA, or separately? Same host simplifies the proxy. Separate hosts need CORS.

5. **Note-card sync conflicts** — Last-write-wins is simple but lossy. Do we need conflict resolution, or is it acceptable for a single-user-per-device app?

6. **Stop word list** — Should we ship a default stop word list for word frequency, or let users configure their own? Different languages need different lists.
