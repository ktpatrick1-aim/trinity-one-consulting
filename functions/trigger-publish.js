const fetch = require('node-fetch');
const schedule = require('./content-schedule.json');

// Manual trigger — POST /api/trigger-publish
// Body: { "date": "2026-03-24" } or { "id": 2 }
// Requires ADMIN_PASSWORD in Authorization header

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

  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  const personUrn = process.env.LINKEDIN_PERSON_URN;
  const githubToken = process.env.GITHUB_TOKEN;

  const body = JSON.parse(event.body || '{}');
  let items;

  if (body.id) {
    items = schedule.filter(item => item.id === body.id);
  } else if (body.date && body.title) {
    items = schedule.filter(item => item.date === body.date && item.title === body.title);
  } else if (body.date) {
    items = schedule.filter(item => item.date === body.date);
  } else {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Provide "date", "id", or "date"+"title"' }) };
  }

  if (items.length === 0) {
    return { statusCode: 404, headers: corsHeaders(event), body: JSON.stringify({ error: 'No matching items' }) };
  }

  const results = [];

  for (const item of items) {
    // Blog deploy — hub first, then sub-brand
    if (item.blog && githubToken) {
      // Step 1: Deploy to trinityoneconsulting.com (the hub)
      let hubSuccess = false;
      try {
        const hubResult = await deployBlog({
          ...item,
          blog: { ...item.blog, repo: 'ktpatrick1-aim/trinity-one-consulting' }
        }, githubToken);
        hubResult.action = 'blog-hub';
        results.push(hubResult);
        hubSuccess = hubResult.success;
      } catch (err) {
        results.push({ itemId: item.id, title: item.title, action: 'blog-hub', success: false, error: err.message });
      }

      // Step 2: Update posts.json so blog index shows the new post
      if (hubSuccess) {
        try {
          const postsResult = await updatePostsJson(item, githubToken);
          results.push(postsResult);
        } catch (err) {
          results.push({ itemId: item.id, title: item.title, action: 'posts-json', success: false, error: err.message });
        }
      }

      // Step 3: Fan out to ALL sub-brand repos
      const allSubBrandRepos = [
        'ktpatrick1-aim/trinity_forge',
        'ktpatrick1-aim/trinity_calibrate',
        'ktpatrick1-aim/thedreamdividend',
        'ktpatrick1-aim/trinity-cadence-web',
      ];
      for (const subRepo of allSubBrandRepos) {
        try {
          const brandResult = await deployBlog({
            ...item,
            blog: { ...item.blog, repo: subRepo }
          }, githubToken);
          brandResult.action = 'blog-' + subRepo.split('/')[1];
          results.push(brandResult);
        } catch (err) {
          results.push({ itemId: item.id, title: item.title, action: 'blog-' + subRepo.split('/')[1], success: false, error: err.message });
        }

        try {
          const subPostsResult = await updatePostsJson(item, githubToken, subRepo);
          subPostsResult.action = 'posts-json-' + subRepo.split('/')[1];
          results.push(subPostsResult);
        } catch (err) {
          results.push({ itemId: item.id, title: item.title, action: 'posts-json-' + subRepo.split('/')[1], success: false, error: err.message });
        }
      }
    }

    // ── SOCIAL MEDIA POSTING ──
    if (item.socialText || item.linkedinText) {
      const socialText = item.socialText || item.linkedinText;
      const articleUrl = item.cta || null;

      // LinkedIn — personal
      if (accessToken && personUrn) {
        try {
          const liResult = await postToLinkedIn(item, { type: 'personal', author: `urn:li:person:${personUrn}` }, accessToken, socialText);
          results.push(liResult);
        } catch (err) {
          results.push({ itemId: item.id, title: item.title, action: 'linkedin', target: 'personal', success: false, error: err.message });
        }
      }

      // LinkedIn — org pages
      const orgTrinity = process.env.LINKEDIN_ORG_TRINITY;
      const orgDream = process.env.LINKEDIN_ORG_DREAMDIV;
      for (const [orgName, orgId] of [['trinity', orgTrinity], ['dreamdividend', orgDream]]) {
        if (orgId && accessToken) {
          try {
            const orgResult = await postToLinkedIn(item, { type: `org-${orgName}`, author: `urn:li:organization:${orgId}` }, accessToken, socialText);
            results.push(orgResult);
          } catch (err) {
            results.push({ itemId: item.id, title: item.title, action: 'linkedin', target: `org-${orgName}`, success: false, error: err.message });
          }
        }
      }

      // Facebook Page
      const fbPageToken = process.env.FB_PAGE_TOKEN;
      const fbPageId = process.env.FB_PAGE_ID;
      if (fbPageToken && fbPageId) {
        try {
          const fbResult = await postToFacebookPage(item, fbPageId, fbPageToken, socialText, articleUrl);
          results.push(fbResult);
        } catch (err) {
          results.push({ itemId: item.id, title: item.title, action: 'facebook', target: 'page', success: false, error: err.message });
        }
      }

      // Instagram
      const igAccountId = process.env.IG_ACCOUNT_ID;
      const igToken = process.env.IG_PAGE_TOKEN || fbPageToken;
      if (igAccountId && igToken && item.imageUrl) {
        try {
          const igResult = await postToInstagram(item, igAccountId, igToken, socialText, articleUrl);
          results.push(igResult);
        } catch (err) {
          results.push({ itemId: item.id, title: item.title, action: 'instagram', target: 'business', success: false, error: err.message });
        }
      }
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

const ALLOWED_ORIGINS = [
  'https://trinityoneconsulting.com',
  'https://www.trinityoneconsulting.com',
  'https://trinity-one-consulting.netlify.app',
];

function corsHeaders(event) {
  const origin = (event && event.headers && event.headers.origin) || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowed, 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
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

async function updatePostsJson(item, githubToken, repoOverride) {
  const repo = repoOverride || 'ktpatrick1-aim/trinity-one-consulting';
  const filePath = 'blog/posts.json';

  const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
    headers: { Authorization: `token ${githubToken}`, Accept: 'application/vnd.github.v3+json' },
  });

  let posts = [];
  let existingSha = null;
  if (getRes.ok) {
    const fileData = await getRes.json();
    existingSha = fileData.sha;
    posts = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf-8'));
  }

  const slug = item.blog.destPath.replace('blog/', '').replace('.html', '');
  const newPost = {
    slug,
    title: item.title,
    excerpt: item.excerpt || '',
    tag: item.tag || '',
    date: item.date,
    readTime: item.readTime || '5 min',
    icon: item.icon || '📝',
  };

  posts = posts.filter(p => p.slug !== slug);
  posts.unshift(newPost);
  posts.sort((a, b) => b.date.localeCompare(a.date));

  const content = Buffer.from(JSON.stringify(posts, null, 2) + '\n').toString('base64');
  const putBody = { message: `Update posts.json: add ${item.title}`, content, branch: 'main' };
  if (existingSha) putBody.sha = existingSha;

  const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
    method: 'PUT',
    headers: { Authorization: `token ${githubToken}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify(putBody),
  });

  if (!putRes.ok) {
    return { itemId: item.id, title: item.title, action: 'posts-json', success: false, error: `posts.json: ${putRes.status}` };
  }
  const putData = await putRes.json();
  return { itemId: item.id, title: item.title, action: 'posts-json', success: true, commitSha: putData.commit?.sha };
}

async function postToLinkedIn(item, target, accessToken, socialText) {
  const text = socialText || item.linkedinText || item.socialText;
  const postBody = {
    author: target.author,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text },
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

// ── Post to Facebook Page ──
async function postToFacebookPage(item, pageId, pageToken, socialText, articleUrl) {
  const params = new URLSearchParams();
  params.append('access_token', pageToken);
  params.append('message', socialText);
  if (articleUrl) {
    params.append('link', articleUrl);
  }

  const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await res.json();
  return {
    itemId: item.id,
    title: item.title,
    action: 'facebook',
    target: 'page',
    success: !!data.id,
    status: res.status,
    postId: data.id || null,
    error: data.error || null,
  };
}

// ── Post to Instagram ──
async function postToInstagram(item, igAccountId, accessToken, socialText, articleUrl) {
  let caption = socialText;
  if (articleUrl) {
    caption += '\n\n\ud83d\udd17 Link in bio';
  }
  if (caption.length > 2200) {
    caption = caption.substring(0, 2197) + '...';
  }

  // Step 1: Create media container
  const createParams = new URLSearchParams();
  createParams.append('image_url', item.imageUrl);
  createParams.append('caption', caption);
  createParams.append('access_token', accessToken);

  const createRes = await fetch(`https://graph.facebook.com/v21.0/${igAccountId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: createParams.toString(),
  });
  const createData = await createRes.json();

  if (!createData.id) {
    return { itemId: item.id, title: item.title, action: 'instagram', target: 'business', success: false, error: createData.error || createData };
  }

  const containerId = createData.id;

  // Step 2: Poll until ready
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
      return { itemId: item.id, title: item.title, action: 'instagram', target: 'business', success: false, error: 'Container processing failed' };
    } else {
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;
    }
  }

  if (!ready) {
    return { itemId: item.id, title: item.title, action: 'instagram', target: 'business', success: false, error: 'Container processing timed out' };
  }

  // Step 3: Publish
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
    itemId: item.id,
    title: item.title,
    action: 'instagram',
    target: 'business',
    success: !!publishData.id,
    status: publishRes.status,
    postId: publishData.id || null,
    error: publishData.error || null,
  };
}
