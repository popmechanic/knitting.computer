// cinema.computer wildcard subdomain router
// Proxies all requests (root + subdomains) to the Pages deployment

const PAGES_URL = "https://cinema-computer.pages.dev";

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Proxy to Pages, preserving the path
    const pagesUrl = `${PAGES_URL}${url.pathname}${url.search}`;

    // Create new request with original headers
    const newRequest = new Request(pagesUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: "manual"
    });

    const response = await fetch(newRequest);

    // Return response with CORS headers for flexibility
    const newHeaders = new Headers(response.headers);
    newHeaders.set("Access-Control-Allow-Origin", "*");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  }
};
