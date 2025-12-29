/**
 * Cloudflare Worker - Wildcard Subdomain Proxy
 *
 * Routes *.knitting.computer to the Pages project
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Fetch from your Cloudflare Pages project
    // Replace with your actual Pages URL
    const pagesUrl = `https://knitting-computer.pages.dev${url.pathname}${url.search}`;

    const response = await fetch(pagesUrl, {
      method: request.method,
      headers: request.headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    });

    // Clone response and return with proper headers
    const newResponse = new Response(response.body, response);

    // Preserve the original host for the app's subdomain detection
    return newResponse;
  },
};
