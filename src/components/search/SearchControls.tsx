import type { RefObject } from "react";
import { SEARCH_TAG_OPTIONS, type SearchOptions, type SearchTag } from "./types.ts";
import "./SearchControls.css";

interface SearchControlsProps {
  inputRef: RefObject<HTMLInputElement | null>;
  query: string;
  options: SearchOptions;
  onQueryChange: (value: string) => void;
  onToggleCaseSensitive: () => void;
  onToggleWholeWord: () => void;
  onToggleRegex: () => void;
  onToggleTag: (tag: SearchTag) => void;
}

export function SearchControls({
  inputRef,
  query,
  options,
  onQueryChange,
  onToggleCaseSensitive,
  onToggleWholeWord,
  onToggleRegex,
  onToggleTag,
}: SearchControlsProps) {
  return (
    <div className="search-controls">
      <label className="search-input-label" htmlFor="doc-search-query">
        Search String
      </label>
      <input
        ref={inputRef}
        id="doc-search-query"
        className="search-input"
        type="text"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Search text or regex"
      />
      <div className="search-options">
        <button
          type="button"
          className={`search-toggle${options.caseSensitive ? " is-active" : ""}`}
          onClick={onToggleCaseSensitive}
        >
          Case sensitive
        </button>
        <button
          type="button"
          className={`search-toggle${options.wholeWord ? " is-active" : ""}`}
          onClick={onToggleWholeWord}
        >
          Whole word
        </button>
        <button
          type="button"
          className={`search-toggle${options.regex ? " is-active" : ""}`}
          onClick={onToggleRegex}
        >
          Regex
        </button>
        <span className="search-options-divider" />
        {SEARCH_TAG_OPTIONS.map((tagOption) => (
          <button
            key={tagOption.value}
            type="button"
            className={`search-toggle${options.tags[tagOption.value] ? " is-active" : ""}`}
            onClick={() => onToggleTag(tagOption.value)}
          >
            {tagOption.label}
          </button>
        ))}
      </div>
    </div>
  );
}
