export type AppRoute = "admin" | "results" | "qr";

export function getCurrentRoute(pathname = window.location.pathname): AppRoute {
  if (pathname.startsWith("/qr")) {
    return "qr";
  }

  return pathname.startsWith("/results") || pathname.startsWith("/public") ? "results" : "admin";
}
