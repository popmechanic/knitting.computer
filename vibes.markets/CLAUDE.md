# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

vibes.markets is a multi-tenant SaaS prediction market platform built with:
- **Frontend**: Single-file React app (`index.html`) using Babel transform, Tailwind CSS 4 (browser build), and Fireproof for local-first database
- **Backend**: Cloudflare Workers for API and subdomain routing (`worker.js`)
- **Auth**: Clerk for authentication and billing
- **Hosting**: Cloudflare Pages (static) + Cloudflare Workers (API/routing)

## Architecture

### Subdomain-based Multi-tenancy
- Root domain (`vibes.markets`) → Landing page
- `admin.vibes.markets` → Admin dashboard
- `*.vibes.markets` → Tenant prediction market apps

Subdomain detection happens client-side in `getSubdomain()`. The worker proxies requests to Cloudflare Pages and handles API routes.

### Key Files
- `index.html` - Complete SaaS app: landing page, tenant app, admin dashboard (all in one file with subdomain routing)
- `worker.js` - Main Cloudflare Worker handling wildcard subdomains, API routes, and Clerk webhooks
- `wrangler.toml` - Worker configuration with KV bindings and route patterns
- `app.jsx` - Standalone prediction market app (not multi-tenant version)

### API Routes (handled by worker.js)
- `GET /api/tenants` - List all tenants
- `GET /api/stats` - Get platform stats
- `POST /api/tenants/register` - Register new tenant
- `POST /webhooks/clerk` - Clerk webhook handler for user/subscription events

## Common Commands

```bash
# Deploy static site to Cloudflare Pages (run from parent directory)
wrangler pages deploy vibes.markets --project-name=vibes-market

# Deploy worker (run from this directory)
wrangler deploy

# Create KV namespace (first time only)
wrangler kv namespace create "TENANTS"

# Set Clerk webhook secret
wrangler secret put CLERK_WEBHOOK_SECRET
```

## Critical Implementation Notes

### React/Fireproof ESM Import Pattern
Must use exact import map with `?deps=react@18.3.1` on ALL esm.sh imports to share React instance. See `index.html` lines 10-20 for correct pattern. Deviation causes "Cannot read properties of null (reading 'useRef')" errors.

### Deployment Requires Two Steps
1. Pages deployment for static HTML
2. Worker deployment for API/routing

### Manual Cloudflare Setup Required
Worker routes often fail via API. Configure manually in dashboard:
- Workers & Pages > [worker] > Settings > Triggers > Routes
- DNS: Add CNAME `*` → pages-project.pages.dev (proxied)

See `DEPLOYMENT-LEARNINGS.md` for detailed troubleshooting.
