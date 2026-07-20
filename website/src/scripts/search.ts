type SearchEntry = {
  title: string;
  description: string;
  headings: string[];
  href: string;
};

const dialog = document.querySelector<HTMLDialogElement>("#search-dialog");
const input = document.querySelector<HTMLInputElement>("#doc-search");
const results = document.querySelector<HTMLUListElement>("#search-results");
let entries: SearchEntry[] | null = null;

async function loadEntries(): Promise<SearchEntry[]> {
  if (entries) return entries;
  const response = await fetch("/search-index.json");
  if (!response.ok) throw new Error("Search index unavailable");
  entries = await response.json() as SearchEntry[];
  return entries;
}

function renderResults(matches: SearchEntry[], query: string): void {
  if (!results) return;
  results.replaceChildren();
  if (!query.trim()) {
    const hint = document.createElement("li");
    hint.className = "search-results__hint";
    hint.textContent = "Type to search the local documentation index.";
    results.append(hint);
    return;
  }
  if (matches.length === 0) {
    const empty = document.createElement("li");
    empty.className = "search-results__hint";
    empty.textContent = "No matching documentation page.";
    results.append(empty);
    return;
  }
  for (const entry of matches.slice(0, 8)) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    const title = document.createElement("strong");
    const description = document.createElement("span");
    title.textContent = entry.title;
    description.textContent = entry.description;
    link.href = entry.href;
    link.append(title, description);
    item.append(link);
    results.append(item);
  }
}

async function openSearch(): Promise<void> {
  if (!dialog || !input) return;
  if (!dialog.open) dialog.showModal();
  input.value = "";
  try {
    renderResults(await loadEntries(), "");
  } catch {
    renderResults([], "search");
  }
  input.focus();
}

function closeSearch(): void {
  if (dialog?.open) dialog.close();
}

document.querySelectorAll<HTMLElement>("[data-search-open]").forEach((button) => button.addEventListener("click", () => void openSearch()));
document.querySelectorAll<HTMLElement>("[data-search-close]").forEach((button) => button.addEventListener("click", closeSearch));
dialog?.addEventListener("click", (event) => {
  if (event.target === dialog) closeSearch();
});
input?.addEventListener("input", async () => {
  const query = input.value.trim().toLowerCase();
  const index = await loadEntries();
  const matches = index.filter((entry) => `${entry.title} ${entry.description} ${entry.headings.join(" ")}`.toLowerCase().includes(query));
  renderResults(matches, query);
});
window.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    void openSearch();
  }
  if (event.key === "Escape" && dialog?.open) closeSearch();
});
