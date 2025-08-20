// /assets/js/search.js
// Requirements on /search.html:
// - an input with id="extended-search-field-small"
// - a container <p id="search-query"></p>
// - a container <div id="results"></div>
// - the page is loaded at /search.html?q=your+query

(function () {
  const input = document.getElementById("extended-search-field-small");
  const queryEl = document.getElementById("search-query");
  const resultsEl = document.getElementById("results");
  const params = new URLSearchParams(window.location.search);
  const rawQ = (params.get("q") || "").trim();

  // Put query back into the box
  if (input) input.value = rawQ;

  // Helper: escape HTML
  const escapeHTML = (s) =>
    (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Helper: escape regex special chars
  const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Highlight matched terms (case-insensitive)
  function emphasize(htmlString, terms) {
    let out = escapeHTML(htmlString);
    terms.forEach((t) => {
      if (!t) return;
      const re = new RegExp(`(${escapeRegExp(t)})`, "ig");
      out = out.replace(re, "<mark>$1</mark>");
    });
    return out;
  }

  // Build a short snippet around the earliest match
  function makeSnippet(text, terms, radius = 140) {
    const plain = text || "";
    const lower = plain.toLowerCase();
    let idx = -1;
    for (const t of terms) {
      const i = lower.indexOf(t);
      if (i !== -1 && (idx === -1 || i < idx)) idx = i;
    }
    if (idx === -1) return "";
    const start = Math.max(0, idx - radius);
    const end = Math.min(plain.length, idx + radius);
    let slice = (start > 0 ? "…" : "") + plain.slice(start, end) + (end < plain.length ? "…" : "");
    slice = slice.replace(/\s+/g, " ").trim();
    return emphasize(slice, terms);
  }

  async function run() {
    if (!queryEl || !resultsEl) return;

    if (!rawQ) {
      queryEl.textContent = "Type a term above and press Enter.";
      resultsEl.innerHTML = "";
      return;
    }

    const terms = rawQ.toLowerCase().split(/\s+/).filter(Boolean);
    queryEl.textContent = `Results for “${rawQ}”`;
    setAriaBusy(true);

    try {
      const res = await fetch("/search-index.json", { cache: "no-store" });
      if (!res.ok) throw new Error("Index not found");
      const pages = await res.json();

      // Score: title (5), description (2), content (1) per term
      const scored = pages
        .map((p) => {
          const title = (p.title || "").toLowerCase();
          const desc = (p.description || "").toLowerCase();
          const content = (p.content || "").toLowerCase();
          let score = 0;
          for (const t of terms) {
            if (title.includes(t)) score += 5;
            if (desc.includes(t)) score += 2;
            if (content.includes(t)) score += 1;
          }
          return { ...p, score };
        })
        .filter((p) => p.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 50);

      if (scored.length === 0) {
        resultsEl.innerHTML = `<p>No results. Try fewer or different terms.</p>`;
        return;
      }

      resultsEl.innerHTML = scored
        .map((p) => {
          const title = p.title ? emphasize(p.title, terms) : emphasize(p.url, terms);
          const snippet = makeSnippet(p.content || p.description || "", terms, 140);
          const descLine = p.description ? `<p class="margin-y-0">${emphasize(p.description, terms)}</p>` : "";
          return `
            <article class="margin-y-2">
              <h2 class="margin-bottom-05">
                <a href="${p.url}" class="usa-link">${title}</a>
              </h2>
              ${descLine}
              ${snippet ? `<p class="margin-top-05">${snippet}</p>` : ""}
              <p class="result-url">${escapeHTML(p.url)}</p>
            </article>
          `;
        })
        .join("");
    } catch (e) {
      resultsEl.innerHTML = `<p>Search is unavailable right now.</p>`;
      // Optionally log e for debugging
      // console.error(e);
    } finally {
      setAriaBusy(false);
    }
  }

  // Optional: improve a11y live region state
  function setAriaBusy(isBusy) {
    const section = document.querySelector("section[aria-live]");
    if (section) section.setAttribute("aria-busy", isBusy ? "true" : "false");
  }

  // Prevent empty submits (when this script is also included on other pages)
  const form = document.getElementById("search_form");
  if (form) {
    form.addEventListener("submit", (e) => {
      const val = (input?.value || "").trim();
      if (!val) e.preventDefault();
    });
  }

  // Run once on load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();