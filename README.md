# knitting.computer

AI-powered knitting pattern generator. Describe your ideal sweater and get a complete, production-ready pattern with AI-generated preview images.

## Features

- Generate detailed sweater patterns with full instructions (gauge, sizing, stitch counts, finishing)
- AI-generated preview images of your sweater design
- Local-first data storage with Fireproof (patterns sync across devices)
- Multi-tenant support via wildcard subdomains

## Tech Stack

- **Frontend**: React + Tailwind CSS (via Vibes.diy)
- **AI**: Claude (patterns) + Gemini (images) via OpenRouter
- **Database**: Fireproof (local-first, syncing)
- **Hosting**: Cloudflare Pages + Workers

## Development

```bash
# Install dependencies
npm install

# Start the API proxy worker locally
cd worker && wrangler dev

# In another terminal, serve the frontend
npx serve .
```

## Deployment

### API Worker

```bash
cd worker

# Deploy the worker
wrangler deploy

# Set your OpenRouter API key
wrangler secret put OPENROUTER_API_KEY
```

### Frontend

Deploy to Cloudflare Pages by connecting the GitHub repo, or:

```bash
npx wrangler pages deploy . --project-name=knitting-computer
```

## Project Structure

```
├── index.html          # Main app entry point
├── app.jsx             # React application
├── worker/
│   ├── api-proxy.js    # OpenRouter API proxy worker
│   └── wrangler.toml   # Worker config
├── worker.js           # Main wildcard worker (subdomain routing)
└── wrangler.toml       # Main worker config
```

## License

MIT
