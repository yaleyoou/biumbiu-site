type SearchRecord = {
  title: string;
  description: string;
  url: string;
  type: "笔记" | "项目";
  date: string;
  tags: string[];
  content: string;
};

type IndexedSearchRecord = SearchRecord & {
  normalizedTitle: string;
  normalizedDescription: string;
  normalizedTags: string;
  normalizedContent: string;
};

let searchIndexPromise: Promise<IndexedSearchRecord[]> | null = null;
let searchInstance = 0;

const normalizeText = (value: string) => value
  .normalize("NFKC")
  .toLocaleLowerCase("zh-CN");

const isSearchRecord = (value: unknown): value is SearchRecord => {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<SearchRecord>;
  return typeof record.title === "string"
    && typeof record.description === "string"
    && typeof record.url === "string"
    && (record.type === "笔记" || record.type === "项目")
    && typeof record.date === "string"
    && Array.isArray(record.tags)
    && record.tags.every((tag) => typeof tag === "string")
    && typeof record.content === "string";
};

const loadSearchIndex = () => {
  if (searchIndexPromise) return searchIndexPromise;

  searchIndexPromise = fetch("/search-index.json", {
    headers: { Accept: "application/json" }
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Search index request failed with ${response.status}`);
      const data: unknown = await response.json();
      if (!Array.isArray(data)) throw new Error("Search index has an invalid shape");

      return data.filter(isSearchRecord).map((record) => ({
        ...record,
        normalizedTitle: normalizeText(record.title),
        normalizedDescription: normalizeText(record.description),
        normalizedTags: normalizeText(record.tags.join(" ")),
        normalizedContent: normalizeText(record.content)
      }));
    })
    .catch((error) => {
      searchIndexPromise = null;
      throw error;
    });

  return searchIndexPromise;
};

const splitTerms = (query: string) => [...new Set(
  normalizeText(query).split(/\s+/).filter(Boolean)
)];

const rankRecords = (records: IndexedSearchRecord[], query: string) => {
  const normalizedQuery = normalizeText(query.trim());
  const terms = splitTerms(query);
  if (!terms.length) return records.slice(0, 6);

  return records
    .map((record) => {
      let score = 0;

      for (const term of terms) {
        const inTitle = record.normalizedTitle.includes(term);
        const inTags = record.normalizedTags.includes(term);
        const inDescription = record.normalizedDescription.includes(term);
        const inContent = record.normalizedContent.includes(term);
        if (!inTitle && !inTags && !inDescription && !inContent) return null;

        if (record.normalizedTitle === term) score += 120;
        else if (record.normalizedTitle.startsWith(term)) score += 72;
        else if (inTitle) score += 52;
        if (inTags) score += 34;
        if (inDescription) score += 20;
        if (inContent) score += 5;
      }

      if (record.normalizedTitle.includes(normalizedQuery)) score += 48;
      if (record.normalizedDescription.includes(normalizedQuery)) score += 16;

      return { record, score };
    })
    .filter((result): result is { record: IndexedSearchRecord; score: number } => result !== null)
    .sort((a, b) => b.score - a.score || b.record.date.localeCompare(a.record.date))
    .slice(0, 10)
    .map(({ record }) => record);
};

const findExcerpt = (record: IndexedSearchRecord, terms: string[]) => {
  if (!terms.length) return record.description;
  const sources = [record.description, record.content];

  for (const source of sources) {
    const normalizedSource = normalizeText(source);
    const matchIndex = terms
      .map((term) => normalizedSource.indexOf(term))
      .filter((index) => index >= 0)
      .sort((a, b) => a - b)[0];
    if (matchIndex === undefined) continue;

    const start = Math.max(0, matchIndex - 42);
    const end = Math.min(source.length, matchIndex + 132);
    return `${start > 0 ? "..." : ""}${source.slice(start, end).trim()}${end < source.length ? "..." : ""}`;
  }

  return record.description;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const appendHighlightedText = (element: HTMLElement, value: string, terms: string[]) => {
  const visibleTerms = [...terms]
    .filter((term) => term.length > 1 || /[\u3400-\u9fff]/u.test(term))
    .sort((a, b) => b.length - a.length);
  if (!visibleTerms.length) {
    element.textContent = value;
    return;
  }

  const expression = new RegExp(`(${visibleTerms.map(escapeRegExp).join("|")})`, "giu");
  value.split(expression).filter(Boolean).forEach((part) => {
    if (visibleTerms.includes(normalizeText(part))) {
      const mark = document.createElement("mark");
      mark.textContent = part;
      element.appendChild(mark);
    } else {
      element.appendChild(document.createTextNode(part));
    }
  });
};

const createResult = (
  record: IndexedSearchRecord,
  terms: string[],
  resultId: string,
  onActivate: (link: HTMLAnchorElement) => void
) => {
  const item = document.createElement("li");
  item.className = "site-search-result";

  const link = document.createElement("a");
  link.className = "site-search-result-link";
  link.href = record.url;
  link.id = resultId;

  const meta = document.createElement("div");
  meta.className = "site-search-result-meta";
  const type = document.createElement("span");
  type.textContent = record.type;
  const date = document.createElement("time");
  date.dateTime = record.date;
  date.textContent = record.date.replaceAll("-", ".");
  meta.appendChild(type);
  meta.appendChild(date);

  const copy = document.createElement("div");
  copy.className = "site-search-result-copy";
  const title = document.createElement("h3");
  appendHighlightedText(title, record.title, terms);
  const excerpt = document.createElement("p");
  appendHighlightedText(excerpt, findExcerpt(record, terms), terms);
  copy.appendChild(title);
  copy.appendChild(excerpt);

  if (record.tags.length) {
    const tags = document.createElement("div");
    tags.className = "site-search-result-tags";
    record.tags.slice(0, 3).forEach((tag) => {
      const label = document.createElement("span");
      label.textContent = tag;
      tags.appendChild(label);
    });
    copy.appendChild(tags);
  }

  const arrow = document.createElement("span");
  arrow.className = "site-search-result-arrow";
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "↗";

  link.appendChild(meta);
  link.appendChild(copy);
  link.appendChild(arrow);
  link.addEventListener("pointerenter", () => onActivate(link));
  link.addEventListener("focus", () => onActivate(link));
  item.appendChild(link);
  return item;
};

export function mountSiteSearch(root: HTMLElement) {
  if (root.dataset.searchMounted === "true") return;

  const input = root.querySelector<HTMLInputElement>("[data-search-input]");
  const clearButton = root.querySelector<HTMLButtonElement>("[data-search-clear]");
  const summary = root.querySelector<HTMLElement>("[data-search-summary]");
  const results = root.querySelector<HTMLOListElement>("[data-search-results]");
  const empty = root.querySelector<HTMLElement>("[data-search-empty]");
  if (!input || !clearButton || !summary || !results || !empty) return;

  root.dataset.searchMounted = "true";
  const instanceId = `site-search-${searchInstance += 1}`;
  const isSearchPage = root.dataset.searchMode === "page";
  let records: IndexedSearchRecord[] | null = null;
  let resultLinks: HTMLAnchorElement[] = [];
  let activeIndex = -1;
  let renderFrame = 0;

  input.setAttribute("aria-controls", `${instanceId}-results`);
  results.id = `${instanceId}-results`;

  const setActiveResult = (index: number, scroll = false) => {
    resultLinks.forEach((link) => delete link.dataset.active);
    if (!resultLinks.length) {
      activeIndex = -1;
      return;
    }

    activeIndex = (index + resultLinks.length) % resultLinks.length;
    const activeLink = resultLinks[activeIndex];
    activeLink.dataset.active = "true";
    if (scroll) activeLink.scrollIntoView({ block: "nearest" });
  };

  const renderResults = () => {
    if (!records) return;
    const query = input.value.trim();
    const terms = splitTerms(query);
    const matches = rankRecords(records, query);

    results.replaceChildren();
    empty.hidden = matches.length > 0;
    clearButton.hidden = query.length === 0;
    summary.textContent = query ? `${matches.length} 条结果` : "最近更新";
    empty.textContent = query ? `没有找到“${query}”` : "暂无可搜索内容";

    matches.forEach((record, index) => {
      const item = createResult(record, terms, `${instanceId}-result-${index}`, (link) => {
        const nextIndex = resultLinks.indexOf(link);
        if (nextIndex >= 0) setActiveResult(nextIndex);
      });
      results.appendChild(item);
    });

    resultLinks = [...results.querySelectorAll<HTMLAnchorElement>(".site-search-result-link")];
    setActiveResult(resultLinks.length ? 0 : -1);

    if (isSearchPage) {
      const url = new URL(window.location.href);
      if (query) url.searchParams.set("q", query);
      else url.searchParams.delete("q");
      window.history.replaceState({}, "", url);
    }
  };

  const requestResultsRender = () => {
    if (renderFrame) window.cancelAnimationFrame(renderFrame);
    renderFrame = window.requestAnimationFrame(() => {
      renderFrame = 0;
      renderResults();
    });
  };

  const activate = async (focusInput = true) => {
    if (focusInput) input.focus({ preventScroll: true });
    if (records) {
      renderResults();
      return;
    }

    summary.textContent = "正在载入索引";
    empty.hidden = true;
    try {
      records = await loadSearchIndex();
      renderResults();
    } catch (error) {
      summary.textContent = "搜索暂时不可用";
      empty.textContent = "索引加载失败，请稍后重试";
      empty.hidden = false;
      console.error("Unable to load the site search index.", error);
    }
  };

  input.addEventListener("input", requestResultsRender);
  input.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveResult(activeIndex + 1, true);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveResult(activeIndex - 1, true);
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      resultLinks[activeIndex]?.click();
    }
  });

  clearButton.addEventListener("click", () => {
    input.value = "";
    input.focus();
    renderResults();
  });

  root.addEventListener("site-search:activate", () => void activate());

  if (isSearchPage) {
    input.value = new URLSearchParams(window.location.search).get("q")?.trim() ?? "";
    void activate(false);
  }
}
