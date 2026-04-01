import { useState, useMemo, useCallback } from "react"
import "./ProblemList.css"

/**
 * ProblemList — sidebar component for browsing, searching, and filtering
 * coding problems.
 *
 * @param {Object}   props
 * @param {Array}    props.problems   – array of { id, title, difficulty, tags }
 * @param {*}        props.selectedId – id of the currently-selected problem
 * @param {Function} props.onSelect   – called with the full problem object
 */
export default function ProblemList({ problems = [], selectedId, onSelect }) {
  const [search, setSearch] = useState("")
  const [difficulty, setDifficulty] = useState("All") // "All"|"Easy"|"Medium"|"Hard"
  const [activeTag, setActiveTag] = useState(null)

  /* ── Extract every unique tag from the dataset ────────── */
  const allTags = useMemo(() => {
    const set = new Set()
    problems.forEach((p) => p.tags?.forEach((t) => set.add(t)))
    return [...set].sort()
  }, [problems])

  /* ── Combined filter: search → difficulty → tag ────────── */
  const filtered = useMemo(() => {
    let list = problems

    // 1. Search (title + tags, case-insensitive)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          (p.tags && p.tags.some((t) => t.toLowerCase().includes(q)))
      )
    }

    // 2. Difficulty
    if (difficulty !== "All") {
      list = list.filter(
        (p) => (p.difficulty || "").toLowerCase() === difficulty.toLowerCase()
      )
    }

    // 3. Tag
    if (activeTag) {
      list = list.filter(
        (p) => p.tags && p.tags.some((t) => t === activeTag)
      )
    }

    return list
  }, [problems, search, difficulty, activeTag])

  /* ── Helpers ──────────────────────────────────────────── */
  const difficultyClass = (diff) => {
    switch ((diff || "").toLowerCase()) {
      case "easy":   return "easy"
      case "medium": return "medium"
      case "hard":   return "hard"
      default:       return ""
    }
  }

  const clearAllFilters = useCallback(() => {
    setSearch("")
    setDifficulty("All")
    setActiveTag(null)
  }, [])

  const hasActiveFilters = search.trim() || difficulty !== "All" || activeTag

  const DIFFICULTIES = ["All", "Easy", "Medium", "Hard"]

  return (
    <aside className="problem-list-sidebar" id="problem-list">
      {/* ── Header ────────────────────────────────────────── */}
      <div className="problem-list-header">
        <h2>Problems</h2>
        <div className="problem-list-count">
          {filtered.length} of {problems.length} problem
          {problems.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* ── Search ────────────────────────────────────────── */}
      <div className="problem-list-search">
        <div className="search-input-wrap">
          <span className="search-icon" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <input
            id="problem-search"
            type="text"
            placeholder="Search problems..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search problems"
          />
          {search && (
            <button
              type="button"
              className="search-clear"
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* ── Difficulty filter buttons ─────────────────────── */}
      <div className="filter-section">
        <div className="filter-row" role="radiogroup" aria-label="Filter by difficulty">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              type="button"
              className={`filter-btn difficulty-filter${
                d === "All" ? "" : ` ${d.toLowerCase()}`
              }${difficulty === d ? " active" : ""}`}
              onClick={() => setDifficulty(d)}
              role="radio"
              aria-checked={difficulty === d}
            >
              {d}
            </button>
          ))}
        </div>

        {/* ── Tag chips ──────────────────────────────────── */}
        {allTags.length > 0 && (
          <div className="tag-filter-wrap">
            <div className="tag-filter-chips" role="radiogroup" aria-label="Filter by tag">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`tag-chip${activeTag === tag ? " active" : ""}`}
                  onClick={() =>
                    setActiveTag((prev) => (prev === tag ? null : tag))
                  }
                  role="radio"
                  aria-checked={activeTag === tag}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Clear all filters */}
        {hasActiveFilters && (
          <button
            type="button"
            className="clear-filters-btn"
            onClick={clearAllFilters}
          >
            ✕ Clear filters
          </button>
        )}
      </div>

      {/* ── Problem list ──────────────────────────────────── */}
      <div className="problem-list-items" role="listbox" aria-label="Problem list">
        {filtered.length === 0 ? (
          <div className="problem-list-empty">
            <div className="problem-list-empty-icon">🔍</div>
            <span>No problems found</span>
            <button
              type="button"
              className="empty-reset-btn"
              onClick={clearAllFilters}
            >
              Reset filters
            </button>
          </div>
        ) : (
          filtered.map((problem) => {
            const isSelected = selectedId === problem.id
            return (
              <div
                key={problem.id}
                id={`problem-${problem.id}`}
                className={`problem-card${isSelected ? " selected" : ""}`}
                role="option"
                aria-selected={isSelected}
                tabIndex={0}
                onClick={() => onSelect?.(problem)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    onSelect?.(problem)
                  }
                }}
              >
                {/* Card header: ID + difficulty */}
                <div className="problem-card-header">
                  <span className="problem-card-id">#{problem.id}</span>
                  <span
                    className={`difficulty-badge ${difficultyClass(
                      problem.difficulty
                    )}`}
                  >
                    {problem.difficulty}
                  </span>
                </div>

                {/* Title */}
                <div className="problem-card-title">{problem.title}</div>

                {/* Tags */}
                {problem.tags && problem.tags.length > 0 && (
                  <div className="problem-card-tags">
                    {problem.tags.map((tag) => (
                      <span
                        key={tag}
                        className={`problem-tag${activeTag === tag ? " highlighted" : ""}`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}
