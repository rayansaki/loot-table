/** Addresses inside the Library: #/library, #/library/stats, #/library/series/<key> */
export const seriesHref = (key: string) => `#/library/series/${encodeURIComponent(key)}`;

export type LibraryRoute = { view: "home" } | { view: "stats" } | { view: "series"; key: string };

export function libraryRoute(hash = window.location.hash): LibraryRoute {
  const parts = hash.replace(/^#\/?/, "").split("/");
  if (parts[1] === "stats") return { view: "stats" };
  if (parts[1] === "series" && parts[2]) return { view: "series", key: decodeURIComponent(parts.slice(2).join("/")) };
  return { view: "home" };
}
