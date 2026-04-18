// Initiates Facebook/Instagram OAuth flow
// Required permissions:
//   - pages_manage_posts (post to Facebook Pages)
//   - pages_read_engagement (read page info)
//   - instagram_basic (IG account info)
//   - instagram_content_publish (post to Instagram)
//   - business_management (manage connected IG accounts)

exports.handler = async (event) => {
  const clientId = process.env.META_APP_ID;
  const redirectUri = 'https://trinityoneconsulting.com/api/meta-callback';

  const scopes = [
    'pages_manage_posts',
    'pages_read_engagement',
    'instagram_basic',
    'instagram_content_publish',
    'business_management',
  ].join(',');

  const state = Math.random().toString(36).substring(2, 15);

  const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${state}&response_type=code`;

  return {
    statusCode: 302,
    headers: { Location: authUrl },
  };
};
