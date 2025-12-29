# Vibes SaaS Deployment Learnings

Summary of issues encountered during vibes.markets deployment testing. These should inform plugin automation improvements.

---

## 1. React/Fireproof Dual-Instance Conflict

**Problem**: ESM-imported Fireproof bundles its own React, conflicting with UMD React from CDN. Results in:
```
TypeError: Cannot read properties of null (reading 'useRef')
```

**Solution**: Must use the exact skill template pattern:
```html
<script type="importmap">
  {
    "imports": {
      "react": "https://esm.sh/react@18.3.1",
      "react-dom": "https://esm.sh/react-dom@18.3.1?deps=react@18.3.1",
      "react-dom/client": "https://esm.sh/react-dom@18.3.1/client?deps=react@18.3.1",
      "react/jsx-runtime": "https://esm.sh/react@18.3.1/jsx-runtime",
      "use-fireproof": "https://esm.sh/use-fireproof@0.20.0-dev-preview-50?deps=react@18.3.1"
    }
  }
</script>
```

Key requirements:
- `?deps=react@18.3.1` on ALL esm.sh imports to share React instance
- `type="text/babel" data-type="module"` for script tag
- ES imports INSIDE the Babel script block
- Use `ReactDOMClient.createRoot()` not `ReactDOM.createRoot()`

**Plugin Action**: Template must enforce this exact pattern. No variations.

---


**Plugin Action**: Never auto-open Clerk modals. Always use click-triggered buttons.

---

## 3. Cloudflare Deployment Complexity

### 3a. Two Deployments Required
The /sell skill generates code that requires TWO separate deployments:

1. **Pages** (static HTML): `wrangler pages deploy <dir> --project-name=<name>`
2. **Worker** (API/routing): `wrangler deploy` (from worker directory)

**Plugin Action**: Automate both deployments in sequence. Currently only Pages is mentioned.

### 3b. Worker Routes Fail via API
Wrangler routes API consistently fails with error 10013:
```
PUT https://api.cloudflare.com/client/v4/zones/.../workers/routes - error code: 10013
```

**Current Workaround**: Routes must be added manually in Cloudflare Dashboard:
- Workers & Pages > [worker-name] > Settings > Triggers > Routes

Required routes for wildcard subdomain SaaS:
- `*.domain.com/*` → worker
- `domain.com/api/*` → worker
- `domain.com/webhooks/*` → worker

**Plugin Action**:
1. Document manual route setup clearly
2. OR investigate alternative route configuration methods
3. Consider using `wrangler.toml` routes field (though this also had issues)

### 3c. Wildcard DNS Record Required
Subdomains like `tenant.domain.com` won't resolve without a wildcard DNS record.

**Required DNS**:
- Type: CNAME
- Name: `*`
- Target: `pages-project.pages.dev` or worker URL
- Proxy: Enabled (orange cloud)

**Plugin Action**: Add DNS setup instructions to deployment output. Consider automating via Cloudflare API.

### 3d. Route Name Typos Cause 403 Errors
We had a route pointing to `vibes-market-wildcard` instead of `vibes-markets-wildcard` (missing 's'). This caused 403 errors on subdomains.

**Plugin Action**: Use consistent naming. Generate worker name from project config, not manual entry.

---

## 5. API Response Format Mismatch

**Problem**: Worker `/api/tenants` returns `{ tenants: [...] }` but admin dashboard code expected just `[...]`:
```javascript
// Bug: t is { tenants: [...] }, not an array
setTenants(t);  // TypeError: tenants.map is not a function

// Fix:
setTenants(t.tenants || []);
```

**Plugin Action**: Ensure generated frontend code matches generated backend API response shapes.

---

## 6. UI Layout Issues

**Problem**: Subdomain input form was cutoff - `.vibes.markets` suffix truncated to `.vibes.mar`

**Cause**: Container had `max-w-md` (448px) which was too narrow.

**Fix**: Changed to `max-w-xl` (576px) and added `whitespace-nowrap flex-shrink-0` to suffix span.

**Plugin Action**: Test generated UI at various viewport sizes. Use appropriate max-width for form layouts.

---

## 7. Wrangler Directory Confusion

**Problem**: Running `wrangler pages deploy vibes.markets` from inside `/vibes.markets` directory failed because it looked for `/vibes.markets/vibes.markets`.

**Solution**: Run from parent directory:
```bash
cd /path/to/knitting && wrangler pages deploy vibes.markets --project-name=vibes-market
```

**Plugin Action**: Always use absolute paths or ensure correct working directory in deployment scripts.

---

## Recommended Plugin Improvements

### High Priority
1. **Automate full deployment sequence**: Pages + Worker + DNS instructions
3. **Fix React/Fireproof template** - enforce exact import map pattern
4. **Test API/frontend contract** - ensure response shapes match

### Medium Priority
5. **Add deployment verification** - curl endpoints after deploy to confirm working
6. **Generate consistent worker names** - from config, prevent typos
7. **Document manual Cloudflare steps** - routes, DNS until automation works

### Nice to Have
8. **Add responsive UI testing** - catch layout issues like cutoff forms
9. **Clerk integration improvements** - button-triggered auth, not auto-open
10. **Health check endpoint** - `/api/health` to verify worker is responding

---

## Deployment Checklist (Current Manual Steps)

```bash
# 1. Deploy Pages (static HTML)
cd /path/to/project
wrangler pages deploy <app-folder> --project-name=<pages-project>

# 2. Create KV namespace (first time only)
wrangler kv namespace create "<PROJECT>_TENANTS"
# Update wrangler.toml with returned ID

# 3. Deploy Worker
cd <app-folder>
wrangler deploy

# 4. Manual: Add DNS record in Cloudflare Dashboard
# DNS > Records > Add Record
# Type: CNAME, Name: *, Target: <pages-project>.pages.dev, Proxied: Yes

# 5. Manual: Add Worker routes in Cloudflare Dashboard
# Workers & Pages > <worker> > Settings > Triggers > Add Route
# Routes: *.domain.com/*, domain.com/api/*, domain.com/webhooks/*

# 6. Verify
curl https://domain.com/api/stats
curl https://subdomain.domain.com/
```
