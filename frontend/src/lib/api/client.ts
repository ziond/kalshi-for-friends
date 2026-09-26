import type { ApiErrorBody } from "@/types";
import { ApiError } from "./errors";
import { mockRequest } from "./mock/handlers";

export { ApiError };

// Requests go to /api/v1 on the Next.js origin; next.config.ts rewrites them
// to the Go backend, so the auth cookie is same-origin.
const BASE_PATH = "/api/v1";

// Until the Go API is up, serve responses from the in-memory mock (src/lib/api/mock).
// Set NEXT_PUBLIC_API_MOCK=false to hit the real backend.
const USE_MOCK = process.env.NEXT_PUBLIC_API_MOCK !== "false";

type Query = Record<string, string | number | boolean | undefined>;

interface RequestOptions {
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
}

function cleanQuery(query?: Query): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) out[key] = String(value);
  }
  return out;
}

async function request<T>(
  method: string,
  path: string,
  { body, query, signal }: RequestOptions = {},
): Promise<T> {
  const params = cleanQuery(query);
  if (USE_MOCK) return mockRequest<T>(method, path, params, body);

  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE_PATH}${path}${qs ? `?${qs}` : ""}`, {
    method,
    signal,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      res.status,
      data?.error.code ?? "VALIDATION_ERROR",
      data?.error.message ?? res.statusText,
      data?.error.fields,
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, "body">) => request<T>("GET", path, opts),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, { body }),
  delete: <T = void>(path: string) => request<T>("DELETE", path),
};
