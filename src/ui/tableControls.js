/**
 * tableControls.js — reusable, table-agnostic search + pagination wiring.
 * Operates on a plain array of items and callback functions, independent of
 * mkTbl's HTML-string rendering, so any table can adopt either piece.
 */

/** Wire a text-search input: filters `items` by `matchFn(item, query)` and
    calls `onFilter(filteredItems)` whenever the query changes (and once
    immediately with the input's current value). Comma-separated terms
    (e.g. "Arsenic, Loc-A") narrow the results further — an item must match
    every term, not just one — since each term is typically a different
    field (parameter, location, station, ...) being combined into one
    filter rather than alternatives to pick between. */
export function wireSearch(searchInputEl, items, matchFn, onFilter) {
  const run = () => {
    const terms = (searchInputEl?.value || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    onFilter(terms.length ? items.filter(item => terms.every(q => matchFn(item, q))) : items);
  };
  if (searchInputEl) searchInputEl.oninput = run;
  run();
}

/** Wire simple page-forward/back controls over `items`: calls
    onPage(pageItems, {page, totalPages, totalCount}) whenever the page
    changes (and once immediately). Always starts at page 0 — callers
    re-invoke this on every re-render (new filter/search results), so a
    stale page number from a previous, larger result set can't leave the
    view showing an out-of-range empty page. */
export function wirePagination(paginationEl, items, pageSize, onPage) {
  let page = 0;
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const render = () => {
    const start = page * pageSize;
    onPage(items.slice(start, start + pageSize), { page, totalPages, totalCount: items.length });
    if (!paginationEl) return;
    if (items.length <= pageSize) { paginationEl.innerHTML = ''; return; }
    paginationEl.innerHTML = `
      <button data-pg="prev" ${page === 0 ? 'disabled' : ''}>‹</button>
      <span>${page + 1} / ${totalPages} (${items.length})</span>
      <button data-pg="next" ${page >= totalPages - 1 ? 'disabled' : ''}>›</button>`;
    paginationEl.querySelector('[data-pg="prev"]')?.addEventListener('click', () => { page--; render(); });
    paginationEl.querySelector('[data-pg="next"]')?.addEventListener('click', () => { page++; render(); });
  };
  render();
}
