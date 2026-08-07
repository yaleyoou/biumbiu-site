/// <reference types="@cloudflare/workers-types" />

interface Env {
  DB: D1Database;
}

interface CountRow {
  view_count: number;
}

const TOTAL_PATH = "__total__";
const MAX_PATH_LENGTH = 512;
const responseHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8"
};

const incrementSql = `
  INSERT INTO page_views(path, view_count, updated_at)
  VALUES (?, 1, ?)
  ON CONFLICT(path) DO UPDATE SET
    view_count = view_count + 1,
    updated_at = excluded.updated_at
  RETURNING view_count
`;

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: responseHeaders });
}

function normalizePath(value: unknown, requestUrl: string): string | null {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.length > MAX_PATH_LENGTH
  ) {
    return null;
  }

  const pathname = new URL(value, requestUrl).pathname;
  return pathname.replace(/\/+$/, "") || "/";
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("Origin");

  if (origin && origin !== requestOrigin) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  try {
    const body: unknown = await request.json();
    const path = normalizePath(
      typeof body === "object" && body !== null && "path" in body
        ? body.path
        : null,
      request.url
    );

    if (!path) {
      return jsonResponse({ error: "Invalid path" }, 400);
    }

    const now = Date.now();
    const [pageResult, totalResult] = await env.DB.batch<CountRow>([
      env.DB.prepare(incrementSql).bind(path, now),
      env.DB.prepare(incrementSql).bind(TOTAL_PATH, now)
    ]);

    return jsonResponse({
      page: pageResult.results[0]?.view_count ?? 0,
      total: totalResult.results[0]?.view_count ?? 0
    });
  } catch {
    return jsonResponse({ error: "Unable to update views" }, 500);
  }
};
