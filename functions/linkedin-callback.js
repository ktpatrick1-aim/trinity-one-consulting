const fetch = require('node-fetch');

exports.handler = async (event) => {
  const { code } = event.queryStringParameters || {};

  if (!code) {
    return { statusCode: 400, body: 'Missing authorization code' };
  }

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  const redirectUri = 'https://trinityoneconsulting.com/api/linkedin-callback';

  try {
    // Exchange code for access token
    const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'text/html' },
        body: `<h1>Error</h1><pre>${JSON.stringify(tokenData, null, 2)}</pre>`,
      };
    }

    // Get user profile to find the person URN
    const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `
<!DOCTYPE html>
<html>
<head><title>LinkedIn Connected</title>
<style>
  body { font-family: system-ui; background: #1a1a2e; color: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 40px; max-width: 600px; text-align: center; }
  h1 { color: #0A66C2; margin-bottom: 16px; }
  .token { background: rgba(0,0,0,0.3); padding: 12px; border-radius: 8px; word-break: break-all; font-family: monospace; font-size: 12px; margin: 16px 0; text-align: left; }
  .label { font-size: 12px; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 1px; margin-top: 16px; }
  .value { font-size: 14px; color: #0A66C2; margin-bottom: 8px; }
  .warning { color: #D97706; font-size: 13px; margin-top: 20px; }
</style>
</head>
<body>
<div class="card">
  <h1>LinkedIn Connected!</h1>
  <p>Save these values as Netlify environment variables:</p>
  <div class="label">LINKEDIN_ACCESS_TOKEN</div>
  <div class="token">${tokenData.access_token}</div>
  <div class="label">LINKEDIN_PERSON_URN</div>
  <div class="value">${profile.sub}</div>
  <div class="label">Token expires in</div>
  <div class="value">${Math.round(tokenData.expires_in / 86400)} days</div>
  <p class="warning">Copy these now — this page cannot be regenerated without re-authorizing.</p>
</div>
</body>
</html>`,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html' },
      body: `<h1>Error</h1><pre>${err.message}</pre>`,
    };
  }
};
