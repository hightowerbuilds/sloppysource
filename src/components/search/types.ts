import type { SearchTag } from "../../lib/searchModels.ts";

export {
  EMPTY_RESULT,
  MAX_MATCH_LINES,
  createDefaultSearchOptions,
  hasActiveSearchTags,
} from "../../lib/searchModels.ts";
export type {
  LineMatch,
  SearchOptions,
  SearchResult,
  SearchTag,
} from "../../lib/searchModels.ts";

export const SEARCH_TAG_OPTIONS: Array<{ value: SearchTag; label: string }> = [
  { value: "h1", label: "H1" },
  { value: "h2", label: "H2" },
  { value: "h3", label: "H3" },
  { value: "h4", label: "H4" },
  { value: "h5", label: "H5" },
  { value: "h6", label: "H6" },
  { value: "code", label: "CODE" },
  { value: "p", label: "<p>" },
];

export const MATCHES_PER_PAGE = 50;
