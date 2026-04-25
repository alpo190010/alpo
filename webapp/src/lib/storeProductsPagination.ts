/**
 * Paginated product browse — client for GET /store/{domain}/products?page=N.
 *
 * Page 1 mirrors the data /store/{domain} already returns (free for any
 * authenticated user). Pages 2+ require ``canPaginate`` from the canonical
 * envelope (paid plans only). Free-tier callers hitting page > 1 receive
 * a typed ``PaginationLockedError`` so the caller can branch to an
 * upgrade CTA instead of a generic toast.
 */

import { authFetch } from "@/lib/auth-fetch";
import { API_URL } from "@/lib/api";

export interface PaginatedProduct {
  id: string;
  url: string;
  slug: string;
  image: string | null;
}

export interface StoreProductsPageResponse {
  products: PaginatedProduct[];
  productCount: number | null;
  currentPage: number;
  totalPages: number | null;
  canPaginate: boolean;
}

/** Free-tier user attempted a paginated request beyond page 1. */
export class PaginationLockedError extends Error {
  readonly errorCode = "pagination_locked" as const;
  readonly planTier: string;
  constructor(planTier: string) {
    super("Pagination requires a paid plan");
    this.name = "PaginationLockedError";
    this.planTier = planTier;
  }
}

/** Server returned 404 page_out_of_range — page beyond available products. */
export class PageOutOfRangeError extends Error {
  readonly errorCode = "page_out_of_range" as const;
  constructor() {
    super("Page not found");
    this.name = "PageOutOfRangeError";
  }
}

export async function fetchStoreProductsPage(
  domain: string,
  page: number,
): Promise<StoreProductsPageResponse> {
  const res = await authFetch(
    `${API_URL}/store/${encodeURIComponent(domain)}/products?page=${page}`,
  );

  if (res.status === 403) {
    let planTier = "free";
    try {
      const body = (await res.json()) as { errorCode?: string; planTier?: string };
      if (body.errorCode === "pagination_locked") {
        throw new PaginationLockedError(body.planTier ?? "free");
      }
      planTier = body.planTier ?? planTier;
    } catch (e) {
      if (e instanceof PaginationLockedError) throw e;
    }
    // Unexpected 403 shape — fall through to generic error
    throw new Error(`Forbidden (planTier=${planTier})`);
  }

  if (res.status === 404) {
    let body: { errorCode?: string } = {};
    try {
      body = (await res.json()) as { errorCode?: string };
    } catch {
      // ignore
    }
    if (body.errorCode === "page_out_of_range") {
      throw new PageOutOfRangeError();
    }
    throw new Error("Store not found");
  }

  if (!res.ok) {
    throw new Error(`Failed to load page (status ${res.status})`);
  }

  return (await res.json()) as StoreProductsPageResponse;
}
