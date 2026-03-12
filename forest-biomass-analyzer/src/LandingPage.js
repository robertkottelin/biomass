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
    a: 'We use ESA Sentinel-2 multispectral imagery, which provides 10m resolution data with a 5-day revisit time. Our analysis spans up to 10 years of historical data, enabling robust trend analysis and seasonal pattern detection.',
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
            style={s.hamburger}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
            type="button"
          >
            {mobileMenuOpen ? '\u2715' : '\u2630'}
          </button>
          <div style={{ ...s.navLinks, ...(mobileMenuOpen ? s.navLinksMobile : {}) }}>
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
      <section style={s.hero}>
        <div style={s.heroContent}>
          <h1 style={s.heroTitle}>Satellite-Powered Forest Analytics</h1>
          <p style={s.heroSub}>
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
        <div style={s.heroVisual}>
          <div style={s.dashboardMock}>
            <div style={s.mockBar}>
              <span style={s.mockDot('#ef4444')} />
              <span style={s.mockDot('#eab308')} />
              <span style={s.mockDot('#22c55e')} />
              <span style={s.mockBarTitle}>Forest Analysis Dashboard</span>
            </div>
            <div style={s.mockBody}>
              <div style={s.mockMap} />
              <div style={s.mockCharts}>
                <div style={s.mockChart}>
                  <div style={s.mockChartLabel}>NDVI Trend</div>
                  <div style={s.mockChartBars}>
                    {[40, 55, 50, 65, 60, 70, 68, 75, 72, 78].map((h, i) => (
                      <div key={i} style={{ ...s.mockChartBar, height: `${h}%` }} />
                    ))}
                  </div>
                </div>
                <div style={s.mockStats}>
                  <div style={s.mockStat}><div style={s.mockStatNum}>247 ha</div><div style={s.mockStatLabel}>Area</div></div>
                  <div style={s.mockStat}><div style={s.mockStatNum}>0.72</div><div style={s.mockStatLabel}>Avg NDVI</div></div>
                  <div style={s.mockStat}><div style={s.mockStatNum}>142 t/ha</div><div style={s.mockStatLabel}>Biomass</div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" style={s.section}>
        <div style={s.sectionInner}>
          <h2 style={s.sectionTitle}>Comprehensive Forest Intelligence</h2>
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
          <h2 style={s.sectionTitle}>Simple, Transparent Pricing</h2>
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
            <div style={{ ...s.pricingCard, ...s.pricingCardPro }}>
              <div style={s.popularBadge}>Most Popular</div>
              <h3 style={{ ...s.pricingName, color: colors.white }}>Pro</h3>
              <div style={{ ...s.pricingPrice, color: colors.white }}>
                <span style={{ ...s.priceAmount, color: colors.white }}>{'\u20AC'}19</span>
                <span style={{ ...s.pricePeriod, color: 'rgba(255,255,255,0.8)' }}>/month</span>
              </div>
              <ul style={s.pricingFeatures}>
                <li style={{ ...s.pricingFeature, color: 'rgba(255,255,255,0.95)' }}>{'\u2713'} Real Sentinel-2 satellite data</li>
                <li style={{ ...s.pricingFeature, color: 'rgba(255,255,255,0.95)' }}>{'\u2713'} All analysis modules</li>
                <li style={{ ...s.pricingFeature, color: 'rgba(255,255,255,0.95)' }}>{'\u2713'} Save up to 10 forests</li>
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
          <h2 style={s.sectionTitle}>How It Works</h2>
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
          <h2 style={s.sectionTitle}>Frequently Asked Questions</h2>
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
      padding: '16px',
    },
    mockMap: {
      height: '120px',
      borderRadius: '8px',
      background: 'linear-gradient(135deg, #2d6a4f 0%, #40916c 40%, #52b788 70%, #95d5b2 100%)',
      marginBottom: '12px',
      position: 'relative',
      overflow: 'hidden',
    },
    mockCharts: {
      display: 'flex',
      gap: '12px',
    },
    mockChart: {
      flex: 1,
      background: colors.gray100,
      borderRadius: '8px',
      padding: '10px',
    },
    mockChartLabel: {
      fontSize: '11px',
      color: colors.gray500,
      marginBottom: '8px',
      fontWeight: '600',
    },
    mockChartBars: {
      display: 'flex',
      alignItems: 'flex-end',
      gap: '3px',
      height: '50px',
    },
    mockChartBar: {
      flex: 1,
      background: `linear-gradient(to top, ${colors.medGreen}, ${colors.lightGreen})`,
      borderRadius: '2px 2px 0 0',
    },
    mockStats: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
    },
    mockStat: {
      background: colors.gray100,
      borderRadius: '8px',
      padding: '8px 10px',
    },
    mockStatNum: {
      fontSize: '14px',
      fontWeight: '700',
      color: colors.darkGreen,
    },
    mockStatLabel: {
      fontSize: '10px',
      color: colors.gray500,
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
