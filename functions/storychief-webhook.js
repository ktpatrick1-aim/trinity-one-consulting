const crypto = require('crypto');
const fetch = require('node-fetch');

const FANOUT_TARGETS = [
  'https://the-dream-dividend.netlify.app/api/storychief-webhook',
  'https://trinity-forge.netlify.app/api/storychief-webhook',
  'https://trinity-calibrate.netlify.app/api/storychief-webhook',
];

const GITHUB_REPO = 'ktpatrick1-aim/trinity-one-consulting';
const GITHUB_BRANCH = 'main';

async function fanOutPayload(originalBody) {
  const results = await Promise.allSettled(
    FANOUT_TARGETS.map(async (url) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-trinity-fanout': 'true',
        },
        body: originalBody,
      });
      return { url, status: res.status };
    })
  );
  results.forEach((r) => {
    if (r.status === 'fulfilled') {
      console.log(`Fan-out to ${r.value.url}: ${r.value.status}`);
    } else {
      console.error(`Fan-out failed for target:`, r.reason);
    }
  });
}

function verifySignature(payload, signature, key) {
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(JSON.stringify(payload));
  return hmac.digest('hex') === signature;
}

function generateMAC(responseObj, key) {
  if (!key) return '';
  // StoryChief expects: HMAC-SHA256 of JSON-encoded response (without mac) using encryption key
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(JSON.stringify(responseObj));
  return hmac.digest('hex');
}

function slugify(text) {
  return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
}

function generateBlogHTML(data) {
  const title = data.title || 'Untitled';
  const content = data.content || '';
  const excerpt = data.excerpt || '';
  const slug = data.seo_slug || slugify(title);
  const featuredImage = data.featured_image ? data.featured_image.data ? data.featured_image.data.url : data.featured_image.url || data.featured_image : '';
  const tags = (data.tags || []).map(t => t.name || t).filter(Boolean);
  const categories = (data.categories || []).map(c => c.name || c).filter(Boolean);
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const tagLabel = categories[0] || tags[0] || 'Article';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | Trinity One Consulting</title>
  <meta name="description" content="${excerpt.replace(/"/g, '&quot;').substring(0, 160)}">
  ${featuredImage ? `<meta property="og:image" content="${featuredImage}">` : ''}
  <meta property="og:title" content="${title}">
  <meta property="og:type" content="article">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../css/styles.css">
</head>
<body>

  <nav class="nav">
    <div class="nav-inner">
      <a href="../" class="nav-logo">
        <img src="../images/logo.png" alt="Trinity One Consulting" class="nav-logo-img">
      </a>
      <ul class="nav-links">
        <li><a href="../#services">Services</a></li>
        <li><a href="../#dream-manager">Dream Manager</a></li>
        <li><a href="../#technology">Technology</a></li>
        <li><a href="../#about">About</a></li>
        <li><a href="./" class="active">Blog</a></li>
        <li><a href="../#contact" class="nav-cta">Get Started</a></li>
      </ul>
      <button class="nav-toggle" aria-label="Toggle navigation">
        <span></span><span></span><span></span>
      </button>
    </div>
  </nav>

  <section class="post-hero">
    <div class="container">
      <a href="./" class="section-label" style="display: inline-block; margin-bottom: 1.5rem;">&larr; Back to Blog</a>
      <div class="blog-tag">${tagLabel}</div>
      <h1 class="section-title" style="margin-top: 0.75rem;">${title}</h1>
      <div class="blog-meta" style="justify-content: center; margin-top: 1rem;">
        <span>${date}</span>
      </div>
    </div>
  </section>

  ${featuredImage ? `<div class="container" style="margin-bottom:2rem;"><img src="${featuredImage}" alt="${title}" style="width:100%; max-height:500px; object-fit:cover; border-radius:12px;"></div>` : ''}

  <article class="post-content container">
    ${content}

    <div style="margin-top: 2.5rem;">
      <a href="../#contact" class="btn btn-primary">Talk to Us About Dream Manager &rarr;</a>
    </div>
  </article>

  <footer class="footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-logo-col">
          <a href="../"><img src="../images/logo.png" alt="Trinity One Consulting" class="footer-logo-img"></a>
        </div>
        <div class="footer-col">
          <h4>Services</h4>
          <ul>
            <li><a href="../#dream-manager">Dream Manager Program</a></li>
            <li><a href="../#technology">Forge</a></li>
            <li><a href="../#technology">Calibrate</a></li>
            <li><a href="../#contact">ERP Consulting</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>Company</h4>
          <ul>
            <li><a href="../#about">About</a></li>
            <li><a href="./">Blog</a></li>
            <li><a href="../#contact">Contact</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>Connect</h4>
          <ul>
            <li><a href="https://www.linkedin.com/company/trinityoneconsulting" target="_blank">LinkedIn</a></li>
            <li><a href="mailto:info@trinityoneconsulting.com">Email Us</a></li>
          </ul>
        </div>
        <div class="footer-col footer-about">
          <p>Helping organizations unlock their people's potential through dream management, intelligent technology, and strategic consulting.</p>
        </div>
      </div>
      <div class="footer-bottom">
        <p>&copy; 2026 Trinity One Consulting. All rights reserved. The Dream Manager Program is based on the work of Matthew Kelly &amp; Floyd Consulting. All rights reserved.</p>
      </div>
    </div>
  </footer>

  <script src="../js/main.js"></script>
</body>
</html>`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const payload = JSON.parse(event.body);
    const encryptionKey = process.env.STORYCHIEF_KEY;

    if (encryptionKey && event.headers['x-storychief-signature']) {
      if (!verifySignature(payload, event.headers['x-storychief-signature'], encryptionKey)) {
        return { statusCode: 401, body: 'Invalid signature' };
      }
    }

    const eventType = payload.meta?.event;
    const data = payload.data;

    if (eventType === 'test') {
      const testResponse = { id: 'test', permalink: 'https://trinity-one-consulting.netlify.app/blog/' };
      testResponse.mac = generateMAC(testResponse, encryptionKey);
      return { statusCode: 200, body: JSON.stringify(testResponse) };
    }

    if (eventType === 'publish' || eventType === 'update') {
      const slug = data.seo_slug || slugify(data.title || 'untitled');
      const html = generateBlogHTML(data);
      const filePath = `blog/${slug}.html`;
      const githubToken = process.env.GITHUB_TOKEN;

      let sha;
      try {
        const existing = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}?ref=${GITHUB_BRANCH}`, {
          headers: { 'Authorization': `token ${githubToken}`, 'Accept': 'application/vnd.github.v3+json' }
        });
        if (existing.ok) {
          const existingData = await existing.json();
          sha = existingData.sha;
        }
      } catch (e) { /* file doesn't exist */ }

      const body = {
        message: `${sha ? 'Update' : 'Add'} blog post: ${data.title}`,
        content: Buffer.from(html).toString('base64'),
        branch: GITHUB_BRANCH,
      };
      if (sha) body.sha = sha;

      const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error('GitHub API error:', err);
        return { statusCode: 500, body: `GitHub error: ${err}` };
      }

      const permalink = `https://trinity-one-consulting.netlify.app/blog/${slug}.html`;

      // Fan-out to downstream sites
      try {
        await fanOutPayload(event.body);
      } catch (e) {
        console.error('Fan-out error (publish/update):', e);
      }

      const publishResponse = { id: slug, permalink };
      publishResponse.mac = generateMAC(publishResponse, encryptionKey);
      return { statusCode: 200, body: JSON.stringify(publishResponse) };
    }

    if (eventType === 'delete') {
      const slug = data.seo_slug || slugify(data.title || 'untitled');
      const filePath = `blog/${slug}.html`;
      const githubToken = process.env.GITHUB_TOKEN;

      const existing = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}?ref=${GITHUB_BRANCH}`, {
        headers: { 'Authorization': `token ${githubToken}`, 'Accept': 'application/vnd.github.v3+json' }
      });

      if (existing.ok) {
        const existingData = await existing.json();
        await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `token ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: `Delete blog post: ${data.title}`,
            sha: existingData.sha,
            branch: GITHUB_BRANCH,
          }),
        });
      }

      // Fan-out to downstream sites
      try {
        await fanOutPayload(event.body);
      } catch (e) {
        console.error('Fan-out error (delete):', e);
      }

      const deleteResponse = { id: slug, permalink: '' };
      deleteResponse.mac = generateMAC(deleteResponse, encryptionKey);
      return { statusCode: 200, body: JSON.stringify(deleteResponse) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (error) {
    console.error('Webhook error:', error);
    return { statusCode: 500, body: `Error: ${error.message}` };
  }
};
