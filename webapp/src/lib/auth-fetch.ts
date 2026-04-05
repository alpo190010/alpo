/**
 * Auth-aware fetch helpers.
 *
 * `authFetch` — drop-in fetch replacement that adds `Authorization: Bearer <jwt>`
 * when the user has an active session. Falls through to plain fetch otherwise.
 * Includes a 30 s default timeout and automatic token-cache invalidation on 401.
 *
 * `getAuthToken` — resolves to the raw JWT string or null.
 */

// Short-lived cache so multiple authFetch() calls within the same page load
// share one token request instead of each hitting /api/auth/token independently.
let tokenCache: { token: string | null; expiresAt: number } | null = null;
const TOKEN_TTL_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 30_000;

/** Bust the token cache (e.g. after logout or session change). */
export function invalidateTokenCache() {
  tokenCache = null;
}

export async function getAuthToken(): Promise<string | null> {
  // Impersonation token takes priority (client-side only)
  if (typeof window !== "undefined") {
    try {
      const impersonationToken = localStorage.getItem("impersonation_token");
      if (impersonationToken) return impersonationToken;
    } catch {
      // localStorage unavailable (private browsing / storage disabled) — skip
    }
  }

  // Return cached token if still fresh
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  // Fall back to Auth.js session cookie
  try {
    const res = await fetch("/api/auth/token");
    if (!res.ok) {
      tokenCache = { token: null, expiresAt: Date.now() + TOKEN_TTL_MS };
      return null;
    }
    const data = await res.json();
    const token = data.token ?? null;
    tokenCache = { token, expiresAt: Date.now() + TOKEN_TTL_MS };
    return token;
  } catch {
    return null;
  }
}

export async function authFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const token = await getAuthToken();

  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // Merge caller's abort signal with a default 30 s timeout
  const timeout = AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
  const signal = init?.signal
    ? AbortSignal.any([init.signal, timeout])
    : timeout;

  const res = await fetch(input, { ...init, headers, signal });

  // Bust token cache on 401 so the next call fetches a fresh token
  if (res.status === 401) invalidateTokenCache();

  return res;
}
