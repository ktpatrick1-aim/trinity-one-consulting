const fetch = require('node-fetch');
const schedule = require('./content-schedule.json');

// Netlify Scheduled Function — runs daily at 8am ET (12:00 UTC)
// To enable, add to netlify.toml:
//   [functions."scheduled-publish"]
//   schedule = "0 12 * * *"

exports.handler = async (event) => {
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  const personUrn = process.env.LINKEDIN_PERSON_URN;
  const orgTrinity = process.env.LINKEDIN_ORG_TRINITY;
  const orgDream = process.env.LINKEDIN_ORG_DREAMDIV;

  if (!accessToken || !personUrn) {
    console.log('LinkedIn not configured — skipping.');
    return { statusCode: 200, body: 'LinkedIn not configured' };
  }

  // Get today's date in ET (UTC-4 during EDT)
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const today = et.toISOString().split('T')[0]; // YYYY-MM-DD

  console.log(`[scheduled-publish] Running for date: ${today}`);

  // Find items due today that have LinkedIn text
  const dueItems = schedule.filter(item => item.date === today && item.linkedinText);

  if (dueItems.length === 0) {
    console.log(`[scheduled-publish] No items due for ${today}`);
    return { statusCode: 200, body: JSON.stringify({ date: today, posted: 0 }) };
  }

  console.log(`[scheduled-publish] Found ${dueItems.length} items to post`);

  const results = [];

  for (const item of dueItems) {
    // Determine targets based on brand
    const targets = [];

    // Always post to personal
    targets.push({ type: 'personal', author: `urn:li:person:${personUrn}` });

    // Post to Trinity One org page for trinity, calibrate, forge, cross content
    if (orgTrinity && ['trinity', 'calibrate', 'forge', 'cross'].includes(item.brand)) {
      targets.push({ type: 'org-trinity', author: `urn:li:organization:${orgTrinity}` });
    }

    // Post to Dream Dividend org page for dream content
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

      // Add article link if CTA exists
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

        const result = {
          itemId: item.id,
          title: item.title,
          target: target.type,
          status: res.status,
          success: res.status === 201,
          postId: responseData?.id || null,
          error: res.status !== 201 ? responseData : null,
        };

        results.push(result);
        console.log(`[scheduled-publish] ${result.success ? 'SUCCESS' : 'FAILED'}: "${item.title}" → ${target.type} (${res.status})`);

        // Small delay between posts to avoid rate limiting
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
        console.log(`[scheduled-publish] ERROR: "${item.title}" → ${target.type}: ${err.message}`);
      }
    }
  }

  const summary = {
    date: today,
    totalItems: dueItems.length,
    totalPosts: results.length,
    successes: results.filter(r => r.success).length,
    failures: results.filter(r => !r.success).length,
    results,
  };

  console.log(`[scheduled-publish] Summary: ${summary.successes} succeeded, ${summary.failures} failed`);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(summary),
  };
};
