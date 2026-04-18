const fetch = require('node-fetch');

// ── Unified Social Media Poster ──
// Posts to LinkedIn (personal + org pages), Facebook Page, and Instagram
// in a single call. Used by scheduled-publish and trigger-publish.
//
// POST /api/social-post
// Body: { text, articleUrl, articleTitle, articleDescription, imageUrl, platforms }
// platforms: optional array — defaults to all configured platforms

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(event), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(event), body: 'Method not allowed' };
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  const authHeader = event.headers.authorization;
  if (adminPassword && authHeader !== `Bearer ${adminPassword}`) {
    return { statusCode: 401, headers: corsHeaders(event), body: 'Unauthorized' };
  }

  const body = JSON.parse(event.body || '{}');
  const { text, articleUrl, articleTitle, articleDescription, imageUrl, platforms } = body;

  if (!text) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'text is required' }) };
  }

  const results = [];

  // ── LINKEDIN ──
  const linkedinToken = process.env.LINKEDIN_ACCESS_TOKEN;
  const personUrn = process.env.LINKEDIN_PERSON_URN;
  const orgTrinity = process.env.LINKEDIN_ORG_TRINITY;
  const orgDream = process.env.LINKEDIN_ORG_DREAMDIV;

  if (linkedinToken && personUrn && shouldPost(platforms, 'linkedin')) {
    // Personal profile
    const personalResult = await postLinkedIn({
      accessToken: linkedinToken,
      author: `urn:li:person:${personUrn}`,
      text,
      articleUrl,
      articleTitle,
      articleDescription,
    });
    results.push({ platform: 'linkedin', target: 'personal', ...personalResult });

    // Org pages
    for (const [orgName, orgId] of [['trinity', orgTrinity], ['dreamdividend', orgDream]]) {
      if (orgId) {
        const orgResult = await postLinkedIn({
          accessToken: linkedinToken,
          author: `urn:li:organization:${orgId}`,
          text,
          articleUrl,
          articleTitle,
          articleDescription,
        });
        results.push({ platform: 'linkedin', target: `org-${orgName}`, ...orgResult });
      }
    }
  }

  // ── FACEBOOK PAGE ──
  const fbPageToken = process.env.FB_PAGE_TOKEN;
  const fbPageId = process.env.FB_PAGE_ID;

  if (fbPageToken && fbPageId && shouldPost(platforms, 'facebook')) {
    const fbResult = await postFacebookPage({
      pageId: fbPageId,
      pageToken: fbPageToken,
      text,
      articleUrl,
    });
    results.push({ platform: 'facebook', target: 'page', ...fbResult });
  }

  // ── INSTAGRAM ──
  const igAccountId = process.env.IG_ACCOUNT_ID;
  // Instagram uses the FB page token of the page connected to the IG account
  const igToken = process.env.IG_PAGE_TOKEN || fbPageToken;

  if (igAccountId && igToken && shouldPost(platforms, 'instagram')) {
    // Instagram requires an image. Use provided imageUrl or fall back to OG image from articleUrl.
    const igImageUrl = imageUrl || null;

    if (igImageUrl) {
      const igResult = await postInstagram({
        igAccountId,
        accessToken: igToken,
        imageUrl: igImageUrl,
        caption: buildInstagramCaption(text, articleUrl),
      });
      results.push({ platform: 'instagram', target: 'business', ...igResult });
    } else {
      results.push({
        platform: 'instagram',
        target: 'business',
        success: false,
        error: 'No imageUrl provided — Instagram requires an image for every post. Pass imageUrl in the schedule item or blog OG image.',
      });
    }
  }

  return {
    statusCode: 200,
    headers: corsHeaders(event),
    body: JSON.stringify({
      posted: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    }),
  };
};

// ── Helper: check if platform should be posted to ──
function shouldPost(platforms, name) {
  if (!platforms || platforms.length === 0) return true; // default: all
  return platforms.includes(name);
}

// ── LINKEDIN POST ──
async function postLinkedIn({ accessToken, author, text, articleUrl, articleTitle, articleDescription }) {
  const postBody = {
    author,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text },
        shareMediaCategory: articleUrl ? 'ARTICLE' : 'NONE',
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  };

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
    let data;
    try { data = JSON.parse(responseText); } catch { data = responseText; }

    return { success: res.status === 201, status: res.status, postId: data?.id || null, error: res.status !== 201 ? data : null };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── FACEBOOK PAGE POST ──
async function postFacebookPage({ pageId, pageToken, text, articleUrl }) {
  const params = new URLSearchParams();
  params.append('access_token', pageToken);

  // If there's an article URL, post as a link share (FB auto-pulls OG image/title)
  // If no URL, post as plain text
  if (articleUrl) {
    params.append('message', text);
    params.append('link', articleUrl);
  } else {
    params.append('message', text);
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const data = await res.json();
    return {
      success: !!data.id,
      status: res.status,
      postId: data.id || null,
      error: data.error || null,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── INSTAGRAM POST ──
// Two-step process: 1) Create media container, 2) Publish it
async function postInstagram({ igAccountId, accessToken, imageUrl, caption }) {
  try {
    // Step 1: Create a media container
    const createParams = new URLSearchParams();
    createParams.append('image_url', imageUrl);
    createParams.append('caption', caption);
    createParams.append('access_token', accessToken);

    const createRes = await fetch(`https://graph.facebook.com/v21.0/${igAccountId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: createParams.toString(),
    });

    const createData = await createRes.json();

    if (!createData.id) {
      return { success: false, status: createRes.status, error: createData.error || createData };
    }

    const containerId = createData.id;

    // Step 2: Wait for container to be ready, then publish
    // Instagram needs a moment to process the image
    let ready = false;
    let attempts = 0;
    while (!ready && attempts < 10) {
      const statusRes = await fetch(
        `https://graph.facebook.com/v21.0/${containerId}?fields=status_code&access_token=${accessToken}`
      );
      const statusData = await statusRes.json();

      if (statusData.status_code === 'FINISHED') {
        ready = true;
      } else if (statusData.status_code === 'ERROR') {
        return { success: false, error: `Container processing failed: ${JSON.stringify(statusData)}` };
      } else {
        // Wait 2 seconds before checking again
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
      }
    }

    if (!ready) {
      return { success: false, error: 'Instagram container processing timed out after 20 seconds' };
    }

    // Step 3: Publish the container
    const publishParams = new URLSearchParams();
    publishParams.append('creation_id', containerId);
    publishParams.append('access_token', accessToken);

    const publishRes = await fetch(`https://graph.facebook.com/v21.0/${igAccountId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: publishParams.toString(),
    });

    const publishData = await publishRes.json();

    return {
      success: !!publishData.id,
      status: publishRes.status,
      postId: publishData.id || null,
      error: publishData.error || null,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Build Instagram caption ──
// Instagram doesn't support clickable links in captions, so format accordingly
function buildInstagramCaption(text, articleUrl) {
  let caption = text;
  if (articleUrl) {
    caption += `\n\n🔗 Link in bio`;
  }
  // Instagram caption limit is 2,200 characters
  if (caption.length > 2200) {
    caption = caption.substring(0, 2197) + '...';
  }
  return caption;
}

// ── CORS ──
const ALLOWED_ORIGINS = [
  'https://trinityoneconsulting.com',
  'https://www.trinityoneconsulting.com',
  'https://trinity-one-consulting.netlify.app',
];

function corsHeaders(event) {
  const origin = (event && event.headers && event.headers.origin) || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}
