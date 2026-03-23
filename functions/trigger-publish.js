const fetch = require('node-fetch');
const schedule = require('./content-schedule.json');

// Manual trigger — POST /api/trigger-publish
// Body: { "date": "2026-03-24" } to publish a specific day
// Or: { "id": 1 } to publish a specific item
// Requires ADMIN_PASSWORD in Authorization header

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  // Auth check
  const adminPassword = process.env.ADMIN_PASSWORD;
  const authHeader = event.headers.authorization;
  if (adminPassword && authHeader !== `Bearer ${adminPassword}`) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  const personUrn = process.env.LINKEDIN_PERSON_URN;
  const orgTrinity = process.env.LINKEDIN_ORG_TRINITY;
  const orgDream = process.env.LINKEDIN_ORG_DREAMDIV;

  if (!accessToken || !personUrn) {
    return { statusCode: 500, body: 'LinkedIn not configured' };
  }

  const body = JSON.parse(event.body || '{}');
  let items;

  if (body.id) {
    items = schedule.filter(item => item.id === body.id);
  } else if (body.date) {
    items = schedule.filter(item => item.date === body.date && item.linkedinText);
  } else {
    return { statusCode: 400, body: 'Provide "date" or "id"' };
  }

  if (items.length === 0) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'No matching items found' }),
    };
  }

  const results = [];

  for (const item of items) {
    if (!item.linkedinText) {
      results.push({ itemId: item.id, title: item.title, success: false, error: 'No LinkedIn text' });
      continue;
    }

    const targets = [];
    targets.push({ type: 'personal', author: `urn:li:person:${personUrn}` });

    if (orgTrinity && ['trinity', 'calibrate', 'forge', 'cross'].includes(item.brand)) {
      targets.push({ type: 'org-trinity', author: `urn:li:organization:${orgTrinity}` });
    }
    if (orgDream && ['dream', 'cross'].includes(item.brand)) {
      targets.push({ type: 'org-dream', author: `urn:li:organization:${orgDream}` });
    }

    for (const target of targets) {
      const postBody = {
        author: target.author,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: item.linkedinText },
            shareMediaCategory: item.cta ? 'ARTICLE' : 'NONE',
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
      };

      if (item.cta) {
        postBody.specificContent['com.linkedin.ugc.ShareContent'].media = [
          {
            status: 'READY',
            originalUrl: item.cta,
            title: { text: item.title || '' },
            description: { text: '' },
          },
        ];
      }

      try {
        const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
          },
          body: JSON.stringify(postBody),
        });

        const responseText = await res.text();
        let responseData;
        try { responseData = JSON.parse(responseText); } catch { responseData = responseText; }

        results.push({
          itemId: item.id,
          title: item.title,
          target: target.type,
          status: res.status,
          success: res.status === 201,
          postId: responseData?.id || null,
          error: res.status !== 201 ? responseData : null,
        });

        await new Promise(r => setTimeout(r, 2000));
      } catch (err) {
        results.push({
          itemId: item.id,
          title: item.title,
          target: target.type,
          status: 500,
          success: false,
          error: err.message,
        });
      }
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({
      posted: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    }),
  };
};
