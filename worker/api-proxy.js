/**
 * Cloudflare Worker - OpenRouter API Proxy
 *
 * This worker securely proxies requests to OpenRouter, keeping the API key
 * on the server side. Deploy to Cloudflare Workers with:
 *
 *   wrangler deploy
 *
 * Set the secret:
 *   wrangler secret put OPENROUTER_API_KEY
 *   (then paste: YOUR_API_KEY_HERE)
 */

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '*';

    const corsHeaders = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Only allow POST requests
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const url = new URL(request.url);

    // Route: /api/generate-pattern - Text generation with Claude
    // Route: /api/generate-image - Image generation with Gemini
    const allowedPaths = ['/api/generate-pattern', '/api/generate-image'];

    if (!allowedPaths.includes(url.pathname)) {
      return new Response('Not found', { status: 404 });
    }

    try {
      const body = await request.json();

      // Forward to OpenRouter with the secret API key
      const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://knitting.computer',
        },
        body: JSON.stringify(body),
      });

      const data = await openRouterResponse.json();

      return new Response(JSON.stringify(data), {
        status: openRouterResponse.status,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }
  },
};
