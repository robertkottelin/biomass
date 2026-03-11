# Feature Backlog

Features removed from the landing page because they are not yet implemented.

## High Priority

### PDF Export (Business tier)
- Generate branded PDF reports with all analysis sections
- Include charts, maps, and data tables
- Tech: jspdf + html2canvas
- Originally planned for Phase 4

### Save/Load Forests (Pro & Business)
- "Save Forest" button in the dashboard
- "My Forests" list/dropdown to reload saved analyses
- Backend CRUD routes exist (`/api/forests`) but frontend UI not yet built
- Originally planned for Phase 4

### Stripe Checkout Integration
- Wire up pricing buttons to Stripe Checkout sessions
- Customer portal for subscription management
- Backend routes exist (`/api/stripe`) but need Stripe Dashboard products created
- Need to fill in STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRO_PRICE_ID, STRIPE_BUSINESS_PRICE_ID in .env

## Medium Priority

### Email Support (Pro tier)
- Set up support email or contact form
- Could use a simple mailto link or integrate with a helpdesk

### Priority Support (Business tier)
- Differentiated response times for Business users
- Requires support system first

### API Access (Business tier)
- Public REST API for programmatic forest analysis
- API key management
- Rate-limited endpoints for external integrations
- Documentation

### Data Retention Policy
- Retain user data for 30 days after subscription cancellation
- Automated cleanup job

## Low Priority

### Google OAuth Login
- Add "Sign in with Google" via Passport.js Google strategy
- Planned but not yet implemented

### Vite Migration
- Migrate from CRA to Vite for faster builds
- CRA still functional, not urgent

### NDVI Result Caching
- Cache per-polygon NDVI results in SQLite to reduce Sentinel Hub API usage
- Would improve response times for repeat analyses

### Mobile Responsive Dashboard
- The landing page is responsive but the main analysis dashboard (App.js) needs mobile optimization

### Deploy with PM2 + nginx
- PM2 process manager for production
- nginx reverse proxy with SSL via Let's Encrypt
- Originally planned for Phase 5
