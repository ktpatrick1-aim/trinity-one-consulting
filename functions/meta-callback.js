const fetch = require('node-fetch');

exports.handler = async (event) => {
  const { code } = event.queryStringParameters || {};

  if (!code) {
    return { statusCode: 400, body: 'Missing authorization code' };
  }

  const clientId = process.env.META_APP_ID;
  const clientSecret = process.env.META_APP_SECRET;
  const redirectUri = 'https://trinityoneconsulting.com/api/meta-callback';

  try {
    // 1. Exchange code for short-lived user token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${clientSecret}&code=${code}`
    );
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'text/html' },
        body: `<h1>Error</h1><pre>${JSON.stringify(tokenData, null, 2)}</pre>`,
      };
    }

    // 2. Exchange for long-lived user token (~60 days)
    const longLivedRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${clientId}&client_secret=${clientSecret}&fb_exchange_token=${tokenData.access_token}`
    );
    const longLivedData = await longLivedRes.json();
    const userToken = longLivedData.access_token || tokenData.access_token;
    const expiresIn = longLivedData.expires_in || tokenData.expires_in;

    // 3. Get user's Facebook Pages (page tokens never expire if derived from long-lived user token)
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${userToken}`
    );
    const pagesData = await pagesRes.json();
    const pages = pagesData.data || [];

    // 4. For each page, find connected Instagram Business Account
    const igAccounts = [];
    for (const page of pages) {
      const igRes = await fetch(
        `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
      );
      const igData = await igRes.json();
      if (igData.instagram_business_account) {
        igAccounts.push({
          pageId: page.id,
          pageName: page.name,
          pageToken: page.access_token,
          igAccountId: igData.instagram_business_account.id,
        });
      }
    }

    // Build the results page
    const pagesHtml = pages.map(p => `
      <div style="margin: 12px 0; padding: 12px; background: rgba(0,0,0,0.3); border-radius: 8px;">
        <div class="label">Page: ${p.name}</div>
        <div class="label">FB_PAGE_ID</div>
        <div class="secret" onclick="this.classList.toggle('revealed')">${p.id}</div>
        <div class="label">FB_PAGE_TOKEN</div>
        <div class="secret" onclick="this.classList.toggle('revealed')">${p.access_token}</div>
        <button class="copy-btn" onclick="navigator.clipboard.writeText('${p.access_token}').then(()=>this.textContent='Copied!')">Copy Page Token</button>
      </div>
    `).join('');

    const igHtml = igAccounts.map(ig => `
      <div style="margin: 12px 0; padding: 12px; background: rgba(0,0,0,0.3); border-radius: 8px;">
        <div class="label">Instagram via: ${ig.pageName}</div>
        <div class="label">IG_ACCOUNT_ID</div>
        <div class="value">${ig.igAccountId}</div>
        <div class="label">Uses the page token from: ${ig.pageName}</div>
      </div>
    `).join('') || '<p style="color: rgba(255,255,255,0.5);">No Instagram Business accounts found. Connect an IG Business/Creator account to one of your Facebook Pages first.</p>';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `
<!DOCTYPE html>
<html>
<head><title>Meta Connected</title>
<style>
  body { font-family: system-ui; background: #1a1a2e; color: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 40px; max-width: 700px; }
  h1 { color: #1877F2; margin-bottom: 8px; }
  h2 { color: #E1306C; margin-top: 24px; }
  .secret { background: rgba(0,0,0,0.3); padding: 8px; border-radius: 6px; word-break: break-all; font-family: monospace; font-size: 11px; margin: 4px 0; cursor: pointer; filter: blur(6px); transition: filter 0.2s; }
  .secret.revealed { filter: none; }
  .label { font-size: 11px; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 1px; margin-top: 8px; }
  .value { font-size: 14px; color: #1877F2; margin-bottom: 4px; }
  .warning { color: #D97706; font-size: 13px; margin-top: 20px; }
  .copy-btn { background: #1877F2; color: #fff; border: none; padding: 6px 14px; border-radius: 6px; font-size: 12px; cursor: pointer; margin-top: 4px; }
  .copy-btn:hover { background: #0d5bbf; }
  .hint { font-size: 11px; color: rgba(255,255,255,0.3); }
</style>
</head>
<body>
<div class="card">
  <h1>Facebook Connected!</h1>
  <p>Save these as Netlify environment variables.</p>

  <div class="label">Long-lived User Token (expires ~${Math.round((expiresIn || 5184000) / 86400)} days)</div>
  <div class="secret" onclick="this.classList.toggle('revealed')">${userToken}</div>
  <span class="hint">Click to reveal</span>
  <button class="copy-btn" onclick="navigator.clipboard.writeText('${userToken}').then(()=>this.textContent='Copied!')">Copy User Token</button>

  <h2 style="color: #1877F2;">Facebook Pages</h2>
  ${pagesHtml || '<p style="color: rgba(255,255,255,0.5);">No pages found.</p>'}

  <h2>Instagram Accounts</h2>
  ${igHtml}

  <p class="warning">Page tokens derived from a long-lived user token do not expire. Save them now — this page cannot be regenerated without re-authorizing.</p>

  <h2 style="color: #fff; font-size: 14px;">Netlify Env Vars to Set:</h2>
  <pre style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 8px; font-size: 12px; color: #4ade80;">
META_APP_ID=your_app_id
META_APP_SECRET=your_app_secret
FB_PAGE_ID=page_id_from_above
FB_PAGE_TOKEN=page_token_from_above
IG_ACCOUNT_ID=ig_account_id_from_above
  </pre>
</div>
</body>
</html>`,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html' },
      body: `<h1>Error</h1><pre>${err.message}\n${err.stack}</pre>`,
    };
  }
};
