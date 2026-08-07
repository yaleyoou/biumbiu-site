CREATE TABLE IF NOT EXISTS page_views (
  path TEXT PRIMARY KEY CHECK(length(path) BETWEEN 1 AND 512),
  view_count INTEGER NOT NULL DEFAULT 0 CHECK(view_count >= 0),
  updated_at INTEGER NOT NULL
);
