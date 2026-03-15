import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useCheckout } from './useCheckout';

const colors = {
  darkGreen: '#1a472a',
  medGreen: '#2d6a4f',
  lightGreen: '#40916c',
  paleGreen: '#b7e4c7',
  offWhite: '#f5f7f5',
  white: '#ffffff',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray500: '#6b7280',
  gray700: '#374151',
  gray900: '#111827',
};

const fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

const faqData = [
  {
    q: 'How accurate is the biomass estimation?',
    a: 'Our NDVI-based biomass estimation uses peer-reviewed allometric models calibrated for Nordic boreal forests. Accuracy is typically within 15-20% of ground-truth measurements for relative changes over time.',
  },
  {
    q: 'What satellite data do you use?',
    a: 'We use ESA Sentinel-2 multispectral imagery at native 10m resolution with a 5-day revisit time. Pro and Business plans include high-resolution satellite imagery overlays (true color, NDVI, false color, moisture), server-computed vegetation statistics with percentile distributions, and up to 10 years of historical data for trend analysis.',
  },
  {
    q: 'Can I cancel my subscription at any time?',
    a: 'Yes. All paid plans are billed monthly and you can cancel anytime from your account settings. There are no long-term contracts or cancellation fees.',
  },
  {
    q: 'What does EUDR compliance reporting include?',
    a: 'Our EUDR (EU Deforestation Regulation) reports include deforestation risk assessment, geolocation data with polygon coordinates, satellite-verified land-use history, and a compliance summary suitable for due diligence submissions.',
  },
  {
    q: 'Do I need to install any software?',
    a: 'No. ForestData runs entirely in your web browser. Simply draw your forest boundary on the map and our cloud infrastructure handles all satellite data retrieval and processing.',
  },
];

const features = [
  {
    icon: '\uD83D\uDCC8',
    title: 'NDVI Time Series Analysis',
    desc: 'Track vegetation health over 10 years with Sentinel-2 derived NDVI indices. Detect seasonal patterns, drought stress, and long-term trends.',
  },
  {
    icon: '\uD83C\uDF33',
    title: 'Biomass & Carbon Estimation',
    desc: 'Estimate above-ground biomass, carbon stocks, and CO2 sequestration using validated allometric models for boreal forests.',
  },
  {
    icon: '\uD83D\uDCB0',
    title: 'Timber Market Valuation',
    desc: 'Real-time timber pricing based on species composition, volume estimates, and current Finnish market rates.',
  },
  {
    icon: '\uD83D\uDCCB',
    title: 'EUDR Compliance Reports',
    desc: 'Generate EU Deforestation Regulation compliance documentation with satellite-verified deforestation risk assessments.',
  },
  {
    icon: '\uD83E\uDD89',
    title: 'Biodiversity Assessment',
    desc: 'Evaluate habitat quality, species diversity indicators, and eligibility for METSO conservation programs.',
  },
  {
    icon: '\uD83D\uDCC5',
    title: 'Succession Planning',
    desc: 'Model inheritance scenarios, compare management strategies, and plan long-term forest asset transfers.',
  },
  {
    icon: '\uD83D\uDCCA',
    title: 'Vegetation Statistics Dashboard',
    desc: 'Server-computed NDVI, NDMI, and NDRE statistics with percentile distributions, variability trends, and vegetation density classification.',
  },
  {
    icon: '\uD83D\uDEF0\uFE0F',
    title: 'Satellite Imagery Overlays',
    desc: 'View high-resolution true color, NDVI, false color, and moisture imagery directly on the map with adjustable opacity.',
  },
  {
    icon: '\uD83D\uDCE5',
    title: 'GeoJSON & Data Export',
    desc: 'Export forest polygons as GeoJSON with analysis metadata, download raw statistics, or export CSV and PDF reports.',
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { startCheckout, loading: checkoutLoading } = useCheckout();
  const [openFaq, setOpenFaq] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  function scrollTo(id) {
    setMobileMenuOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }

  const s = buildStyles();

  return (
    <div style={s.page}>
      {/* NAV */}
      <nav style={s.nav}>
        <div style={s.navInner}>
          <div style={s.brand} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <span style={s.brandIcon}>{'\uD83C\uDF32'}</span> ForestData
          </div>
          <button
            className="landing-hamburger"
            style={s.hamburger}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
            type="button"
          >
            {mobileMenuOpen ? '\u2715' : '\u2630'}
          </button>
          <div className={`landing-nav-links${mobileMenuOpen ? ' open' : ''}`} style={s.navLinks}>
            <button style={s.navLink} onClick={() => scrollTo('features')} type="button">Features</button>
            <button style={s.navLink} onClick={() => scrollTo('pricing')} type="button">Pricing</button>
            <button style={s.navLink} onClick={() => scrollTo('faq')} type="button">FAQ</button>
            {user ? (
              <button style={s.navCta} onClick={() => navigate('/app')} type="button">
                Go to Dashboard
              </button>
            ) : (
              <>
                <button style={s.navLoginBtn} onClick={() => navigate('/login')} type="button">
                  Log In
                </button>
                <button style={s.navCta} onClick={() => navigate('/login')} type="button">
                  Sign Up
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="landing-hero" style={s.hero}>
        <div style={s.heroContent}>
          <h1 className="landing-hero-title" style={s.heroTitle}>Satellite-Powered Forest Analytics</h1>
          <p className="landing-hero-sub" style={s.heroSub}>
            Monitor biomass, track growth, and make data-driven decisions for your forest.
            Powered by ESA Sentinel-2 satellite imagery.
          </p>
          <div style={s.heroBtns}>
            <button style={s.heroCtaPrimary} onClick={() => navigate('/app')} type="button">
              Try Free Demo
            </button>
            <button style={s.heroCtaSecondary} onClick={() => scrollTo('pricing')} type="button">
              View Pricing
            </button>
          </div>
        </div>
        <div className="landing-hero-visual" style={s.heroVisual}>
          <div style={s.dashboardMock}>
            <div style={s.mockBar}>
              <span style={s.mockDot('#ef4444')} />
              <span style={s.mockDot('#eab308')} />
              <span style={s.mockDot('#22c55e')} />
              <span style={s.mockBarTitle}>Forest Analysis Dashboard</span>
            </div>
            <div style={s.mockBody}>
              {/* Map + stats side by side */}
              <div className="landing-mock-map-stats" style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                {/* SVG Map visualization */}
                <div style={{ flex: '1 1 55%', borderRadius: '8px', overflow: 'hidden', position: 'relative', minHeight: '110px' }}>
                  <svg viewBox="0 0 220 120" style={{ width: '100%', height: '100%', display: 'block', background: '#e8f0e4' }}>
                    <defs>
                      <linearGradient id="mapForest" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#2d6a4f"/>
                        <stop offset="100%" stopColor="#52b788"/>
                      </linearGradient>
                      <pattern id="topo" patternUnits="userSpaceOnUse" width="20" height="20">
                        <path d="M0,10 Q5,5 10,10 T20,10" fill="none" stroke="#c8dcc0" strokeWidth="0.4"/>
                        <path d="M0,17 Q5,12 10,17 T20,17" fill="none" stroke="#c8dcc0" strokeWidth="0.3"/>
                      </pattern>
                    </defs>
                    {/* Topo background */}
                    <rect width="220" height="120" fill="url(#topo)"/>
                    {/* Water features */}
                    <path d="M0,85 Q15,80 30,82 Q50,88 65,84 Q80,80 90,90 L90,120 L0,120 Z" fill="#a8d8ea" opacity="0.5"/>
                    <ellipse cx="185" cy="30" rx="22" ry="12" fill="#a8d8ea" opacity="0.4"/>
                    {/* Road */}
                    <path d="M0,55 Q40,50 80,58 Q120,66 160,52 Q190,42 220,48" fill="none" stroke="#d4c5a0" strokeWidth="1.5" strokeDasharray="4,2"/>
                    {/* Forest polygon (selected area) */}
                    <polygon points="55,18 105,12 140,25 148,55 130,72 95,75 60,65 45,42" fill="url(#mapForest)" opacity="0.6" stroke={colors.medGreen} strokeWidth="1.5"/>
                    {/* NDVI heatmap cells inside polygon */}
                    {[
                      [68,28,12,10,'#40916c'], [82,24,14,11,'#2d6a4f'], [98,20,13,12,'#1a472a'],
                      [112,28,12,11,'#2d6a4f'], [126,35,11,10,'#40916c'],
                      [60,40,13,11,'#52b788'], [75,36,14,12,'#2d6a4f'], [90,33,13,13,'#1a472a'],
                      [105,38,14,12,'#2d6a4f'], [120,44,12,11,'#40916c'], [133,50,10,10,'#52b788'],
                      [65,53,14,11,'#40916c'], [80,49,13,12,'#2d6a4f'], [95,47,14,13,'#1a472a'],
                      [110,52,13,12,'#2d6a4f'], [124,58,11,10,'#40916c'],
                      [75,63,13,10,'#52b788'], [90,61,13,11,'#2d6a4f'], [105,64,12,10,'#40916c'],
                    ].map(([x,y,w,h,c], i) => (
                      <rect key={i} x={x} y={y} width={w} height={h} rx="1" fill={c} opacity="0.45"/>
                    ))}
                    {/* Pin marker */}
                    <circle cx="95" cy="45" r="4" fill="#ef4444" stroke="#fff" strokeWidth="1.5"/>
                    <circle cx="95" cy="45" r="1.5" fill="#fff"/>
                    {/* Scale bar */}
                    <line x1="155" y1="108" x2="205" y2="108" stroke="#555" strokeWidth="0.8"/>
                    <line x1="155" y1="106" x2="155" y2="110" stroke="#555" strokeWidth="0.8"/>
                    <line x1="205" y1="106" x2="205" y2="110" stroke="#555" strokeWidth="0.8"/>
                    <text x="180" y="106" textAnchor="middle" fontSize="5.5" fill="#555">2 km</text>
                    {/* Coordinates label */}
                    <rect x="3" y="3" width="62" height="12" rx="2" fill="rgba(255,255,255,0.85)"/>
                    <text x="6" y="11" fontSize="5.5" fill="#555">61.4978N, 23.7610E</text>
                    {/* NDVI legend */}
                    <rect x="3" y="100" width="50" height="16" rx="2" fill="rgba(255,255,255,0.85)"/>
                    <text x="6" y="108" fontSize="4.5" fill="#555">NDVI</text>
                    <rect x="22" y="104" width="6" height="6" rx="1" fill="#52b788" opacity="0.7"/>
                    <text x="30" y="109" fontSize="4" fill="#666">0.5</text>
                    <rect x="35" y="104" width="6" height="6" rx="1" fill="#1a472a" opacity="0.7"/>
                    <text x="43" y="109" fontSize="4" fill="#666">0.9</text>
                  </svg>
                </div>
                {/* Stats column */}
                <div style={{ flex: '1 1 45%', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div className="landing-mock-stats-row" style={{ display: 'flex', gap: '6px' }}>
                    <div style={s.mockStatCompact}>
                      <div style={s.mockStatLabel}>Area</div>
                      <div style={s.mockStatNum}>247 ha</div>
                    </div>
                    <div style={s.mockStatCompact}>
                      <div style={s.mockStatLabel}>Biomass</div>
                      <div style={s.mockStatNum}>142 t/ha</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <div style={s.mockStatCompact}>
                      <div style={s.mockStatLabel}>Carbon Stock</div>
                      <div style={s.mockStatNum}>8,640 tCO{'\u2082'}</div>
                    </div>
                    <div style={s.mockStatCompact}>
                      <div style={s.mockStatLabel}>Est. Trees</div>
                      <div style={s.mockStatNum}>186,200</div>
                    </div>
                  </div>
                  <div style={{ ...s.mockStatCompact, background: 'rgba(45,106,79,0.08)', border: '1px solid rgba(45,106,79,0.2)' }}>
                    <div style={s.mockStatLabel}>Timber Value</div>
                    <div style={{ ...s.mockStatNum, color: '#16a34a', fontSize: '15px' }}>{'\u20AC'}1.24M</div>
                  </div>
                  <div style={{ ...s.mockStatCompact, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
                    <div style={s.mockStatLabel}>CO{'\u2082'} Sequestered/yr</div>
                    <div style={{ ...s.mockStatNum, color: '#2563eb' }}>432 t/yr</div>
                  </div>
                </div>
              </div>

              {/* Biomass growth curve + optimal harvest */}
              <div style={s.mockChartWide}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <div style={s.mockChartLabel}>Biomass Growth & Optimal Harvest Window</div>
                  <div style={{ fontSize: '9px', color: colors.gray500, display: 'flex', gap: '10px' }}>
                    <span><span style={{ display: 'inline-block', width: 8, height: 3, background: colors.medGreen, borderRadius: 2, marginRight: 3, verticalAlign: 'middle' }}/>Biomass</span>
                    <span><span style={{ display: 'inline-block', width: 8, height: 3, background: '#60a5fa', borderRadius: 2, marginRight: 3, verticalAlign: 'middle' }}/>NPV</span>
                  </div>
                </div>
                <svg viewBox="0 0 320 90" style={{ width: '100%', height: 'auto', display: 'block' }}>
                  <defs>
                    <linearGradient id="biomassGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={colors.medGreen} stopOpacity="0.3"/>
                      <stop offset="100%" stopColor={colors.medGreen} stopOpacity="0.02"/>
                    </linearGradient>
                    <linearGradient id="npvGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.2"/>
                      <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.02"/>
                    </linearGradient>
                  </defs>
                  {/* Grid lines */}
                  {[20, 40, 60].map(y => (
                    <line key={y} x1="25" y1={y} x2="310" y2={y} stroke={colors.gray200} strokeWidth="0.5" strokeDasharray="3,3"/>
                  ))}
                  {/* Y-axis labels */}
                  <text x="22" y="22" textAnchor="end" fontSize="6" fill={colors.gray500}>200</text>
                  <text x="22" y="42" textAnchor="end" fontSize="6" fill={colors.gray500}>150</text>
                  <text x="22" y="62" textAnchor="end" fontSize="6" fill={colors.gray500}>100</text>
                  {/* X-axis year labels */}
                  {['2016','2018','2020','2022','2024','2026','2028','2030','2032','2034'].map((yr, i) => (
                    <text key={yr} x={25 + i * 31.7} y="85" textAnchor="middle" fontSize="6" fill={colors.gray500}>{yr}</text>
                  ))}
                  {/* Biomass growth area fill */}
                  <path d="M25,68 C50,65 75,58 100,50 C125,43 150,37 175,32 C200,28 225,25 250,23 C270,22 290,21.5 310,21 L310,75 L25,75 Z" fill="url(#biomassGrad)"/>
                  {/* Biomass growth curve (S-curve) */}
                  <path d="M25,68 C50,65 75,58 100,50 C125,43 150,37 175,32 C200,28 225,25 250,23 C270,22 290,21.5 310,21" fill="none" stroke={colors.medGreen} strokeWidth="2" strokeLinecap="round"/>
                  {/* NPV curve (peaks then declines) */}
                  <path d="M25,70 C50,62 75,48 100,38 C125,30 150,25 175,22 C195,20 210,19.5 225,20 C250,22 275,28 310,40" fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="4,2"/>
                  {/* NPV area fill */}
                  <path d="M25,70 C50,62 75,48 100,38 C125,30 150,25 175,22 C195,20 210,19.5 225,20 C250,22 275,28 310,40 L310,75 L25,75 Z" fill="url(#npvGrad)"/>
                  {/* Optimal harvest marker */}
                  <line x1="215" y1="12" x2="215" y2="75" stroke="#f59e0b" strokeWidth="1.2" strokeDasharray="3,2"/>
                  <circle cx="215" cy="19.5" r="3" fill="#f59e0b" stroke="#fff" strokeWidth="1"/>
                  {/* Optimal harvest label */}
                  <rect x="185" y="5" width="60" height="11" rx="3" fill="#f59e0b" opacity="0.9"/>
                  <text x="215" y="12.5" textAnchor="middle" fontSize="6.5" fill="#fff" fontWeight="bold">Harvest 2031</text>
                  {/* Current year marker */}
                  <line x1="152" y1="28" x2="152" y2="75" stroke={colors.gray500} strokeWidth="0.7" strokeDasharray="2,2"/>
                  <text x="152" y="79" textAnchor="middle" fontSize="5.5" fill={colors.gray500}>Now</text>
                </svg>
              </div>

              {/* Bottom row: three mini charts */}
              <div style={s.mockCharts}>
                <div style={s.mockChart}>
                  <div style={s.mockChartLabel}>NDVI Trend (10yr)</div>
                  <svg viewBox="0 0 140 45" style={{ width: '100%', height: 'auto', display: 'block' }}>
                    <path d="M5,38 C15,35 25,30 35,32 C45,34 55,26 65,22 C75,18 85,20 95,16 C105,13 115,14 125,10 C130,8 135,7 138,6" fill="none" stroke={colors.lightGreen} strokeWidth="1.5" strokeLinecap="round"/>
                    <path d="M5,38 C15,35 25,30 35,32 C45,34 55,26 65,22 C75,18 85,20 95,16 C105,13 115,14 125,10 C130,8 135,7 138,6 L138,42 L5,42 Z" fill={colors.lightGreen} opacity="0.15"/>
                    {[[5,38],[20,33],[35,32],[50,28],[65,22],[80,19],[95,16],[110,13.5],[125,10],[138,6]].map(([x,y],i) => (
                      <circle key={i} cx={x} cy={y} r="2" fill={colors.medGreen} stroke="#fff" strokeWidth="0.7"/>
                    ))}
                    <text x="5" y="8" fontSize="7" fill={colors.medGreen} fontWeight="bold">+0.14</text>
                    <text x="25" y="8" fontSize="5" fill={colors.gray500}>avg/decade</text>
                  </svg>
                </div>
                <div style={s.mockChart}>
                  <div style={s.mockChartLabel}>Species & Harvest NPV</div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', height: '36px' }}>
                    {[
                      { label: 'Pine', pct: 62, color: colors.darkGreen, npv: '\u20AC847k' },
                      { label: 'Spruce', pct: 28, color: colors.lightGreen, npv: '\u20AC312k' },
                      { label: 'Birch', pct: 10, color: colors.paleGreen, npv: '\u20AC82k' },
                    ].map((sp, i) => (
                      <div key={i} style={{ flex: sp.pct, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                        <span style={{ fontSize: '6px', color: colors.gray500, fontWeight: '600' }}>{sp.npv}</span>
                        <div style={{
                          width: '100%',
                          height: `${sp.pct * 0.45}px`,
                          background: sp.color,
                          borderRadius: '2px 2px 0 0',
                          minHeight: '6px',
                        }}/>
                        <span style={{ fontSize: '6px', color: colors.gray500 }}>{sp.label} {sp.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" style={s.section}>
        <div style={s.sectionInner}>
          <h2 className="landing-section-title" style={s.sectionTitle}>Comprehensive Forest Intelligence</h2>
          <p style={s.sectionSub}>
            Everything you need to understand, manage, and protect your forest assets.
          </p>
          <div style={s.featuresGrid}>
            {features.map((f, i) => (
              <div key={i} style={s.featureCard}>
                <div style={s.featureIcon}>{f.icon}</div>
                <h3 style={s.featureTitle}>{f.title}</h3>
                <p style={s.featureDesc}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" style={{ ...s.section, background: colors.offWhite }}>
        <div style={s.sectionInner}>
          <h2 className="landing-section-title" style={s.sectionTitle}>Simple, Transparent Pricing</h2>
          <p style={s.sectionSub}>Start free, upgrade when you need real satellite data.</p>
          <div style={s.pricingGrid}>
            {/* Free */}
            <div style={s.pricingCard}>
              <h3 style={s.pricingName}>Free</h3>
              <div style={s.pricingPrice}>
                <span style={s.priceAmount}>{'\u20AC'}0</span>
                <span style={s.pricePeriod}>/forever</span>
              </div>
              <ul style={s.pricingFeatures}>
                <li style={s.pricingFeature}>{'\u2713'} Demo with sample Finnish pine forest</li>
                <li style={s.pricingFeature}>{'\u2713'} All analysis modules visible</li>
                <li style={s.pricingFeature}>{'\u2713'} Demo vegetation statistics</li>
                <li style={s.pricingFeature}>{'\u2713'} No account required</li>
              </ul>
              <button
                style={s.pricingBtn}
                onClick={() => navigate('/app')}
                type="button"
              >
                Try Demo
              </button>
            </div>

            {/* Pro */}
            <div className="landing-pricing-card-pro" style={{ ...s.pricingCard, ...s.pricingCardPro }}>
              <div style={s.popularBadge}>Most Popular</div>
              <h3 style={{ ...s.pricingName, color: colors.white }}>Pro</h3>
              <div style={{ ...s.pricingPrice, color: colors.white }}>
                <span style={{ ...s.priceAmount, color: colors.white }}>{'\u20AC'}19</span>
                <span style={{ ...s.pricePeriod, color: 'rgba(255,255,255,0.8)' }}>/month</span>
              </div>
              <ul style={s.pricingFeatures}>
                <li style={{ ...s.pricingFeature, color: 'rgba(255,255,255,0.95)' }}>{'\u2713'} Real Sentinel-2 satellite data</li>
                <li style={{ ...s.pricingFeature, color: 'rgba(255,255,255,0.95)' }}>{'\u2713'} 10m native resolution imagery</li>
                <li style={{ ...s.pricingFeature, color: 'rgba(255,255,255,0.95)' }}>{'\u2713'} Vegetation statistics dashboard</li>
                <li style={{ ...s.pricingFeature, color: 'rgba(255,255,255,0.95)' }}>{'\u2713'} Satellite imagery map overlays</li>
                <li style={{ ...s.pricingFeature, color: 'rgba(255,255,255,0.95)' }}>{'\u2713'} Save up to 10 forests</li>
                <li style={{ ...s.pricingFeature, color: 'rgba(255,255,255,0.95)' }}>{'\u2713'} GeoJSON & statistics export</li>
                <li style={{ ...s.pricingFeature, color: 'rgba(255,255,255,0.95)' }}>{'\u2713'} 100 Sentinel requests/day</li>
              </ul>
              <button
                style={s.pricingBtnPro}
                onClick={() => startCheckout('pro')}
                disabled={checkoutLoading}
                type="button"
              >
                {checkoutLoading ? 'Please wait...' : 'Get Started'}
              </button>
            </div>

            {/* Business */}
            <div style={s.pricingCard}>
              <h3 style={s.pricingName}>Business</h3>
              <div style={s.pricingPrice}>
                <span style={s.priceAmount}>{'\u20AC'}49</span>
                <span style={s.pricePeriod}>/month</span>
              </div>
              <ul style={s.pricingFeatures}>
                <li style={s.pricingFeature}>{'\u2713'} Everything in Pro</li>
                <li style={s.pricingFeature}>{'\u2713'} Unlimited forests</li>
                <li style={s.pricingFeature}>{'\u2713'} PDF report export</li>
                <li style={s.pricingFeature}>{'\u2713'} Full statistics & GeoJSON export</li>
                <li style={s.pricingFeature}>{'\u2713'} 500 Sentinel requests/day</li>
              </ul>
              <button
                style={s.pricingBtn}
                onClick={() => startCheckout('business')}
                disabled={checkoutLoading}
                type="button"
              >
                {checkoutLoading ? 'Please wait...' : 'Get Started'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section style={s.section}>
        <div style={s.sectionInner}>
          <h2 className="landing-section-title" style={s.sectionTitle}>How It Works</h2>
          <p style={s.sectionSub}>From drawing to insights in three simple steps.</p>
          <div style={s.stepsGrid}>
            {[
              { num: '1', title: 'Draw Your Forest', desc: 'Use our interactive map to draw the boundary of your forest area. Works with any size from a small lot to large estates.' },
              { num: '2', title: 'We Fetch Satellite Data', desc: 'Our system retrieves up to 10 years of ESA Sentinel-2 multispectral imagery for your exact location.' },
              { num: '3', title: 'Get Comprehensive Analysis', desc: 'Receive detailed reports on biomass, carbon, timber value, biodiversity, and regulatory compliance in minutes.' },
            ].map((step, i) => (
              <div key={i} style={s.stepCard}>
                <div style={s.stepNum}>{step.num}</div>
                <h3 style={s.stepTitle}>{step.title}</h3>
                <p style={s.stepDesc}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" style={{ ...s.section, background: colors.offWhite }}>
        <div style={s.sectionInner}>
          <h2 className="landing-section-title" style={s.sectionTitle}>Frequently Asked Questions</h2>
          <div style={s.faqList}>
            {faqData.map((item, i) => (
              <div key={i} style={s.faqItem}>
                <button
                  style={s.faqQuestion}
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  type="button"
                >
                  <span>{item.q}</span>
                  <span style={s.faqArrow}>{openFaq === i ? '\u2212' : '+'}</span>
                </button>
                {openFaq === i && (
                  <div style={s.faqAnswer}>{item.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={s.footer}>
        <div style={s.footerInner}>
          <div style={s.footerBrand}>
            <span style={s.brandIcon}>{'\uD83C\uDF32'}</span> ForestData
          </div>
          <div style={s.footerLinks}>
            <button style={s.footerLink} onClick={() => scrollTo('features')} type="button">Features</button>
            <button style={s.footerLink} onClick={() => scrollTo('pricing')} type="button">Pricing</button>
            <button style={s.footerLink} onClick={() => scrollTo('faq')} type="button">FAQ</button>
            <button style={s.footerLink} onClick={() => navigate('/login')} type="button">Login</button>
          </div>
          <div style={s.footerCopy}>
            {'\u00A9'} {new Date().getFullYear()} ForestData. Forest Biomass Analyzer. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

function buildStyles() {
  return {
    page: {
      fontFamily,
      color: colors.gray900,
      lineHeight: 1.6,
      overflowX: 'hidden',
    },

    /* NAV */
    nav: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      background: 'rgba(255,255,255,0.97)',
      backdropFilter: 'blur(8px)',
      borderBottom: `1px solid ${colors.gray200}`,
      zIndex: 1000,
    },
    navInner: {
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '0 24px',
      height: '64px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    brand: {
      fontSize: '20px',
      fontWeight: '700',
      color: colors.darkGreen,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    brandIcon: {
      fontSize: '24px',
    },
    hamburger: {
      display: 'none',
      background: 'none',
      border: 'none',
      fontSize: '24px',
      cursor: 'pointer',
      color: colors.gray700,
      padding: '4px',
    },
    navLinks: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    navLinksMobile: {},
    navLink: {
      background: 'none',
      border: 'none',
      color: colors.gray700,
      fontSize: '15px',
      cursor: 'pointer',
      padding: '8px 12px',
      borderRadius: '6px',
      fontFamily,
    },
    navLoginBtn: {
      background: 'none',
      border: `1px solid ${colors.gray200}`,
      color: colors.gray700,
      fontSize: '14px',
      cursor: 'pointer',
      padding: '7px 16px',
      borderRadius: '6px',
      fontFamily,
      marginLeft: '8px',
    },
    navCta: {
      background: colors.darkGreen,
      border: 'none',
      color: colors.white,
      fontSize: '14px',
      fontWeight: '600',
      cursor: 'pointer',
      padding: '8px 18px',
      borderRadius: '6px',
      fontFamily,
    },

    /* HERO */
    hero: {
      paddingTop: '120px',
      paddingBottom: '80px',
      background: `linear-gradient(160deg, ${colors.white} 0%, ${colors.offWhite} 100%)`,
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '48px',
      padding: '120px 24px 80px',
      maxWidth: '1200px',
      margin: '0 auto',
    },
    heroContent: {
      flex: '1 1 400px',
      maxWidth: '540px',
    },
    heroTitle: {
      fontSize: '48px',
      fontWeight: '800',
      lineHeight: 1.1,
      color: colors.darkGreen,
      margin: '0 0 20px 0',
    },
    heroSub: {
      fontSize: '18px',
      color: colors.gray500,
      margin: '0 0 32px 0',
      lineHeight: 1.6,
    },
    heroBtns: {
      display: 'flex',
      gap: '12px',
      flexWrap: 'wrap',
    },
    heroCtaPrimary: {
      background: colors.darkGreen,
      color: colors.white,
      border: 'none',
      padding: '14px 28px',
      fontSize: '16px',
      fontWeight: '600',
      borderRadius: '8px',
      cursor: 'pointer',
      fontFamily,
    },
    heroCtaSecondary: {
      background: 'transparent',
      color: colors.darkGreen,
      border: `2px solid ${colors.darkGreen}`,
      padding: '12px 28px',
      fontSize: '16px',
      fontWeight: '600',
      borderRadius: '8px',
      cursor: 'pointer',
      fontFamily,
    },
    heroVisual: {
      flex: '1 1 440px',
      maxWidth: '520px',
    },

    /* DASHBOARD MOCK */
    dashboardMock: {
      background: colors.white,
      borderRadius: '12px',
      boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
      overflow: 'hidden',
      border: `1px solid ${colors.gray200}`,
    },
    mockBar: {
      background: colors.gray100,
      padding: '10px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      borderBottom: `1px solid ${colors.gray200}`,
    },
    mockDot: (color) => ({
      width: '10px',
      height: '10px',
      borderRadius: '50%',
      background: color,
      display: 'inline-block',
    }),
    mockBarTitle: {
      fontSize: '12px',
      color: colors.gray500,
      marginLeft: '8px',
    },
    mockBody: {
      padding: '14px',
    },
    mockStatsRow: {
      display: 'flex',
      gap: '8px',
      marginBottom: '10px',
    },
    mockStatCompact: {
      flex: 1,
      background: colors.gray100,
      borderRadius: '6px',
      padding: '6px 8px',
      textAlign: 'center',
    },
    mockChartWide: {
      background: colors.gray100,
      borderRadius: '8px',
      padding: '10px 10px 4px',
      marginBottom: '10px',
    },
    mockCharts: {
      display: 'flex',
      gap: '10px',
    },
    mockChart: {
      flex: 1,
      background: colors.gray100,
      borderRadius: '8px',
      padding: '10px',
    },
    mockChartLabel: {
      fontSize: '10px',
      color: colors.gray500,
      marginBottom: '4px',
      fontWeight: '600',
    },
    mockStatNum: {
      fontSize: '13px',
      fontWeight: '700',
      color: colors.darkGreen,
    },
    mockStatLabel: {
      fontSize: '9px',
      color: colors.gray500,
      marginBottom: '1px',
    },

    /* SECTIONS */
    section: {
      padding: '80px 24px',
    },
    sectionInner: {
      maxWidth: '1100px',
      margin: '0 auto',
    },
    sectionTitle: {
      fontSize: '36px',
      fontWeight: '800',
      textAlign: 'center',
      color: colors.darkGreen,
      margin: '0 0 12px 0',
    },
    sectionSub: {
      fontSize: '17px',
      color: colors.gray500,
      textAlign: 'center',
      margin: '0 0 48px 0',
    },

    /* FEATURES */
    featuresGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
      gap: '24px',
    },
    featureCard: {
      background: colors.white,
      borderRadius: '12px',
      padding: '28px',
      border: `1px solid ${colors.gray200}`,
      transition: 'box-shadow 0.2s',
    },
    featureIcon: {
      fontSize: '32px',
      marginBottom: '12px',
    },
    featureTitle: {
      fontSize: '18px',
      fontWeight: '700',
      color: colors.gray900,
      margin: '0 0 8px 0',
    },
    featureDesc: {
      fontSize: '14px',
      color: colors.gray500,
      margin: 0,
      lineHeight: 1.6,
    },

    /* PRICING */
    pricingGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: '24px',
      alignItems: 'start',
    },
    pricingCard: {
      background: colors.white,
      borderRadius: '12px',
      padding: '32px',
      border: `1px solid ${colors.gray200}`,
      textAlign: 'center',
      position: 'relative',
    },
    pricingCardPro: {
      background: `linear-gradient(135deg, ${colors.darkGreen} 0%, ${colors.medGreen} 100%)`,
      border: 'none',
      transform: 'scale(1.04)',
      boxShadow: '0 12px 40px rgba(26,71,42,0.3)',
    },
    popularBadge: {
      position: 'absolute',
      top: '-12px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: '#eab308',
      color: '#78350f',
      fontSize: '12px',
      fontWeight: '700',
      padding: '4px 16px',
      borderRadius: '20px',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
    },
    pricingName: {
      fontSize: '20px',
      fontWeight: '700',
      margin: '0 0 8px 0',
      color: colors.gray900,
    },
    pricingPrice: {
      margin: '0 0 24px 0',
    },
    priceAmount: {
      fontSize: '40px',
      fontWeight: '800',
      color: colors.darkGreen,
    },
    pricePeriod: {
      fontSize: '15px',
      color: colors.gray500,
    },
    pricingFeatures: {
      listStyle: 'none',
      padding: 0,
      margin: '0 0 28px 0',
      textAlign: 'left',
    },
    pricingFeature: {
      fontSize: '14px',
      color: colors.gray700,
      padding: '6px 0',
    },
    pricingBtn: {
      width: '100%',
      padding: '12px',
      fontSize: '15px',
      fontWeight: '600',
      background: colors.darkGreen,
      color: colors.white,
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      fontFamily,
    },
    pricingBtnPro: {
      width: '100%',
      padding: '12px',
      fontSize: '15px',
      fontWeight: '600',
      background: colors.white,
      color: colors.darkGreen,
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      fontFamily,
    },

    /* HOW IT WORKS */
    stepsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
      gap: '32px',
    },
    stepCard: {
      textAlign: 'center',
      padding: '24px',
    },
    stepNum: {
      width: '48px',
      height: '48px',
      borderRadius: '50%',
      background: `linear-gradient(135deg, ${colors.darkGreen}, ${colors.medGreen})`,
      color: colors.white,
      fontSize: '20px',
      fontWeight: '800',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: '16px',
    },
    stepTitle: {
      fontSize: '18px',
      fontWeight: '700',
      color: colors.gray900,
      margin: '0 0 8px 0',
    },
    stepDesc: {
      fontSize: '14px',
      color: colors.gray500,
      margin: 0,
      lineHeight: 1.6,
    },

    /* FAQ */
    faqList: {
      maxWidth: '720px',
      margin: '0 auto',
    },
    faqItem: {
      borderBottom: `1px solid ${colors.gray200}`,
    },
    faqQuestion: {
      width: '100%',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '18px 0',
      background: 'none',
      border: 'none',
      fontSize: '16px',
      fontWeight: '600',
      color: colors.gray900,
      cursor: 'pointer',
      textAlign: 'left',
      fontFamily,
    },
    faqArrow: {
      fontSize: '20px',
      color: colors.gray500,
      marginLeft: '16px',
      flexShrink: 0,
    },
    faqAnswer: {
      padding: '0 0 18px 0',
      fontSize: '15px',
      color: colors.gray500,
      lineHeight: 1.6,
    },

    /* FOOTER */
    footer: {
      background: colors.darkGreen,
      color: colors.white,
      padding: '40px 24px',
    },
    footerInner: {
      maxWidth: '1100px',
      margin: '0 auto',
      textAlign: 'center',
    },
    footerBrand: {
      fontSize: '20px',
      fontWeight: '700',
      marginBottom: '16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
    },
    footerLinks: {
      display: 'flex',
      justifyContent: 'center',
      gap: '24px',
      marginBottom: '20px',
      flexWrap: 'wrap',
    },
    footerLink: {
      background: 'none',
      border: 'none',
      color: 'rgba(255,255,255,0.75)',
      fontSize: '14px',
      cursor: 'pointer',
      fontFamily,
      padding: 0,
    },
    footerCopy: {
      fontSize: '13px',
      color: 'rgba(255,255,255,0.5)',
    },
  };
}
