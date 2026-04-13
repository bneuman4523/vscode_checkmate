import { QueryClient, QueryFunction } from "@tanstack/react-query";

let sessionExpiredRedirectPending = false;

export function resetSessionExpiredFlag() {
  sessionExpiredRedirectPending = false;
}

let _impersonatedCustomerId: string | null = null;

export function setImpersonatedCustomerId(customerId: string | null) {
  _impersonatedCustomerId = customerId;
}

export function getImpersonatedCustomerId(): string | null {
  return _impersonatedCustomerId;
}

function getImpersonationHeaders(): Record<string, string> {
  if (_impersonatedCustomerId) {
    return { "x-impersonate-customer": _impersonatedCustomerId };
  }
  return {};
}

const PUBLIC_PATH_PREFIXES = ["/login", "/staff/", "/kiosk", "/set-password", "/forgot-password", "/reset-password"];

function isPublicPage(): boolean {
  const path = window.location.pathname;
  return PUBLIC_PATH_PREFIXES.some(prefix => path.startsWith(prefix));
}

function handleSessionExpired() {
  if (sessionExpiredRedirectPending || isPublicPage()) {
    return;
  }
  sessionExpiredRedirectPending = true;
  console.warn("[Auth] Session expired — redirecting to login");
  try {
    queryClient.clear();
  } catch {}
  localStorage.removeItem("checkmate_last_path");
  window.location.replace("/login?reason=expired");
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    if (res.status === 401) {
      handleSessionExpired();
    }
    const text = (await res.text()) || res.statusText;
    let message = text;
    try {
      const json = JSON.parse(text);
      message = json.error || json.message || text;
    } catch {
    }
    throw new Error(message);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {
    ...getImpersonationHeaders(),
  };
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      cache: "no-store",
      headers: getImpersonationHeaders(),
    });

    if (res.status === 401) {
      if (unauthorizedBehavior === "returnNull") {
        return null;
      }
      handleSessionExpired();
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
