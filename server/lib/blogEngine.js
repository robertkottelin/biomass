const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');

const BLOG_DIR = path.resolve(__dirname, '..', '..', 'blog');
const isProduction = process.env.NODE_ENV === 'production';

let cachedPosts = null;

function getAllPosts() {
  if (isProduction && cachedPosts) return cachedPosts;

  const files = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.md'));
  const posts = files.map(file => {
    const raw = fs.readFileSync(path.join(BLOG_DIR, file), 'utf8');
    const { data } = matter(raw);
    return {
      slug: file.replace(/\.md$/, ''),
      title: data.title || file,
      date: data.date || '',
      description: data.description || '',
      keywords: data.keywords || '',
      author: data.author || '',
    };
  });

  posts.sort((a, b) => (b.date > a.date ? 1 : -1));
  if (isProduction) cachedPosts = posts;
  return posts;
}

function getPostBySlug(slug) {
  const safe = path.basename(slug);
  const filePath = path.join(BLOG_DIR, `${safe}.md`);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, 'utf8');
  const { data, content } = matter(raw);
  return {
    slug: safe,
    title: data.title || safe,
    date: data.date || '',
    description: data.description || '',
    keywords: data.keywords || '',
    author: data.author || '',
    html: marked(content),
  };
}

const FONT_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

function nav() {
  return `
  <nav style="position:fixed;top:0;left:0;right:0;background:rgba(255,255,255,0.97);backdrop-filter:blur(8px);border-bottom:1px solid #e5e7eb;z-index:1000;">
    <div style="max-width:1200px;margin:0 auto;padding:0 24px;height:64px;display:flex;align-items:center;justify-content:space-between;">
      <a href="/" style="font-size:20px;font-weight:700;color:#1a472a;text-decoration:none;display:flex;align-items:center;gap:8px;">
        <span style="font-size:24px;">&#127794;</span> ForestData
      </a>
      <div style="display:flex;align-items:center;gap:8px;">
        <a href="/" style="color:#374151;font-size:15px;text-decoration:none;padding:8px 12px;border-radius:6px;">Home</a>
        <a href="/blog" style="color:#374151;font-size:15px;text-decoration:none;padding:8px 12px;border-radius:6px;">Blog</a>
        <a href="/#features" style="color:#374151;font-size:15px;text-decoration:none;padding:8px 12px;border-radius:6px;">Features</a>
        <a href="/#pricing" style="color:#374151;font-size:15px;text-decoration:none;padding:8px 12px;border-radius:6px;">Pricing</a>
        <a href="/#faq" style="color:#374151;font-size:15px;text-decoration:none;padding:8px 12px;border-radius:6px;">FAQ</a>
        <a href="/login" style="background:#1a472a;color:#fff;font-size:14px;font-weight:600;padding:8px 18px;border-radius:6px;text-decoration:none;">Sign Up</a>
      </div>
    </div>
  </nav>`;
}

function footer() {
  return `
  <footer style="background:#1a472a;color:#fff;padding:40px 24px;">
    <div style="max-width:1100px;margin:0 auto;text-align:center;">
      <div style="font-size:20px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;justify-content:center;gap:8px;">
        <span style="font-size:24px;">&#127794;</span> ForestData
      </div>
      <div style="display:flex;justify-content:center;gap:24px;margin-bottom:20px;flex-wrap:wrap;">
        <a href="/" style="color:rgba(255,255,255,0.75);font-size:14px;text-decoration:none;">Home</a>
        <a href="/blog" style="color:rgba(255,255,255,0.75);font-size:14px;text-decoration:none;">Blog</a>
        <a href="/#features" style="color:rgba(255,255,255,0.75);font-size:14px;text-decoration:none;">Features</a>
        <a href="/#pricing" style="color:rgba(255,255,255,0.75);font-size:14px;text-decoration:none;">Pricing</a>
        <a href="/#faq" style="color:rgba(255,255,255,0.75);font-size:14px;text-decoration:none;">FAQ</a>
        <a href="/login" style="color:rgba(255,255,255,0.75);font-size:14px;text-decoration:none;">Login</a>
      </div>
      <div style="font-size:13px;color:rgba(255,255,255,0.5);">
        &copy; ${new Date().getFullYear()} ForestData. Forest Biomass Analyzer. All rights reserved.
      </div>
    </div>
  </footer>`;
}

function renderBlogIndex(posts) {
  const cards = posts.map(p => `
    <a href="/blog/${p.slug}" style="display:block;text-decoration:none;color:inherit;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px;transition:box-shadow 0.2s;">
      <h2 style="font-size:20px;font-weight:700;color:#1a472a;margin:0 0 8px 0;">${p.title}</h2>
      <div style="font-size:13px;color:#6b7280;margin-bottom:12px;">${p.date}${p.author ? ` &middot; ${p.author}` : ''}</div>
      <p style="font-size:15px;color:#374151;margin:0;line-height:1.6;">${p.description}</p>
    </a>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Blog - ForestData</title>
  <meta name="description" content="Articles on satellite forestry, timber valuation, biomass estimation, and forest management.">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; font-family: ${FONT_STACK}; color: #111827; line-height: 1.6; }
    a:hover { opacity: 0.85; }
    nav a:hover { background: #f3f4f6; }
  </style>
</head>
<body>
  ${nav()}
  <main style="max-width:800px;margin:0 auto;padding:100px 24px 80px;">
    <h1 style="font-size:36px;font-weight:800;color:#1a472a;margin:0 0 8px 0;">Blog</h1>
    <p style="font-size:17px;color:#6b7280;margin:0 0 40px 0;">Insights on satellite forestry, timber markets, and data-driven forest management.</p>
    <div style="display:flex;flex-direction:column;gap:20px;">
      ${cards}
    </div>
  </main>
  ${footer()}
</body>
</html>`;
}

function renderBlogPost(post) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${post.title} - ForestData Blog</title>
  <meta name="description" content="${post.description}">
  <meta name="keywords" content="${post.keywords}">
  <meta name="author" content="${post.author}">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; font-family: ${FONT_STACK}; color: #111827; line-height: 1.6; }
    a:hover { opacity: 0.85; }
    nav a:hover { background: #f3f4f6; }
    article h1 { font-size: 36px; font-weight: 800; color: #1a472a; margin: 0 0 12px 0; line-height: 1.15; }
    article h2 { font-size: 24px; font-weight: 700; color: #1a472a; margin: 40px 0 12px 0; }
    article h3 { font-size: 18px; font-weight: 700; color: #374151; margin: 28px 0 8px 0; }
    article p { font-size: 16px; color: #374151; margin: 0 0 16px 0; }
    article ul, article ol { color: #374151; margin: 0 0 16px 0; padding-left: 24px; }
    article li { margin-bottom: 6px; font-size: 16px; }
    article strong { color: #111827; }
    article table { border-collapse: collapse; width: 100%; margin: 0 0 20px 0; }
    article th, article td { border: 1px solid #e5e7eb; padding: 10px 14px; text-align: left; font-size: 14px; }
    article th { background: #f3f4f6; font-weight: 600; color: #374151; }
    article td { color: #374151; }
    article a { color: #1a472a; font-weight: 600; }
    article blockquote { border-left: 3px solid #1a472a; margin: 0 0 16px 0; padding: 8px 16px; background: #f5f7f5; }
    article code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 14px; }
    article pre { background: #f3f4f6; padding: 16px; border-radius: 8px; overflow-x: auto; margin: 0 0 16px 0; }
    article pre code { background: none; padding: 0; }
  </style>
</head>
<body>
  ${nav()}
  <main style="max-width:740px;margin:0 auto;padding:100px 24px 80px;">
    <nav style="position:static;background:none;border:none;backdrop-filter:none;margin-bottom:24px;">
      <a href="/blog" style="color:#6b7280;font-size:14px;text-decoration:none;">&larr; Back to Blog</a>
    </nav>
    <article>
      <div style="font-size:14px;color:#6b7280;margin-bottom:24px;">${post.date}${post.author ? ` &middot; ${post.author}` : ''}</div>
      ${post.html}
    </article>
  </main>
  ${footer()}
</body>
</html>`;
}

module.exports = { getAllPosts, getPostBySlug, renderBlogIndex, renderBlogPost };
