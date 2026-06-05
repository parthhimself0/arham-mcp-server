import type {
  Product,
  Category,
  GoldRate,
  UserOrder,
  PaginatedResponse,
} from "./types.js";

const BASE_URL = (process.env.API_BASE_URL ?? "").replace(/\/+$/, "");

// ── Stored token (set by agent service per session) ──────────
let _storedToken = process.env.API_SERVICE_TOKEN ?? "";

export function setApiToken(token: string) {
  _storedToken = token;
}

export function getApiToken(): string {
  return _storedToken;
}

async function apiGet<T>(
  path: string,
  token: string,
  params?: Record<string, string | number | boolean | undefined>
): Promise<T> {
  const url = new URL(path, BASE_URL);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `API error ${response.status}: ${body || response.statusText}`
    );
  }

  return (await response.json()) as T;
}

async function apiPost<T>(
  path: string,
  token: string,
  body: Record<string, unknown>
): Promise<T> {
  const url = new URL(path, BASE_URL);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `API error ${response.status}: ${text || response.statusText}`
    );
  }

  return (await response.json()) as T;
}

// =========================================================
// Products
// =========================================================

interface ProductApiResponse {
  success: boolean;
  data: {
    data: Product[];
    totalCount?: number;
    paginated?: boolean;
  };
}

export async function fetchProducts(
  token: string,
  params: {
    page?: number;
    limit?: number;
    categoryId?: string;
    showAll?: boolean;
  }
): Promise<PaginatedResponse<Product>> {
  const res = await apiGet<ProductApiResponse>(
    "/api/v1/products/get-all",
    token,
    {
      page: params.page ?? 1,
      limit: params.limit ?? 20,
      categoryId: params.categoryId,
      showAll: params.showAll,
    }
  );
  return {
    data: res.data?.data ?? [],
    meta: {
      total: res.data?.totalCount ?? 0,
      paginated: res.data?.paginated ?? false,
    },
  };
}

export async function searchProducts(
  token: string,
  params: {
    search: string;
    page?: number;
    limit?: number;
    showAll?: boolean;
  }
): Promise<PaginatedResponse<Product>> {
  const res = await apiGet<ProductApiResponse>(
    "/api/v1/products/search",
    token,
    {
      search: params.search,
      page: params.page ?? 1,
      limit: params.limit ?? 20,
      showAll: params.showAll,
    }
  );
  return {
    data: res.data?.data ?? [],
    meta: {
      total: res.data?.totalCount ?? 0,
      paginated: res.data?.paginated ?? false,
    },
  };
}

// =========================================================
// Categories
// =========================================================

interface CategoryApiResponse {
  code?: string;
  status?: number;
  success?: boolean;
  data: {
    paginated?: boolean;
    total?: number;
    results: Category[];
  };
}

export async function fetchCategories(
  token: string,
  tree: boolean = true
): Promise<Category[]> {
  const res = await apiGet<CategoryApiResponse>(
    "/api/v1/category/get-All",
    token,
    tree ? { tree: true } : undefined
  );
  return res.data?.results ?? [];
}

// =========================================================
// Gold Rate
// =========================================================

interface GoldRateApiResponse {
  success: boolean;
  data: GoldRate;
}

export async function fetchCurrentGoldRate(
  token: string
): Promise<GoldRate | null> {
  try {
    const res = await apiGet<GoldRateApiResponse>(
      "/api/v1/gold-rate/current",
      token
    );
    return res.data ?? null;
  } catch {
    return null;
  }
}

export async function fetchGoldRateHistory(
  token: string,
  page: number = 1,
  limit: number = 10
): Promise<GoldRate[]> {
  try {
    const res = await apiGet<{ success: boolean; data: GoldRate[] }>(
      "/api/v1/gold-rate/history",
      token,
      { page, limit }
    );
    return res.data ?? [];
  } catch {
    return [];
  }
}

// =========================================================
// Orders
// =========================================================

interface OrderApiResponse {
  success: boolean;
  data: {
    orders: UserOrder[];
    total?: number;
  };
}

export async function fetchUserOrders(
  token: string,
  params: { page?: number; limit?: number }
): Promise<PaginatedResponse<UserOrder>> {
  const res = await apiGet<OrderApiResponse>(
    "/api/v1/products/get-userAllOrders",
    token,
    {
      page: params.page ?? 1,
      limit: params.limit ?? 10,
    }
  );
  return {
    data: res.data?.orders ?? [],
    meta: {
      total: res.data?.total ?? 0,
      paginated: (res.data?.orders?.length ?? 0) >= (params.limit ?? 10),
    },
  };
}

export interface OrderItem {
  productId: string;
  quantity: number;
}

interface CreateOrderResponse {
  success: boolean;
  data?: {
    orderId?: string;
    message?: string;
  };
  message?: string;
}

export async function createOrder(
  token: string,
  items: OrderItem[]
): Promise<{ orderId: string; message: string }> {
  const res = await apiPost<CreateOrderResponse>(
    "/api/v1/products/create-order",
    token,
    { products: items }
  );
  return {
    orderId: res.data?.orderId ?? "",
    message: res.data?.message ?? res.message ?? "Order placed",
  };
}

// =========================================================
// Store Info
// =========================================================

interface AncillaryPage {
  title?: string;
  content?: string;
}

export async function fetchAncillaryPage(
  token: string,
  pageKey: string
): Promise<AncillaryPage | null> {
  try {
    const res = await apiGet<{ success: boolean; data: AncillaryPage }>(
      `/api/v1/ancillary/get-page/${pageKey}`,
      token
    );
    return res.data ?? null;
  } catch {
    return null;
  }
}
