const fetch = require('node-fetch');
const schedule = require('./content-schedule.json');

// Each post has ONE canonical home, determined by its `tag` field.
// No fan-out — publishing the same post to multiple domains creates duplicate
// content and suppresses indexing on all of them.
const TAG_TO_REPO = {
  'Trinity Forge':     'ktpatrick1-aim/trinity_forge',
  'Trinity Calibrate': 'ktpatrick1-aim/trinity_calibrate',
  'Trinity One':       'ktpatrick1-aim/trinity-one-consulting',
  'Dream Management':  'ktpatrick1-aim/trinity-one-consulting',
  'Human + Machine':   'ktpatrick1-aim/trinity-one-consulting',
  'AI & Automation':   'ktpatrick1-aim/trinity-one-consulting',
  'Culture':           'ktpatrick1-aim/trinity-one-consulting',
  'Dream Dividend':    'ktpatrick1-aim/thedreamdividend',
  'Trinity Cadence':   'ktpatrick1-aim/trinity-cadence-web',
};
const TAG_TO_HOST = {
  'Trinity Forge':     'forge.trinityoneconsulting.com',
  'Trinity Calibrate': 'calibrate.trinityoneconsulting.com',
  'Trinity One':       'trinityoneconsulting.com',
  'Dream Management':  'trinityoneconsulting.com',
  'Human + Machine':   'trinityoneconsulting.com',
  'AI & Automation':   'trinityoneconsulting.com',
  'Culture':           'trinityoneconsulting.com',
  'Dream Dividend':    'thedreamdividend.com',
  'Trinity Cadence':   'cadence.trinityoneconsulting.com',
};
const FALLBACK_REPO = 'ktpatrick1-aim/trinity-one-consulting';
const FALLBACK_HOST = 'trinityoneconsulting.com';

// Returns the canonical public URL for a post, given its tag and slug.
// Root domain uses extensionless pretty URLs; sub-brands use .html.
function canonicalBlogUrl(tag, slug) {
  const host = TAG_TO_HOST[tag] || FALLBACK_HOST;
  const ext = host === 'trinityoneconsulting.com' ? '' : '.html';
  return `https://${host}/blog/${slug}${ext}`;
}

// Rewrites the generic source HTML so its canonical URL, og:url, and
// "Back to Blog" nav link point at the deploy target's actual domain.
// og:url and canonical are inserted if missing — every deployed post gets them.
function canonicalizeHtml(html, tag, slug) {
  const canonicalUrl = canonicalBlogUrl(tag, slug);
  const host = TAG_TO_HOST[tag] || FALLBACK_HOST;
  const ogTag = `<meta property="og:url" content="${canonicalUrl}">`;
  const canonicalTag = `<link rel="canonical" href="${canonicalUrl}">`;

  if (/<meta property="og:url"/.test(html)) {
    html = html.replace(/<meta property="og:url" content="[^"]*">/, ogTag);
  } else {
    html = html.replace(/(<meta name="viewport"[^>]*>)/, `$1\n${ogTag}`);
  }

  if (/<link rel="canonical"/.test(html)) {
    html = html.replace(/<link rel="canonical" href="[^"]*">/, canonicalTag);
  } else {
    html = html.replace(/(<meta name="viewport"[^>]*>)/, `$1\n${canonicalTag}`);
  }

  // "Back to Blog" — rewrite if present, don't invent nav if missing
  html = html.replace(
    /(<a href=")https:\/\/[^/"]+(\/blog\/">\s*←\s*Back to Blog<\/a>)/,
    `$1https://${host}$2`
  );

  return html;
}

// Netlify Scheduled Function — runs daily at 8am ET (12:00 UTC)
exports.handler = async (event) => {
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  const personUrn = process.env.LINKEDIN_PERSON_URN;
  const orgTrinity = process.env.LINKEDIN_ORG_TRINITY;
  const orgDream = process.env.LINKEDIN_ORG_DREAMDIV;
  const githubToken = process.env.GITHUB_TOKEN;

  // Get today in ET
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const today = et.toISOString().split('T')[0];
  console.log(`[scheduled-publish] Running for: ${today}`);

  const dueItems = schedule.filter(item => item.date === today);
  if (dueItems.length === 0) {
    console.log(`[scheduled-publish] Nothing due for ${today}`);
    return { statusCode: 200, body: JSON.stringify({ date: today, posted: 0 }) };
  }

  console.log(`[scheduled-publish] ${dueItems.length} items due`);
  const results = [];

  for (const item of dueItems) {
    // ── BLOG DEPLOY via GitHub API ──
    // Each post has ONE canonical repo, based on its `tag` field. No fan-out.
    if (item.blog && githubToken) {
      const canonicalRepo = TAG_TO_REPO[item.tag] || FALLBACK_REPO;
      if (!TAG_TO_REPO[item.tag]) {
        console.log(`[blog] WARN: unknown tag "${item.tag}" for "${item.title}" — falling back to ${FALLBACK_REPO}`);
      }

      let deploySuccess = false;
      try {
        const deployResult = await deployBlog({
          ...item,
          blog: { ...item.blog, repo: canonicalRepo }
        }, githubToken);
        deployResult.action = 'blog';
        deployResult.repo = canonicalRepo;
        results.push(deployResult);
        deploySuccess = deployResult.success;
        console.log(`[blog] ${deployResult.success ? 'SUCCESS' : 'FAILED'}: ${item.title} → ${canonicalRepo}`);
      } catch (err) {
        results.push({ itemId: item.id, title: item.title, action: 'blog', repo: canonicalRepo, success: false, error: err.message });
        console.log(`[blog] ERROR: ${item.title}: ${err.message}`);
      }

      // Update posts.json on the same canonical repo
      if (deploySuccess) {
        try {
          const postsResult = await updatePostsJson(item, githubToken, canonicalRepo);
          postsResult.action = 'posts-json';
          postsResult.repo = canonicalRepo;
          results.push(postsResult);
          console.log(`[posts-json] ${postsResult.success ? 'SUCCESS' : 'FAILED'}: ${item.title} → ${canonicalRepo}`);
        } catch (err) {
          results.push({ itemId: item.id, title: item.title, action: 'posts-json', repo: canonicalRepo, success: false, error: err.message });
          console.log(`[posts-json] ERROR: ${item.title}: ${err.message}`);
        }
      }
    }

    // ── SOCIAL MEDIA POSTING ──
    // Posts to all configured platforms: LinkedIn (personal + orgs), Facebook Page, Instagram
    if (item.socialText || item.linkedinText) {
      const socialText = item.socialText || item.linkedinText;
      const articleUrl = item.cta || null;

      // LinkedIn — personal profile
      if (accessToken && personUrn) {
        try {
          const liResult = await postToLinkedIn(item, { type: 'personal', author: `urn:li:person:${personUrn}` }, accessToken, socialText);
          results.push(liResult);
          console.log(`[linkedin-personal] ${liResult.success ? 'SUCCESS' : 'FAILED'}: ${item.title}`);
        } catch (err) {
          results.push({ itemId: item.id, title: item.title, action: 'linkedin', target: 'personal', success: false, error: err.message });
        }
      }

      // LinkedIn — org pages
      for (const [orgName, orgId] of [['trinity', orgTrinity], ['dreamdividend', orgDream]]) {
        if (orgId && accessToken) {
          try {
            const orgResult = await postToLinkedIn(item, { type: `org-${orgName}`, author: `urn:li:organization:${orgId}` }, accessToken, socialText);
            results.push(orgResult);
            console.log(`[linkedin-${orgName}] ${orgResult.success ? 'SUCCESS' : 'FAILED'}: ${item.title}`);
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
          console.log(`[facebook-page] ${fbResult.success ? 'SUCCESS' : 'FAILED'}: ${item.title}`);
        } catch (err) {
          results.push({ itemId: item.id, title: item.title, action: 'facebook', target: 'page', success: false, error: err.message });
        }
      }

      // Instagram (requires imageUrl in schedule item)
      const igAccountId = process.env.IG_ACCOUNT_ID;
      const igToken = process.env.IG_PAGE_TOKEN || fbPageToken;
      if (igAccountId && igToken && item.imageUrl) {
        try {
          const igResult = await postToInstagram(item, igAccountId, igToken, socialText, articleUrl);
          results.push(igResult);
          console.log(`[instagram] ${igResult.success ? 'SUCCESS' : 'FAILED'}: ${item.title}`);
        } catch (err) {
          results.push({ itemId: item.id, title: item.title, action: 'instagram', target: 'business', success: false, error: err.message });
        }
      }
    }
  }

  const summary = {
    date: today,
    totalItems: dueItems.length,
    totalActions: results.length,
    successes: results.filter(r => r.success).length,
    failures: results.filter(r => !r.success).length,
    results,
  };

  console.log(`[scheduled-publish] Done: ${summary.successes} succeeded, ${summary.failures} failed`);
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(summary) };
};

// ── Deploy blog HTML via GitHub Contents API ──
async function deployBlog(item, githubToken) {
  const { repo, sourceFile, destPath } = item.blog;

  // 1. Fetch the source HTML from the content-hub repo
  const sourceRepo = 'ktpatrick1-aim/dreamcompass-v2';
  const sourcePath = `netlify/trinity-one/content-hub/${sourceFile}`;

  const sourceRes = await fetch(`https://api.github.com/repos/${sourceRepo}/contents/${sourcePath}`, {
    headers: { Authorization: `token ${githubToken}`, Accept: 'application/vnd.github.v3+json' },
  });

  if (!sourceRes.ok) {
    const err = await sourceRes.text();
    return { itemId: item.id, title: item.title, action: 'blog', success: false, error: `Source fetch failed: ${sourceRes.status} ${err}` };
  }

  const sourceData = await sourceRes.json();

  // Rewrite og:url, canonical, and "Back to Blog" link to match the
  // canonical deploy destination. Source files stay generic.
  const rawHtml = Buffer.from(sourceData.content, 'base64').toString('utf-8');
  const slug = destPath.replace(/^blog\//, '').replace(/\.html$/, '');
  const rewritten = canonicalizeHtml(rawHtml, item.tag, slug);
  const content = Buffer.from(rewritten, 'utf-8').toString('base64');

  // 2. Check if dest file already exists (need SHA to update)
  let existingSha = null;
  const checkRes = await fetch(`https://api.github.com/repos/${repo}/contents/${destPath}`, {
    headers: { Authorization: `token ${githubToken}`, Accept: 'application/vnd.github.v3+json' },
  });
  if (checkRes.ok) {
    const existing = await checkRes.json();
    existingSha = existing.sha;
  }

  // 3. Create or update the file
  const putBody = {
    message: `Publish: ${item.title}`,
    content: content,
    branch: 'main',
  };
  if (existingSha) putBody.sha = existingSha;

  const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${destPath}`, {
    method: 'PUT',
    headers: {
      Authorization: `token ${githubToken}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(putBody),
  });

  if (!putRes.ok) {
    const err = await putRes.text();
    return { itemId: item.id, title: item.title, action: 'blog', success: false, error: `Deploy failed: ${putRes.status} ${err}` };
  }

  const putData = await putRes.json();
  return {
    itemId: item.id,
    title: item.title,
    action: 'blog',
    success: true,
    repo: repo,
    path: destPath,
    commitSha: putData.commit?.sha,
  };
}

// ── Update posts.json on the hub repo ──
async function updatePostsJson(item, githubToken, repoOverride) {
  const repo = repoOverride || 'ktpatrick1-aim/trinity-one-consulting';
  const filePath = 'blog/posts.json';

  // 1. Fetch current posts.json
  const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
    headers: { Authorization: `token ${githubToken}`, Accept: 'application/vnd.github.v3+json' },
  });

  let posts = [];
  let existingSha = null;

  if (getRes.ok) {
    const fileData = await getRes.json();
    existingSha = fileData.sha;
    const decoded = Buffer.from(fileData.content, 'base64').toString('utf-8');
    posts = JSON.parse(decoded);
  }

  // 2. Build new post entry from schedule item metadata
  const slug = item.blog.destPath.replace('blog/', '').replace('.html', '');
  const newPost = {
    slug: slug,
    title: item.title,
    excerpt: item.excerpt || '',
    tag: item.tag || '',
    date: item.date,
    readTime: item.readTime || '5 min',
    icon: item.icon || '📝',
  };

  // 3. Remove duplicate if exists, then prepend (newest first)
  posts = posts.filter(p => p.slug !== slug);
  posts.unshift(newPost);

  // 4. Sort by date descending
  posts.sort((a, b) => b.date.localeCompare(a.date));

  // 5. PUT updated posts.json back
  const content = Buffer.from(JSON.stringify(posts, null, 2) + '\n').toString('base64');
  const putBody = {
    message: `Update posts.json: add ${item.title}`,
    content: content,
    branch: 'main',
  };
  if (existingSha) putBody.sha = existingSha;

  const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
    method: 'PUT',
    headers: {
      Authorization: `token ${githubToken}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(putBody),
  });

  if (!putRes.ok) {
    const err = await putRes.text();
    return { itemId: item.id, title: item.title, action: 'posts-json', success: false, error: `posts.json update failed: ${putRes.status} ${err}` };
  }

  const putData = await putRes.json();
  return {
    itemId: item.id,
    title: item.title,
    action: 'posts-json',
    success: true,
    commitSha: putData.commit?.sha,
  };
}

// ── Post to LinkedIn ──
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

  return {
    itemId: item.id,
    title: item.title,
    action: 'linkedin',
    target: target.type,
    status: res.status,
    success: res.status === 201,
    postId: responseData?.id || null,
    error: res.status !== 201 ? responseData : null,
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
// Two-step: create media container, then publish
async function postToInstagram(item, igAccountId, accessToken, socialText, articleUrl) {
  // Build caption — IG doesn't support clickable links in captions
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
