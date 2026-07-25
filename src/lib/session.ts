// Client-side session storage. The token is opaque; the server owns validation.
export type Session = {
  token: string;
  role: "admin" | "area_manager" | "branch";
  branchId: string | null;
  displayName: string;
};

const KEY = "restaurant-report-session";

export function loadSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function saveSession(s: Session): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(s));
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}