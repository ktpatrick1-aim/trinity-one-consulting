const fetch = require('node-fetch');

const ALLOWED_ORIGINS = [
  'https://trinityoneconsulting.com',
  'https://www.trinityoneconsulting.com',
  'https://trinity-one-consulting.netlify.app',
];

function getAllowedOrigin(event) {
  const origin = event.headers.origin || '';
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

exports.handler = async (event) => {
  const allowedOrigin = getAllowedOrigin(event);

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Headers': 'Content-Type' },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const headers = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    const { name, email, company, message, interest } = JSON.parse(event.body);

    if (!name || !email) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Name and email are required' }) };
    }

    // Get Zoho access token
    const tokenResponse = await fetch('https://accounts.zoho.com/oauth/v2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: process.env.ZOHO_REFRESH_TOKEN,
        client_id: process.env.ZOHO_CLIENT_ID,
        client_secret: process.env.ZOHO_CLIENT_SECRET,
        grant_type: 'refresh_token'
      })
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      console.error('Zoho token error:', tokenData);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'Thank you! We\'ll be in touch within 24 hours.' })
      };
    }

    // Create lead in Zoho CRM
    const nameParts = name.trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || firstName;

    const interestLabels = {
      'fractional-coo': 'Fractional COO / EOS Integrator',
      'personal-coaching': 'Personal Dream Manager Coaching',
      'dream-manager': 'Dream Manager Program (Organization)',
      'forge': 'Trinity Forge - AI Business Launch',
      'calibrate': 'Trinity Calibrate - AI Optimization',
      'general': 'General Inquiry'
    };

    const leadData = {
      data: [{
        First_Name: firstName,
        Last_Name: lastName || firstName,
        Email: email,
        Company: company || 'Not specified',
        Description: message || '',
        Lead_Source: 'Website',
        Lead_Status: 'New',
        Tag: [{ name: 'Trinity One' }],
        $se_module: 'Leads',
        Source_Detail: 'Trinity One Consulting - Website',
        Service_Interest: interestLabels[interest] || interest || 'General Inquiry'
      }],
      trigger: ['workflow']
    };

    const zohoResponse = await fetch('https://www.zohoapis.com/crm/v5/Leads', {
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${tokenData.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(leadData)
    });

    const zohoResult = await zohoResponse.json();
    console.log('Zoho lead created:', JSON.stringify(zohoResult));

    // Send notification email via SendGrid
    if (process.env.SENDGRID_API_KEY) {
      try {
        await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: process.env.NOTIFICATION_EMAIL || 'kevin@trinityoneconsulting.com' }] }],
            from: { email: 'noreply@trinityoneconsulting.com', name: 'Trinity One Consulting' },
            subject: `New Lead from Trinity One Website: ${name}`,
            content: [{
              type: 'text/html',
              value: `
                <h2>New Lead from Trinity One Consulting Website</h2>
                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Company:</strong> ${company || 'Not provided'}</p>
                <p><strong>Interest:</strong> ${interestLabels[interest] || interest || 'General'}</p>
                <p><strong>Message:</strong> ${message || 'None'}</p>
                <hr>
                <p><em>This lead has been automatically added to Zoho CRM with tag "Trinity One".</em></p>
              `
            }]
          })
        });
      } catch (emailErr) {
        console.error('SendGrid notification error:', emailErr);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: 'Thank you! We\'ll be in touch within 24 hours.' })
    };

  } catch (error) {
    console.error('Submit lead error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Something went wrong. Please try again or email us directly.' })
    };
  }
};
