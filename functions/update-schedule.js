const fetch = require('node-fetch');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  const auth = event.headers.authorization || '';
  if (auth !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
    return { statusCode: 401, headers: CORS, body: 'Unauthorized' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: 'Method not allowed' };
  }

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'GITHUB_TOKEN not set' }) };
  }

  const { updates } = JSON.parse(event.body);
  if (!updates || !Array.isArray(updates)) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'No updates provided' }) };
  }

  const repo = 'ktpatrick1-aim/trinity-one-consulting';
  const filePath = 'functions/content-schedule.json';

  try {
    // 1. Fetch current content-schedule.json
    const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
      headers: { Authorization: `token ${githubToken}`, Accept: 'application/vnd.github.v3+json' },
    });

    if (!getRes.ok) {
      const err = await getRes.text();
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: `Failed to fetch schedule: ${err}` }) };
    }

    const fileData = await getRes.json();
    const currentSchedule = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf8'));

    // 2. Update dates by matching on title
    let changed = 0;
    for (const update of updates) {
      const match = currentSchedule.find(item => item.title === update.title);
      if (match && match.date !== update.date) {
        match.date = update.date;
        changed++;
      }
    }

    if (changed === 0) {
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ message: 'No changes to save', changed: 0 }),
      };
    }

    // 3. Write updated schedule back
    const newContent = Buffer.from(JSON.stringify(currentSchedule, null, 2) + '\n').toString('base64');

    const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
      method: 'PUT',
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `Update content schedule: ${changed} date(s) changed via calendar drag-drop`,
        content: newContent,
        sha: fileData.sha,
        branch: 'main',
      }),
    });

    if (!putRes.ok) {
      const err = await putRes.text();
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: `Failed to update: ${err}` }) };
    }

    const putData = await putRes.json();
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ message: 'Schedule updated', changed, commitSha: putData.commit?.sha }),
    };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
