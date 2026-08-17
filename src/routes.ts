export type AppRoute = "admin" | "results";

export function getCurrentRoute(pathname = window.location.pathname): AppRoute {
  return pathname.startsWith("/results") || pathname.startsWith("/public") ? "results" : "admin";
}
