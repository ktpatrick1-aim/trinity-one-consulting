const fetch = require('node-fetch');
const schedule = require('./content-schedule.json');

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
    // Step 1: Always deploy to trinityoneconsulting.com first (the hub)
    if (item.blog && githubToken) {
      let hubDeploySuccess = false;
      try {
        const hubResult = await deployBlog({
          ...item,
          blog: { ...item.blog, repo: 'ktpatrick1-aim/trinity-one-consulting' }
        }, githubToken);
        hubResult.action = 'blog-hub';
        results.push(hubResult);
        hubDeploySuccess = hubResult.success;
        console.log(`[blog-hub] ${hubResult.success ? 'SUCCESS' : 'FAILED'}: ${item.title} → trinity-one-consulting`);
      } catch (err) {
        results.push({ itemId: item.id, title: item.title, action: 'blog-hub', success: false, error: err.message });
        console.log(`[blog-hub] ERROR: ${item.title}: ${err.message}`);
      }

      // Step 2: Update posts.json on the hub repo after successful deploy
      if (hubDeploySuccess) {
        try {
          const postsResult = await updatePostsJson(item, githubToken);
          results.push(postsResult);
          console.log(`[posts-json] ${postsResult.success ? 'SUCCESS' : 'FAILED'}: ${item.title}`);
        } catch (err) {
          results.push({ itemId: item.id, title: item.title, action: 'posts-json', success: false, error: err.message });
          console.log(`[posts-json] ERROR: ${item.title}: ${err.message}`);
        }
      }

      // Step 3: Fan out to ALL sub-brand repos
      const allSubBrandRepos = [
        'ktpatrick1-aim/trinity_forge',
        'ktpatrick1-aim/trinity_calibrate',
        'ktpatrick1-aim/thedreamdividend',
      ];
      for (const subRepo of allSubBrandRepos) {
        try {
          const brandResult = await deployBlog({
            ...item,
            blog: { ...item.blog, repo: subRepo }
          }, githubToken);
          brandResult.action = 'blog-' + subRepo.split('/')[1];
          results.push(brandResult);
          console.log(`[blog-brand] ${brandResult.success ? 'SUCCESS' : 'FAILED'}: ${item.title} → ${subRepo}`);
        } catch (err) {
          results.push({ itemId: item.id, title: item.title, action: 'blog-' + subRepo.split('/')[1], success: false, error: err.message });
          console.log(`[blog-brand] ERROR: ${item.title}: ${err.message}`);
        }

        try {
          const subPostsResult = await updatePostsJson(item, githubToken, subRepo);
          subPostsResult.action = 'posts-json-' + subRepo.split('/')[1];
          results.push(subPostsResult);
          console.log(`[posts-json-brand] ${subPostsResult.success ? 'SUCCESS' : 'FAILED'}: ${item.title} → ${subRepo}`);
        } catch (err) {
          results.push({ itemId: item.id, title: item.title, action: 'posts-json-' + subRepo.split('/')[1], success: false, error: err.message });
          console.log(`[posts-json-brand] ERROR: ${item.title}: ${err.message}`);
        }
      }
    }

    // ── LINKEDIN POST ──
    if (item.linkedinText && accessToken && personUrn) {
      const targets = [{ type: 'personal', author: `urn:li:person:${personUrn}` }];

      // Post to LinkedIn
      for (const target of targets) {
        try {
          const liResult = await postToLinkedIn(item, target, accessToken);
          results.push(liResult);
          console.log(`[linkedin] ${liResult.success ? 'SUCCESS' : 'FAILED'}: "${item.title}" → ${target.type} (${liResult.status})`);
          await new Promise(r => setTimeout(r, 2000));
        } catch (err) {
          results.push({ itemId: item.id, title: item.title, action: 'linkedin', target: target.type, success: false, error: err.message });
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
  const content = sourceData.content; // Already base64 encoded

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
