import type { UserRole } from "@ika/shared";

/**
 * The role chosen on the sign-in / sign-up page, remembered in this browser.
 * It's a preference, not a permission: the API only lets it *lower* access (an admin can use
 * the app as a member); whether someone is an admin is decided server-side.
 */
const KEY = "ika.signInAs";
const EVENT = "ika:sign-in-as";

export function getSignInAs(): UserRole {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(KEY) === "admin" ? "admin" : "member";
  } catch {
    return "member";
  }
}

export function setSignInAs(role: UserRole): void {
  try {
    window.localStorage.setItem(KEY, role);
  } catch {
    /* storage unavailable: the API default (stored role) applies */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** For useSyncExternalStore. */
export function subscribeSignInAs(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
