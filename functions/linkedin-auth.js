// Initiates LinkedIn OAuth flow
exports.handler = async (event) => {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const redirectUri = 'https://trinityoneconsulting.com/api/linkedin-callback';
  const scope = 'openid profile w_member_social';
  const state = Math.random().toString(36).substring(2, 15);

  const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}`;

  return {
    statusCode: 302,
    headers: { Location: authUrl },
  };
};
