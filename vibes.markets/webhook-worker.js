/**
 * Clerk Webhook Handler for vibes.markets
 * Deploy as a Cloudflare Worker
 *
 * Setup:
 * 1. Create worker: wrangler init predict-webhooks
 * 2. Add secret: wrangler secret put CLERK_WEBHOOK_SECRET
 * 3. Deploy: wrangler deploy
 * 4. Add endpoint in Clerk Dashboard: https://webhooks.vibes.markets/clerk
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS headers for admin dashboard
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Admin API endpoints
    if (url.pathname === '/api/stats' && request.method === 'GET') {
      return await handleGetStats(env, corsHeaders);
    }

    if (url.pathname === '/api/tenants' && request.method === 'GET') {
      return await handleGetTenants(env, corsHeaders);
    }

    // Webhook endpoint
    if (url.pathname !== '/clerk' || request.method !== 'POST') {
      return new Response('Not found', { status: 404 });
    }

    // Verify webhook signature
    const svix_id = request.headers.get('svix-id');
    const svix_timestamp = request.headers.get('svix-timestamp');
    const svix_signature = request.headers.get('svix-signature');

    if (!svix_id || !svix_timestamp || !svix_signature) {
      return new Response('Missing svix headers', { status: 400 });
    }

    const body = await request.text();

    // Verify signature (simplified - use svix library in production)
    const isValid = await verifyWebhook(body, svix_id, svix_timestamp, svix_signature, env.CLERK_WEBHOOK_SECRET);
    if (!isValid) {
      return new Response('Invalid signature', { status: 401 });
    }

    const event = JSON.parse(body);

    // Handle events
    switch (event.type) {
      case 'user.created':
        await handleUserCreated(event.data, env);
        break;

      case 'user.deleted':
        await handleUserDeleted(event.data, env);
        break;

      case 'session.created':
        await handleSessionCreated(event.data, env);
        break;

      // Clerk Billing events (if enabled)
      case 'subscription.created':
        await handleSubscriptionCreated(event.data, env);
        break;

      case 'subscription.updated':
        await handleSubscriptionUpdated(event.data, env);
        break;

      case 'subscription.deleted':
        await handleSubscriptionDeleted(event.data, env);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Webhook signature verification
async function verifyWebhook(payload, svix_id, svix_timestamp, svix_signature, secret) {
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

// Event handlers
async function handleUserCreated(user, env) {
  console.log(`New user: ${user.id} - ${user.email_addresses?.[0]?.email_address}`);

  // Optional: Store in KV for analytics
  if (env.ANALYTICS) {
    const stats = JSON.parse(await env.ANALYTICS.get('stats') || '{"users":0}');
    stats.users++;
    stats.lastSignup = new Date().toISOString();
    await env.ANALYTICS.put('stats', JSON.stringify(stats));
  }

  // Optional: Send welcome email via Resend, SendGrid, etc.
  // await sendWelcomeEmail(user.email_addresses?.[0]?.email_address);
}

async function handleUserDeleted(user, env) {
  console.log(`User deleted: ${user.id}`);
  // Clean up user data if needed
}

async function handleSessionCreated(session, env) {
  console.log(`New session: ${session.user_id}`);
  // Track active users, login analytics, etc.
}

async function handleSubscriptionCreated(subscription, env) {
  console.log(`New subscription: ${subscription.id} for ${subscription.user_id}`);

  // Extract subdomain from metadata (set during checkout)
  const subdomain = subscription.metadata?.subdomain;

  if (env.TENANTS) {
    await env.TENANTS.put(subdomain, JSON.stringify({
      userId: subscription.user_id,
      subscriptionId: subscription.id,
      plan: subscription.plan_id,
      status: 'active',
      createdAt: new Date().toISOString()
    }));
  }
}

async function handleSubscriptionUpdated(subscription, env) {
  console.log(`Subscription updated: ${subscription.id} - ${subscription.status}`);

  const subdomain = subscription.metadata?.subdomain;

  if (env.TENANTS && subdomain) {
    const tenant = JSON.parse(await env.TENANTS.get(subdomain) || '{}');
    tenant.status = subscription.status;
    tenant.updatedAt = new Date().toISOString();
    await env.TENANTS.put(subdomain, JSON.stringify(tenant));
  }
}

async function handleSubscriptionDeleted(subscription, env) {
  console.log(`Subscription cancelled: ${subscription.id}`);

  const subdomain = subscription.metadata?.subdomain;

  if (env.TENANTS && subdomain) {
    const tenant = JSON.parse(await env.TENANTS.get(subdomain) || '{}');
    tenant.status = 'cancelled';
    tenant.cancelledAt = new Date().toISOString();
    await env.TENANTS.put(subdomain, JSON.stringify(tenant));
  }
}

// Admin API handlers
async function handleGetStats(env, corsHeaders) {
  let stats = { users: 0, tenants: 0, revenue: 0, lastSignup: null };

  if (env.ANALYTICS) {
    const stored = await env.ANALYTICS.get('stats');
    if (stored) stats = { ...stats, ...JSON.parse(stored) };
  }

  if (env.TENANTS) {
    const tenantList = await env.TENANTS.list();
    const activeTenants = await Promise.all(
      tenantList.keys.map(async (key) => {
        const tenant = JSON.parse(await env.TENANTS.get(key.name) || '{}');
        return tenant.status === 'active' ? 1 : 0;
      })
    );
    stats.tenants = activeTenants.reduce((a, b) => a + b, 0);
    stats.revenue = stats.tenants * 9; // $9/month per tenant
  }

  return new Response(JSON.stringify(stats), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function handleGetTenants(env, corsHeaders) {
  let tenants = [];

  if (env.TENANTS) {
    const tenantList = await env.TENANTS.list();
    tenants = await Promise.all(
      tenantList.keys.map(async (key) => {
        const tenant = JSON.parse(await env.TENANTS.get(key.name) || '{}');
        return { subdomain: key.name, ...tenant };
      })
    );
  }

  return new Response(JSON.stringify(tenants), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
