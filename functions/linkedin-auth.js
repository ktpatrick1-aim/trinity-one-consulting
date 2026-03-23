// Initiates LinkedIn OAuth flow
exports.handler = async (event) => {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const redirectUri = `${process.env.URL || 'https://trinity-one-consulting.netlify.app'}/api/linkedin-callback`;
  const scope = 'openid profile email w_member_social w_organization_social rw_organization_admin';
  const state = Math.random().toString(36).substring(2, 15);

  const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}`;

  return {
    statusCode: 302,
    headers: { Location: authUrl },
  };
};
