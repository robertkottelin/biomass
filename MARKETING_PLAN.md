# ForestData Marketing Plan

Solo-founder playbook for acquiring paying customers with no existing network or social media presence. Every section has concrete steps you can execute this week.

---

## Table of Contents

1. [Target Customer Profiles](#1-target-customer-profiles)
2. [Positioning & Messaging](#2-positioning--messaging)
3. [Phase 1: Foundation (Weeks 1-2)](#3-phase-1-foundation-weeks-1-2)
4. [Phase 2: Paid Acquisition (Weeks 3-6)](#4-phase-2-paid-acquisition-weeks-3-6)
5. [Phase 3: Content & SEO (Weeks 3-12)](#5-phase-3-content--seo-weeks-3-12)
6. [Phase 4: Direct Outreach (Weeks 4-8)](#6-phase-4-direct-outreach-weeks-4-8)
7. [Phase 5: Partnerships & Directories (Weeks 6-12)](#7-phase-5-partnerships--directories-weeks-6-12)
8. [Budget Summary](#8-budget-summary)
9. [Metrics & Decision Points](#9-metrics--decision-points)
10. [What Not to Do](#10-what-not-to-do)

---

## 1. Target Customer Profiles

You have three distinct buyer types. Rank them by how likely they are to pay, and focus outreach accordingly.

### A. Finnish Private Forest Owners (Pro plan - primary target)

- **Who**: Finland has ~600,000 private forest owners. Many inherited forest and manage it passively. Average holding is ~30 hectares.
- **Pain**: They get a forest management plan every 10 years from Metsäkeskus. Between plans, they have no idea what their forest is worth or how it's growing.
- **Trigger**: Considering a timber sale, received an offer from a harvesting company and want to verify the valuation, or planning inheritance.
- **Where they look**: Google ("metsän arvo" / "puuston arvio"), Metsälehti (forestry magazine), local forestry associations (metsänhoitoyhdistys), Metsään.fi portal.
- **Message that works**: "Know what your forest is worth before the harvester calls."

### B. Forest Management Consultants & Companies (Business plan)

- **Who**: Companies like Metsä Group, UPM, Stora Enso have field foresters. Independent forest planning consultants (metsäsuunnittelija) serve multiple owners.
- **Pain**: They do site visits and manual measurements. Satellite pre-screening would save travel and give clients impressive reports.
- **Trigger**: EUDR compliance deadlines, client asking for modern reporting, competitor started offering digital services.
- **Where they look**: Professional events (Metsäpäivät), industry publications, Google ("forest analytics software", "EUDR compliance tool").
- **Message that works**: "Pre-screen sites from your desk. Show up with data."

### C. EU Timber Importers Needing EUDR Compliance (Business plan)

- **Who**: Any EU company importing or trading timber/wood products. EUDR requires geo-located due diligence proof.
- **Pain**: The regulation is new, they don't have tools, and non-compliance means fines.
- **Trigger**: EUDR enforcement deadlines.
- **Where they look**: Google ("EUDR compliance tool", "EUDR due diligence software"), trade associations, EU regulation webinars.
- **Message that works**: "EUDR compliance reports from satellite data. No fieldwork needed."

---

## 2. Positioning & Messaging

### One-liner

> ForestData turns satellite imagery into actionable forest analytics — biomass, timber value, carbon, and EUDR compliance — without setting foot in the forest.

### Key differentiators to emphasize

| Feature | Why it matters | Proof point |
|---------|---------------|-------------|
| No fieldwork needed | Saves time and money | "Draw a polygon, get analysis in minutes" |
| 10 years of history | Shows trends, not snapshots | "Track how your forest has grown since 2015" |
| EUDR-ready reports | Regulatory compliance | "Satellite-verified deforestation risk assessment" |
| Timber valuation | Real money decisions | "Current Finnish market rates, updated regularly" |
| Free demo, no signup | Low friction | "Try it right now with our sample forest" |

### Objection handling (use in ad copy and landing page)

| Objection | Response |
|-----------|----------|
| "Satellites can't be accurate" | "15-20% accuracy for relative changes, validated against ground truth. Good enough for screening and trend analysis — not replacing inventory, but filling the 10-year gap between plans." |
| "I already use Metsään.fi" | "Metsään.fi shows your management plan. ForestData shows what happened since, with current satellite data." |
| "Too expensive" | "One timber sale decision based on better data pays for decades of the Pro plan." |

---

## 3. Phase 1: Foundation (Weeks 1-2)

Before spending on ads, fix the basics so that every visitor has the best chance of converting.

### 3.1 Set up analytics

Do this first so you can measure everything that follows.

- [ ] **Create a Google Analytics 4 account** — add the GA4 tag to your React app. Track these events:
  - Page views (automatic)
  - "Try Free Demo" button click
  - Account registration
  - Stripe checkout initiated
  - Subscription activated
- [ ] **Set up Google Search Console** — verify your domain, submit your sitemap
- [ ] **Add a Meta Pixel** (even if you don't plan Meta ads immediately — the pixel learns from visitors)

### 3.2 Landing page SEO basics

Your React SPA is invisible to search engines. Fix this or SEO/ads will underperform.

- [ ] **Add server-side rendering or prerendering for the landing page**. Cheapest option: use `react-snap` or `prerender-spa-plugin` to generate a static HTML of the `/` route at build time. Google can then crawl your content.
- [ ] **Add these meta tags** to the landing page `<head>`:
  ```
  <title>ForestData — Satellite Forest Analytics | Biomass, Carbon, Timber Value</title>
  <meta name="description" content="Monitor your forest with ESA Sentinel-2 satellite data. Track biomass growth, estimate timber value, assess carbon stocks, and generate EUDR compliance reports. Free demo available.">
  ```
- [ ] **Add Open Graph tags** so the page previews well when shared anywhere:
  ```
  <meta property="og:title" content="ForestData — Satellite Forest Analytics">
  <meta property="og:description" content="Biomass, carbon, timber value, and EUDR compliance from satellite data.">
  <meta property="og:image" content="[screenshot of your dashboard]">
  ```
- [ ] **Create a `/sitemap.xml`** with your landing page URL.

### 3.3 Create a screen recording demo

This is your single most important marketing asset. It replaces the need for social media content.

- [ ] **Record a 2-minute Loom or OBS screen recording** showing:
  1. Landing on the site
  2. Drawing a forest polygon on the map
  3. Satellite imagery loading
  4. Scrolling through analysis: biomass, timber value, carbon, EUDR
  5. Showing the vegetation statistics dashboard
- [ ] **Upload to YouTube** with title: "ForestData Demo — Satellite Forest Analytics in 2 Minutes"
- [ ] **Embed this video on your landing page** (above the fold or in the "How It Works" section)

### 3.4 Set up transactional emails

You need basic emails working before driving traffic.

- [ ] **Sign up for a transactional email service** — Resend, Postmark, or Mailgun (all have free tiers)
- [ ] **Implement these automated emails**:
  - Welcome email on registration (include link to demo, how to get started)
  - 3-day email to free users: "You explored the demo — here's what Pro unlocks with your own forest"
  - 7-day email: "Did you know ForestData can generate EUDR compliance reports?"

---

## 4. Phase 2: Paid Acquisition (Weeks 3-6)

This is your fastest path to paying customers. Start with Google Ads because your buyers are actively searching for solutions.

### 4.1 Google Ads — Search campaigns

**Budget**: Start at 10-15 EUR/day. Scale what works.

#### Campaign 1: Finnish Forest Owners (Finnish language)

**Keywords** (exact match and phrase match):

```
metsän arvo laskuri
puuston arvo arvio
metsätilan arvonmääritys
metsän biomassa
metsäsijoitus tuotto
metsän hiilivarasto
puukauppa hinta arvio
metsäsuunnitelma verkossa
satelliitti metsäanalyysi
```

**Ad copy (example)**:

```
Headline 1: Tiedä metsäsi arvo tänään
Headline 2: Satelliittidata 10 vuodelta
Headline 3: Kokeile ilmaiseksi
Description: ForestData analysoi metsäsi Sentinel-2 satelliittidatalla.
Biomassa, puuston arvo, hiilivarasto. Aloita ilmaisella demolla.
```

**Landing page**: Your existing landing page (ensure Finnish translation exists, or keep ads in English if the page is English-only — but Finnish ads to a Finnish page will convert far better)

#### Campaign 2: EUDR Compliance (English, EU-wide)

**Keywords**:

```
EUDR compliance tool
EUDR due diligence software
EU deforestation regulation tool
deforestation risk assessment software
timber traceability software
EUDR reporting tool
forest monitoring software
```

**Ad copy**:

```
Headline 1: EUDR Compliance Made Simple
Headline 2: Satellite-Verified Reports
Headline 3: No Fieldwork Required
Description: Generate EUDR due diligence reports with Sentinel-2 satellite data.
Deforestation risk assessment, geo-location proof. Try the free demo.
```

#### Campaign 3: Forest Analytics (English, Nordic + DACH)

**Keywords**:

```
forest biomass estimation tool
forest carbon stock calculator
satellite forest monitoring
forest management software
timber valuation tool
forest analytics platform
NDVI forest analysis
```

**Ad copy**:

```
Headline 1: Satellite-Powered Forest Analytics
Headline 2: Biomass, Carbon, Timber Value
Headline 3: Free Demo — No Signup
Description: 10 years of Sentinel-2 data for your forest.
Track growth, estimate value, plan harvests. Try it free.
```

#### Google Ads execution checklist

- [ ] Create a Google Ads account
- [ ] Set up conversion tracking (link to GA4, import "subscription activated" as conversion)
- [ ] Create the three campaigns above
- [ ] Set daily budget to 5 EUR per campaign (15 EUR total)
- [ ] Use "Maximize conversions" bidding after you have 15+ conversions; until then, use "Maximize clicks"
- [ ] Add negative keywords: "free", "open source", "download", "job", "salary" (to avoid irrelevant clicks)
- [ ] Run for 2 weeks, then evaluate: which keywords convert? Pause the rest, increase budget on winners.
- [ ] Add sitelink extensions pointing to Features, Pricing, Demo, and FAQ sections

#### Expected performance (conservative)

| Metric | Estimate |
|--------|----------|
| Cost per click | 0.50 - 2.00 EUR (niche B2B, low competition) |
| Click-through rate | 3-6% |
| Visitor to free signup | 5-10% |
| Free to paid conversion | 3-8% |
| Cost per paying customer | 30-100 EUR |
| Payback period on Pro plan | 2-5 months |

### 4.2 Microsoft Ads (Bing)

After Google Ads are running, duplicate your best-performing campaigns to Microsoft Ads (Bing). You can import Google Ads campaigns directly. Bing has lower competition and cheaper clicks, and its users skew older (closer to forest owner demographics).

- [ ] Create Microsoft Ads account
- [ ] Import top Google Ads campaigns
- [ ] Budget: 5 EUR/day
- [ ] Timeline: start after 2 weeks of Google Ads data

### 4.3 Google Ads — Display/YouTube retargeting

Don't start cold display ads. Instead, retarget people who visited your site but didn't sign up.

- [ ] Create a retargeting audience in Google Ads (visitors who saw the landing page but didn't register)
- [ ] Run a display retargeting campaign with your dashboard screenshot as the ad image
- [ ] Run a YouTube retargeting campaign using your 2-minute demo video
- [ ] Budget: 3-5 EUR/day
- [ ] Timeline: start after you have 100+ site visitors (usually within 1-2 weeks of search ads)

---

## 5. Phase 3: Content & SEO (Weeks 3-12)

Ads get you immediate traffic. SEO gets you free traffic in 3-6 months. Start building content now.

### 5.1 Blog setup

- [ ] Add a `/blog` route to your app (or use a subdomain `blog.forestdata.fi` with a simple static site generator like Hugo or Astro — faster to set up, better for SEO)
- [ ] Each blog post should target one specific search query

### 5.2 Content calendar — write one post per week

Write for the Finnish forest owner who types something into Google. Each post should be 800-1500 words, practical, and end with a CTA to try ForestData.

#### Month 1

| Week | Title | Target keyword | Angle |
|------|-------|---------------|-------|
| 1 | "How to Estimate Your Forest's Timber Value Without a Field Visit" | metsän arvo arvio, timber valuation | Problem-solution, demo CTA |
| 2 | "Understanding NDVI: What Satellite Data Tells You About Your Forest's Health" | NDVI forest, satellite forest monitoring | Educational, builds trust |
| 3 | "EUDR Compliance: What Finnish Timber Exporters Need to Know in 2026" | EUDR compliance Finland | Regulation explainer, Business plan CTA |
| 4 | "How Much Carbon Does Your Forest Store? A Satellite-Based Approach" | forest carbon stock, metsän hiilivarasto | Environmental angle, demo CTA |

#### Month 2

| Week | Title | Target keyword | Angle |
|------|-------|---------------|-------|
| 5 | "When Is the Optimal Time to Harvest Your Forest? Data-Driven Approaches" | optimal harvest timing, puukaupan ajankohta | Directly showcases your NPV/harvest feature |
| 6 | "Sentinel-2 Explained: The Free Satellite Data Revolutionizing Forest Management" | Sentinel-2 forest, satellite forest data | Technical credibility |
| 7 | "Forest Inheritance in Finland: What You Need to Know About Valuation" | metsätilan perintö, forest succession | Targets inheritance trigger event |
| 8 | "Comparing Forest Management Tools: Spreadsheets vs. Satellite Analytics" | forest management software comparison | Comparison/alternative page |

#### Month 3

| Week | Title | Target keyword | Angle |
|------|-------|---------------|-------|
| 9 | "Biodiversity in Boreal Forests: How to Assess Your Forest's Ecological Value" | forest biodiversity assessment | METSO/conservation angle |
| 10 | "5 Signs Your Forest Is Undervalued — And What to Do About It" | metsän arvo, forest valuation | Listicle, high shareability |
| 11 | "NDMI and NDRE: Advanced Vegetation Indices for Forest Monitoring" | NDMI forest, NDRE vegetation | Technical deep dive |
| 12 | "How ForestData Helped [X] Make a Better Timber Sale Decision" | Case study (once you have a customer) | Social proof |

### 5.3 SEO quick wins

- [ ] **Create comparison pages**: "ForestData vs. manual forest inventory", "ForestData vs. Metsään.fi"
- [ ] **Submit your site to forestry-specific directories** (see Phase 5)
- [ ] **Answer questions on Quora and forestry forums** — not as spam, but genuinely helpful answers that mention your tool where relevant
- [ ] **Create a free tool page**: e.g., "Free Forest Carbon Calculator" — a simplified version that estimates carbon from hectares + tree species. Gate the detailed satellite-based version behind signup.

---

## 6. Phase 4: Direct Outreach (Weeks 4-8)

Cold email works for B2B when the message is relevant and specific. Your target: forest management consultants and EUDR-affected companies.

### 6.1 Build a prospect list

- [ ] **Forest management consultants in Finland**: Search "metsäsuunnittelija" or "metsäpalvelut" on Google. Most have websites with email addresses. Aim for 50 contacts.
- [ ] **Finnish forestry associations** (metsänhoitoyhdistys): There are ~60 regional associations. Find contact info on their websites.
- [ ] **EU timber importers**: Search "EUDR" + "timber import" on company directories. LinkedIn Sales Navigator has a free trial if needed for finding the right person.
- [ ] **Forest investment funds (TIMO/REIT)**: Search "forest investment fund Europe" — these manage large portfolios and need monitoring tools.

### 6.2 Cold email templates

Send from a professional domain email (e.g., info@forestdata.fi). Keep it short.

#### Template A: Forest Consultant

```
Subject: Quick question about your forest planning workflow

Hi [Name],

I'm building ForestData — a tool that uses Sentinel-2 satellite data to
generate biomass estimates, timber valuations, and NDVI trend analysis
for any forest polygon in Finland.

I'm curious: when you're planning a site visit, do you currently have
access to recent satellite vegetation data for the area?

ForestData lets you draw a forest boundary on a map and get 10 years of
growth data, current timber value estimates, and EUDR compliance reports
in minutes.

Here's a 2-minute demo: [YouTube link]

If this looks useful, I'd love to give you a free month of the Business
plan to try it on a real client project.

Best,
[Your name]
```

#### Template B: EUDR Compliance

```
Subject: EUDR due diligence — satellite-based approach

Hi [Name],

With EUDR enforcement approaching, I wanted to share a tool I've built
that generates satellite-verified deforestation risk assessments for
any geo-located timber source.

ForestData uses ESA Sentinel-2 imagery to produce due diligence reports
including:
- 10-year land-use history from satellite data
- Deforestation risk classification
- Geo-located polygon coordinates
- Exportable compliance documentation

Here's a live demo you can try without signing up: [link]

Would this be relevant for your EUDR compliance workflow?

Best,
[Your name]
```

### 6.3 Cold email execution

- [ ] **Send 5-10 emails per day** (not bulk — personalize each one)
- [ ] **Follow up once after 5 days** if no response (just a short "bumping this up — did you get a chance to look?")
- [ ] **Track opens and replies** in a spreadsheet or use a free tool like Mailtrack
- [ ] **Offer a free trial month** to the first 10 consultants who respond — their feedback is worth more than the revenue

### 6.4 Finnish forestry forums and communities

These are not "social media" — they're professional communities where forest owners ask questions.

- [ ] **Metsälehti online discussions** — read threads, answer questions, mention ForestData only when genuinely relevant
- [ ] **Suomi24 metsätalous section** — Finland's largest forum has an active forestry section
- [ ] **Puukauppa and metsänhoito Facebook groups** — even without a personal profile, you can create a brand page and participate
- [ ] **Maaseudun Tulevaisuus** online comments — Finland's agricultural/forestry newspaper

---

## 7. Phase 5: Partnerships & Directories (Weeks 6-12)

### 7.1 SaaS and software directories

List ForestData everywhere potential customers might search for tools. Most listings are free.

- [ ] **Product Hunt** — launch here once your product is polished. Prepare a good description, screenshots, and that demo video. Schedule your launch for a Tuesday. This can drive 500-2000 visitors in one day.
- [ ] **G2, Capterra, GetApp** — list under "Forest Management Software" and "Environmental Monitoring" categories. Free listings.
- [ ] **AlternativeTo** — list as an alternative to forest management tools, Metsään.fi, etc.
- [ ] **SaaSHub** — free listing
- [ ] **BetaList** — if still in early stages, list here for early adopter traffic
- [ ] **EU GreenTech directories** — search for cleantech/greentech startup directories in Europe

### 7.2 Forestry-specific directories

- [ ] **European Forest Institute (EFI)** tools directory
- [ ] **FAO forestry tools** page — worth checking if they list commercial tools
- [ ] **Copernicus ecosystem** — since you use Sentinel-2, list on the Copernicus services marketplace/application directory. This is very high-value because your target audience browses Copernicus resources.
- [ ] **Metsäkeskus (Finnish Forest Centre)** — contact them about being listed as a digital forestry tool. They maintain directories of forest services.
- [ ] **MTK (Central Union of Agricultural Producers and Forest Owners)** — has a member services section

### 7.3 Strategic partnerships (higher effort, higher payoff)

These take longer but can open up channels to thousands of forest owners at once.

- [ ] **Metsänhoitoyhdistys (Forest Management Associations)**: Contact 3-5 of the largest regional associations. Propose: "We'll give your members a 30-day free trial and a 20% discount. You get to offer modern satellite analytics as a member benefit." Prepare a one-page PDF pitch.
- [ ] **Forest plan software companies**: Companies like Tapio or Silva already sell to forest owners. You're complementary (satellite monitoring between plans), not competitive. Propose an integration or white-label deal.
- [ ] **Accounting firms specializing in forest taxation**: Forest owners in Finland deal with forest taxation (metsäverotus). Their accountants need valuation data. A referral partnership with 2-3 forest tax accountants could drive steady leads.

### 7.4 Trade events and webinars

- [ ] **Metsäpäivät** — Finland's main forestry event. Check the next date and apply for a booth or speaking slot.
- [ ] **Host a free webinar**: "Satellite Data for Forest Owners: What You Can Learn Without Leaving Home." Promote via Google Ads and forestry forums. Record it and post to YouTube.
- [ ] **FinnMetko** — forest technology trade fair, held biannually in Jämsä. Popular among forest machine operators and forest owners.

---

## 8. Budget Summary

### Monthly budget (first 3 months)

| Item | Monthly cost | Notes |
|------|-------------|-------|
| Google Ads — Search | 300-450 EUR | 3 campaigns at 5 EUR/day each |
| Google Ads — Retargeting | 90-150 EUR | 3-5 EUR/day |
| Bing Ads | 150 EUR | 5 EUR/day |
| Email service (Resend/Postmark) | 0 EUR | Free tier sufficient |
| Domain + email hosting | 5-10 EUR | If not already set up |
| Loom (screen recording) | 0 EUR | Free tier |
| Blog hosting (if separate) | 0 EUR | Hugo/GitHub Pages |
| Total | ~550-760 EUR/month | |

### Revenue needed to break even

At 19 EUR/month Pro plan: **29-40 paying customers** covers ad spend.
At a blended average of 30 EUR/month (mix of Pro + Business): **18-25 customers**.

### When to increase budget

- If cost per paying customer is under 50 EUR: double the ad budget
- If cost per paying customer is 50-100 EUR: optimize ads first, then increase
- If cost per paying customer is over 100 EUR: pause, fix conversion funnel, try different keywords

---

## 9. Metrics & Decision Points

Track these weekly. Make decisions based on data, not feelings.

### Key metrics

| Metric | Where to find it | Target |
|--------|-----------------|--------|
| Site visitors/week | Google Analytics | 200+ by week 4 |
| Demo usage rate | Custom event tracking | 30%+ of visitors try demo |
| Registration rate | GA4 conversion | 5-10% of visitors |
| Free-to-paid rate | Stripe dashboard | 3-8% within 14 days |
| Cost per click (ads) | Google Ads | Under 2 EUR |
| Cost per registration | Google Ads + GA4 | Under 15 EUR |
| Cost per paying customer | Calculated | Under 80 EUR |
| Monthly recurring revenue | Stripe | Track weekly |

### Decision points

**After 2 weeks of ads:**
- Are people clicking? If CTR < 2%, rewrite ad copy.
- Are people registering? If < 3% of visitors register, the landing page needs work.
- Which campaign has the lowest cost per registration? Shift budget there.

**After 1 month:**
- Do you have any paying customers? If yes, email them and ask why they bought. Double down on that angle.
- If no paying customers but registrations: the free-to-paid conversion is broken. Add better onboarding emails, or the paid features aren't compelling enough vs. the demo.
- If few registrations: the landing page or ad targeting needs work.

**After 3 months:**
- Is MRR covering ad spend? If yes, you have a sustainable channel. Scale it.
- Is SEO traffic appearing? Check Google Search Console for impressions and clicks.
- Which channel produced the most customers? Focus there.

---

## 10. What Not to Do

Save your time and money by avoiding these common solo-founder traps:

- **Don't build a social media presence from scratch.** Growing an Instagram or Twitter account from zero takes 6-12 months and thousands of posts before it drives any revenue. Your customers (forest owners, 50+ years old, rural Finland) are not on Twitter/Instagram.
- **Don't run Facebook/Instagram ads** as your first channel. Meta ads work well for visual consumer products, not niche B2B SaaS. The targeting options for "Finnish forest owner interested in satellite data" don't exist. Try it later only if Google Ads prove the keywords work.
- **Don't spend money on branding or design** beyond what you already have. Your landing page is solid. Don't hire a designer or branding agency until you have 50+ paying customers.
- **Don't build features before you have customers.** Marketing will tell you what features people actually want. Ship what you have, sell it, iterate based on feedback.
- **Don't attend events without a clear goal.** Only go to forestry events where you'll either speak, demo, or have confirmed meetings.
- **Don't offer lifetime deals.** They attract deal-seekers, not your target customer.
- **Don't discount heavily.** At 19 EUR/month you're already cheap. A 50% discount makes it look unserious. Offer free trials instead.

---

## Quick-Start Checklist (This Week)

If you can only do 5 things this week, do these:

1. **Set up Google Analytics 4** on your landing page and track demo clicks + registrations
2. **Record a 2-minute screen demo** and upload to YouTube
3. **Create a Google Ads account** and launch Campaign 1 (Finnish forest owners) at 5 EUR/day
4. **Set up a transactional email** welcome message for new registrations
5. **Send 5 cold emails** to forest management consultants using Template A

---

## Appendix: Finnish Translation Priorities

Your landing page is in English. For the Finnish market, translate (in priority order):

1. Google Ads copy (Campaigns 1 and 2) — **must be Finnish**
2. Landing page hero section and pricing — **high impact**
3. Blog posts targeting Finnish keywords — **write directly in Finnish**
4. Full landing page — can wait until you have 10+ Finnish customers
5. App interface — last priority (forest professionals read English)
