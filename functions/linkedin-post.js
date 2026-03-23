const fetch = require('node-fetch');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  // Simple admin auth
  const adminPassword = process.env.ADMIN_PASSWORD;
  const authHeader = event.headers.authorization;
  if (adminPassword && authHeader !== `Bearer ${adminPassword}`) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  const personUrn = process.env.LINKEDIN_PERSON_URN;

  if (!accessToken || !personUrn) {
    return { statusCode: 500, body: 'LinkedIn not configured. Run /api/linkedin-auth first.' };
  }

  const { text, articleUrl, articleTitle, articleDescription, targets } = JSON.parse(event.body);

  // Default targets: personal profile. Can also include org pages.
  const postTargets = targets || ['personal'];

  const results = [];

  for (const target of postTargets) {
    let author;
    if (target === 'personal') {
      author = `urn:li:person:${personUrn}`;
    } else {
      // Organization page - target should be the org ID
      author = `urn:li:organization:${target}`;
    }

    const postBody = {
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: articleUrl ? 'ARTICLE' : 'NONE',
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    };

    // Add article if provided
    if (articleUrl) {
      postBody.specificContent['com.linkedin.ugc.ShareContent'].media = [
        {
          status: 'READY',
          originalUrl: articleUrl,
          title: { text: articleTitle || '' },
          description: { text: articleDescription || '' },
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
        target,
        status: res.status,
        success: res.status === 201,
        data: responseData,
      });
    } catch (err) {
      results.push({
        target,
        status: 500,
        success: false,
        error: err.message,
      });
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ results }),
  };
};
