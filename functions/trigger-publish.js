const fetch = require('node-fetch');
const schedule = require('./content-schedule.json');

// Manual trigger — POST /api/trigger-publish
// Body: { "date": "2026-03-24" } or { "id": 2 }
// Requires ADMIN_PASSWORD in Authorization header

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(), body: 'Method not allowed' };
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  const authHeader = event.headers.authorization;
  if (adminPassword && authHeader !== `Bearer ${adminPassword}`) {
    return { statusCode: 401, headers: corsHeaders(), body: 'Unauthorized' };
  }

  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  const personUrn = process.env.LINKEDIN_PERSON_URN;
  const githubToken = process.env.GITHUB_TOKEN;

  const body = JSON.parse(event.body || '{}');
  let items;

  if (body.id) {
    items = schedule.filter(item => item.id === body.id);
  } else if (body.date) {
    items = schedule.filter(item => item.date === body.date);
  } else {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Provide "date" or "id"' }) };
  }

  if (items.length === 0) {
    return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'No matching items' }) };
  }

  const results = [];

  for (const item of items) {
    // Blog deploy — hub first, then sub-brand
    if (item.blog && githubToken) {
      // Step 1: Deploy to trinityoneconsulting.com (the hub)
      try {
        const hubResult = await deployBlog({
          ...item,
          blog: { ...item.blog, repo: 'ktpatrick1-aim/trinity-one-consulting' }
        }, githubToken);
        hubResult.action = 'blog-hub';
        results.push(hubResult);
      } catch (err) {
        results.push({ itemId: item.id, title: item.title, action: 'blog-hub', success: false, error: err.message });
      }

      // Step 2: Fan out to sub-brand repo
      if (item.blog.repo !== 'ktpatrick1-aim/trinity-one-consulting') {
        try {
          const brandResult = await deployBlog(item, githubToken);
          brandResult.action = 'blog-brand';
          results.push(brandResult);
        } catch (err) {
          results.push({ itemId: item.id, title: item.title, action: 'blog-brand', success: false, error: err.message });
        }
      }
    }

    // LinkedIn post
    if (item.linkedinText && accessToken && personUrn) {
      try {
        const r = await postToLinkedIn(item, { type: 'personal', author: `urn:li:person:${personUrn}` }, accessToken);
        results.push(r);
        await new Promise(r => setTimeout(r, 2000));
      } catch (err) {
        results.push({ itemId: item.id, title: item.title, action: 'linkedin', success: false, error: err.message });
      }
    }
  }

  return {
    statusCode: 200,
    headers: corsHeaders(),
    body: JSON.stringify({
      posted: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    }),
  };
};

function corsHeaders() {
  return { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
}

async function deployBlog(item, githubToken) {
  const { repo, sourceFile, destPath } = item.blog;
  const sourceRepo = 'ktpatrick1-aim/dreamcompass-v2';
  const sourcePath = `netlify/trinity-one/content-hub/${sourceFile}`;

  const sourceRes = await fetch(`https://api.github.com/repos/${sourceRepo}/contents/${sourcePath}`, {
    headers: { Authorization: `token ${githubToken}`, Accept: 'application/vnd.github.v3+json' },
  });
  if (!sourceRes.ok) {
    return { itemId: item.id, title: item.title, action: 'blog', success: false, error: `Source fetch: ${sourceRes.status}` };
  }
  const sourceData = await sourceRes.json();

  let existingSha = null;
  const checkRes = await fetch(`https://api.github.com/repos/${repo}/contents/${destPath}`, {
    headers: { Authorization: `token ${githubToken}`, Accept: 'application/vnd.github.v3+json' },
  });
  if (checkRes.ok) existingSha = (await checkRes.json()).sha;

  const putBody = { message: `Publish: ${item.title}`, content: sourceData.content, branch: 'main' };
  if (existingSha) putBody.sha = existingSha;

  const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${destPath}`, {
    method: 'PUT',
    headers: { Authorization: `token ${githubToken}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify(putBody),
  });

  if (!putRes.ok) {
    return { itemId: item.id, title: item.title, action: 'blog', success: false, error: `Deploy: ${putRes.status} ${await putRes.text()}` };
  }

  const putData = await putRes.json();
  return { itemId: item.id, title: item.title, action: 'blog', success: true, repo, path: destPath, commitSha: putData.commit?.sha };
}

async function postToLinkedIn(item, target, accessToken) {
  const postBody = {
    author: target.author,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: item.linkedinText },
        shareMediaCategory: item.cta ? 'ARTICLE' : 'NONE',
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  };

  if (item.cta) {
    postBody.specificContent['com.linkedin.ugc.ShareContent'].media = [
      { status: 'READY', originalUrl: item.cta, title: { text: item.title || '' }, description: { text: '' } },
    ];
  }

  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0' },
    body: JSON.stringify(postBody),
  });

  const responseText = await res.text();
  let responseData;
  try { responseData = JSON.parse(responseText); } catch { responseData = responseText; }

  return {
    itemId: item.id, title: item.title, action: 'linkedin', target: target.type,
    status: res.status, success: res.status === 201,
    postId: responseData?.id || null, error: res.status !== 201 ? responseData : null,
  };
}
