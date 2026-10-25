// Shared by the worker and local tests. Only the build's explicit precache can
// persist responses; every other request goes to the network without caching.
export function networkOnlyRequest(url: URL, origin: string, authorization: boolean) {
  return (
    url.origin !== origin ||
    authorization ||
    /^\/(?:api|auth|rest|rpc|functions|storage|graphql)(?:\/|$)/i.test(url.pathname) ||
    ["access_token", "refresh_token", "code"].some((key) => url.searchParams.has(key))
  );
}
