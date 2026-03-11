# Monetization Plan: Forest Biomass Analyzer

## Context
The app is a pure CRA frontend with no backend, no user accounts, and Sentinel Hub credentials exposed client-side. We're adding a full stack: Express backend, Stripe payments, user auth, landing page, and freemium model. Target market is Finnish/Nordic forest owners (cheap tier) and forestry professionals (premium tier).

## Architecture Decision: Express + existing CRA
**Don't migrate to Next.js.** The app is 2,684 lines of heavily stateful React with Leaflet maps, GeoTIFF parsing, and complex charting. CRA stays. Express serves the built React app + API routes.

## Tech Stack
| Concern | Choice | Why |
|---------|--------|-----|
| Backend | Express.js | Same runtime as CRA, serves static build + API |
| Database | SQLite (better-sqlite3) | Zero ops, single file, migrate to PG later |
| Auth | Passport.js + JWT (httpOnly cookie) | Email/password, add Google OAuth later |
| Payments | Stripe Checkout + Customer Portal | Hosted payment pages, minimal frontend work |
| Deploy | Self-hosted (this machine) | nginx reverse proxy + PM2 process manager |
| Rate limit | express-rate-limit | Per-user Sentinel Hub rate limiting |

## Pricing Tiers
- **Free**: Demo with sample data (cached real Finnish pine forest), all analysis modules visible
- **Pro** (19 EUR/mo): Real satellite data, all modules, save up to 10 forests
- **Business** (49 EUR/mo): Unlimited forests, PDF export, priority support

## Project Structure
```
biomass/
  forest-biomass-analyzer/        # Existing CRA (stays as-is mostly)
    src/
      App.js                      # Add routing, auth context, demo mode
      LandingPage.js              # NEW - marketing/pricing/demo
      Login.js                    # NEW - login/register forms
      AuthContext.js              # NEW - React context for user state
      api.js                      # NEW - fetch wrapper with JWT
      sampleData.json             # NEW - cached demo forest data
      ...existing modules unchanged...
  server/                         # NEW - Express backend
    index.js                      # Entry point, serves React build
    routes/
      auth.js                     # Register, login, token refresh
      sentinel.js                 # Proxy to Sentinel Hub (replaces setupProxy.js)
      stripe.js                   # Checkout, webhooks, portal
      forests.js                  # CRUD saved forests + sample data
    middleware/
      auth.js                     # JWT verification
      tierCheck.js                # Free vs Pro vs Business gating
      rateLimit.js                # Per-user rate limits
    db/
      migrations/                 # Knex migrations
      knexfile.js
    package.json
  package.json                    # Root workspace scripts
```

## Implementation Phases

### Phase 1: Backend Foundation (Days 1-3)
**Goal:** Express server replaces setupProxy.js and adds auth.

1. **`server/index.js`** - Express app serving CRA build + API routes
2. **`server/routes/sentinel.js`** - Replicate proxy from `setupProxy.js` but server-side with app's own Sentinel Hub credentials (from env vars, never exposed to client)
3. **Database schema** (Knex migrations):
   - `users`: id, email, password_hash, name, created_at, stripe_customer_id
   - `subscriptions`: id, user_id, stripe_subscription_id, plan, status, current_period_end
   - `forests`: id, user_id, name, polygon_geojson, forest_type, forest_age, area_hectares, created_at
   - `analyses`: id, forest_id, ndvi_data_json, biomass_data_json, created_at
4. **`server/routes/auth.js`** - POST /api/auth/register, POST /api/auth/login, GET /api/auth/me
5. **Frontend**: Remove clientId/clientSecret UI from App.js (~lines 156-256, 1093-1200). Add `api.js` fetch wrapper with JWT.

### Phase 2: Stripe Integration (Days 4-5)
**Goal:** Users can subscribe.

1. **Stripe Dashboard**: Create Free/Pro/Business products
2. **`server/routes/stripe.js`**:
   - POST /api/stripe/create-checkout-session
   - POST /api/stripe/webhook (handle checkout.session.completed, subscription.updated, subscription.deleted)
   - POST /api/stripe/create-portal-session
3. **`server/middleware/tierCheck.js`**:
   - Free: block `/api/copernicus/*`, only allow `/api/sample-data/*`
   - Pro: 100 Sentinel Hub requests/day
   - Business: 500 requests/day
4. **Frontend**: Pricing table component with Stripe Checkout redirect

### Phase 3: Landing Page + Demo Mode (Days 6-8)
**Goal:** Acquire free users, convert to paid.

1. **Sample data**: Capture real NDVI time series for a demo Finnish pine forest -> `server/fixtures/demo-forest.json`
2. **`src/LandingPage.js`**: Hero, feature cards (6 modules), pricing table, embedded demo dashboard preview, FAQ
3. **Demo mode in App.js**: When `user.plan === 'free'`, load sample data instead of Sentinel Hub. Show upgrade banner. All pure-function analysis modules work unchanged.
4. **Routing**: Add react-router-dom - `/` (landing), `/login`, `/app` (dashboard behind auth)
5. **Auth UI**: Simple login/register forms at `/login`

### Phase 4: Save/Load + PDF Export (Days 9-10)
**Goal:** Retention features for paid users.

1. **`server/routes/forests.js`**: CRUD for saved forests + analysis results
2. **Frontend**: "Save Forest" button, "My Forests" list/dropdown
3. **PDF export** (Business tier): jspdf + html2canvas, branded report with all analysis sections

### Phase 5: Deploy on this server (Day 11)
1. **PM2**: Process manager to keep Express running (`pm2 start server/index.js --name biomass`)
2. **nginx**: Reverse proxy from port 80/443 -> Express (e.g. port 3001). Handle SSL via Let's Encrypt/certbot.
3. **Env vars**: `/home/compute/biomass/.env` with SENTINEL_CLIENT_ID, SENTINEL_CLIENT_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, JWT_SECRET
4. **Production hardening**: Helmet.js, CORS locked to your domain, Stripe webhook signature verification, auth rate limiting
5. **Build script**: `cd forest-biomass-analyzer && npm run build` -> Express serves the `build/` directory

## What DOESN'T Change
All computation modules stay untouched - they're pure functions:
- carbonCalculation.js, carbonCertification.js
- eudrCompliance.js, regulatoryCompliance.js
- successionPlanning.js, timberMarket.js
- biodiversityEstimation.js, healthEstimation.js
- treeEstimation.js, dataProcessing.js

## Key Changes to App.js
1. **Remove** clientId/clientSecret auth UI (~lines 156-256, 1093-1200) - backend handles Sentinel Hub auth
2. **Add** demo mode: free tier loads sample data, shows upgrade banner
3. **Add** react-router-dom routing (3 routes)
4. **Wrap** fetch calls with `api.js` that attaches JWT

## Risks
- **Sentinel Hub rate limits**: Mitigate with per-polygon NDVI caching in SQLite
- **2,684-line App.js**: Consider splitting into smaller components during Phase 3 but don't let it block shipping
- **CRA deprecation**: Still functional, migrate to Vite later if needed

## Verification
1. `cd server && npm test` - backend tests pass
2. `cd forest-biomass-analyzer && npx react-scripts test --watchAll=false` - existing 278 tests still pass
3. Manual: register -> subscribe -> analyze forest -> save -> load -> PDF export
4. Stripe CLI: `stripe listen --forward-to localhost:3001/api/stripe/webhook` for local webhook testing
5. PM2 + nginx running on this server, test end-to-end via domain
