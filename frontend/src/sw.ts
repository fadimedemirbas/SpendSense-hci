/// <reference lib="WebWorker" />
import { setCacheNameDetails } from "workbox-core";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { NetworkOnly } from "workbox-strategies";
import { networkOnlyRequest } from "./pwa/policy";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

setCacheNameDetails({ prefix: "spendsense", suffix: "v1" });
for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"] as const) {
  registerRoute(
    ({ request, url }) =>
      networkOnlyRequest(url, self.location.origin, request.headers.has("authorization")),
    new NetworkOnly({ fetchOptions: { cache: "no-store" } }),
    method,
  );
}

// Entries are injected from dist at build time. No runtime response cache,
// background sync, API fallback, or financial persistence is configured.
precacheAndRoute(self.__WB_MANIFEST, { ignoreURLParametersMatching: [] });
cleanupOutdatedCaches();
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    // App screens use clean paths (see TABS in context.ts and the landing pages).
    allowlist: [
      /^\/(?:index\.html|how-it-works|home|money|decide|goals|insights|waiting|history|settings)?(?:\?.*)?$/,
    ],
  }),
);

// No automatic skipWaiting or clientsClaim: existing tabs keep their version.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});
