/**
 * Cloudflare Worker for vibes.markets
 *
 * Handles:
 * - Wildcard subdomain proxying to Pages
 * - /api/tenants - List all tenants
 * - /api/stats - Get stats
 * - /api/tenants/register - Register tenant subdomain
 * - /webhooks/clerk - Clerk webhook handler
 *
 * Environment Variables (set in wrangler.toml or dashboard):
 * - PAGES_HOSTNAME: Your Pages project hostname (e.g., "vibes-market.pages.dev")
 * - CLERK_WEBHOOK_SECRET: Your Clerk webhook secret (set via wrangler secret)
 *
 * KV Namespace:
 * - TENANTS: KV namespace for tenant data
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Handle API routes
    if (pathname.startsWith('/api/')) {
      return handleAPI(request, env, pathname);
    }

    // Handle Clerk webhooks
    if (pathname === '/webhooks/clerk') {
      return handleClerkWebhook(request, env);
    }

    // Proxy to Pages
    return proxyToPages(request, env, url.hostname);
  }
};

async function handleAPI(request, env, pathname) {
  // Get all tenants
  if (pathname === '/api/tenants' && request.method === 'GET') {
    try {
      const listResult = await env.TENANTS.get('tenants:list');
      const subdomains = listResult ? JSON.parse(listResult) : [];

      const tenants = [];
      for (const subdomain of subdomains) {
        const tenant = await env.TENANTS.get(`tenant:${subdomain}`);
        if (tenant) {
          tenants.push(JSON.parse(tenant));
        }
      }

      return new Response(JSON.stringify({ tenants }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // Get stats
  if (pathname === '/api/stats' && request.method === 'GET') {
    try {
      const tenantCount = await env.TENANTS.get('stats:tenantCount') || '0';
      const userCount = await env.TENANTS.get('stats:userCount') || '0';

      return new Response(JSON.stringify({
        tenantCount: parseInt(tenantCount),
        userCount: parseInt(userCount),
        monthlyRevenue: parseInt(tenantCount) * 9 // $9/month per tenant
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // Register tenant
  if (pathname === '/api/tenants/register' && request.method === 'POST') {
    try {
      const body = await request.json();
      const { subdomain, userId, email, plan } = body;

      if (!subdomain || !userId) {
        return new Response(JSON.stringify({ error: 'Missing subdomain or userId' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Check if subdomain is taken
      const existing = await env.TENANTS.get(`tenant:${subdomain}`);
      if (existing) {
        return new Response(JSON.stringify({ error: 'Subdomain already taken' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Create tenant
      const tenant = {
        subdomain,
        userId,
        email,
        plan: plan || 'pro',
        status: 'active',
        createdAt: new Date().toISOString()
      };

      await env.TENANTS.put(`tenant:${subdomain}`, JSON.stringify(tenant));

      // Update tenant list
      const listResult = await env.TENANTS.get('tenants:list');
      const subdomains = listResult ? JSON.parse(listResult) : [];
      if (!subdomains.includes(subdomain)) {
        subdomains.push(subdomain);
        await env.TENANTS.put('tenants:list', JSON.stringify(subdomains));

        // Update count
        await env.TENANTS.put('stats:tenantCount', String(subdomains.length));
      }

      return new Response(JSON.stringify({ success: true, tenant }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function handleClerkWebhook(request, env) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // Verify webhook signature
    const svix_id = request.headers.get('svix-id');
    const svix_timestamp = request.headers.get('svix-timestamp');
    const svix_signature = request.headers.get('svix-signature');

    if (!svix_id || !svix_timestamp || !svix_signature) {
      return new Response('Missing svix headers', { status: 400 });
    }

    const bodyText = await request.text();

    // Verify signature
    const isValid = await verifyWebhook(bodyText, svix_id, svix_timestamp, svix_signature, env.CLERK_WEBHOOK_SECRET);
    if (!isValid) {
      return new Response('Invalid signature', { status: 401 });
    }

    const body = JSON.parse(bodyText);
    const eventType = body.type;
    const data = body.data;

    console.log(`Clerk webhook: ${eventType}`);

    if (eventType === 'user.created') {
      // Track new user
      const user = {
        id: data.id,
        email: data.email_addresses?.[0]?.email_address,
        firstName: data.first_name,
        lastName: data.last_name,
        createdAt: new Date().toISOString()
      };

      await env.TENANTS.put(`user:${data.id}`, JSON.stringify(user));

      // Increment user count
      const count = parseInt(await env.TENANTS.get('stats:userCount') || '0');
      await env.TENANTS.put('stats:userCount', String(count + 1));
    }

    if (eventType === 'user.deleted') {
      // Remove user
      await env.TENANTS.delete(`user:${data.id}`);

      // Decrement user count
      const count = parseInt(await env.TENANTS.get('stats:userCount') || '0');
      await env.TENANTS.put('stats:userCount', String(Math.max(0, count - 1)));
    }

    // Handle subscription events (Clerk Billing)
    if (eventType === 'subscription.created') {
      const subdomain = data.metadata?.subdomain;
      if (subdomain) {
        const tenant = {
          subdomain,
          userId: data.user_id,
          subscriptionId: data.id,
          plan: data.plan_id,
          status: 'active',
          createdAt: new Date().toISOString()
        };
        await env.TENANTS.put(`tenant:${subdomain}`, JSON.stringify(tenant));

        // Update tenant list
        const listResult = await env.TENANTS.get('tenants:list');
        const subdomains = listResult ? JSON.parse(listResult) : [];
        if (!subdomains.includes(subdomain)) {
          subdomains.push(subdomain);
          await env.TENANTS.put('tenants:list', JSON.stringify(subdomains));
          await env.TENANTS.put('stats:tenantCount', String(subdomains.length));
        }
      }
    }

    if (eventType === 'subscription.updated') {
      const subdomain = data.metadata?.subdomain;
      if (subdomain) {
        const existing = await env.TENANTS.get(`tenant:${subdomain}`);
        if (existing) {
          const tenant = JSON.parse(existing);
          tenant.status = data.status;
          tenant.updatedAt = new Date().toISOString();
          await env.TENANTS.put(`tenant:${subdomain}`, JSON.stringify(tenant));
        }
      }
    }

    if (eventType === 'subscription.deleted') {
      const subdomain = data.metadata?.subdomain;
      if (subdomain) {
        const existing = await env.TENANTS.get(`tenant:${subdomain}`);
        if (existing) {
          const tenant = JSON.parse(existing);
          tenant.status = 'cancelled';
          tenant.cancelledAt = new Date().toISOString();
          await env.TENANTS.put(`tenant:${subdomain}`, JSON.stringify(tenant));
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Webhook error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Webhook signature verification
async function verifyWebhook(payload, svix_id, svix_timestamp, svix_signature, secret) {
  if (!secret) return true; // Skip verification if no secret set

  const encoder = new TextEncoder();
  const signedContent = `${svix_id}.${svix_timestamp}.${payload}`;

  // Extract the base64 secret (remove 'whsec_' prefix)
  const secretBytes = base64ToUint8Array(secret.replace('whsec_', ''));

  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signedContent));
  const expectedSignature = uint8ArrayToBase64(new Uint8Array(signature));

  // svix_signature format: "v1,BASE64_SIGNATURE v1,ANOTHER_SIG..."
  const signatures = svix_signature.split(' ').map(s => s.split(',')[1]);

  return signatures.some(sig => sig === expectedSignature);
}

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function proxyToPages(request, env, hostname) {
  // Construct Pages URL
  const pagesUrl = new URL(request.url);
  pagesUrl.hostname = env.PAGES_HOSTNAME || 'vibes-market.pages.dev';

  // Clone request with new URL
  const proxyRequest = new Request(pagesUrl.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.body,
    redirect: 'manual'
  });

  const response = await fetch(proxyRequest);

  // Clone response with CORS headers
  const newHeaders = new Headers(response.headers);
  // Don't override CORS on HTML pages
  if (!newHeaders.get('Content-Type')?.includes('text/html')) {
    Object.entries(corsHeaders).forEach(([k, v]) => newHeaders.set(k, v));
  }

  return new Response(response.body, {
    status: response.status,
    headers: newHeaders
  });
}
