// Trinity Visitor Tracking — Netlify Edge Function
// Captures visitor IP, resolves company via ipinfo.io, writes to Supabase
// Non-blocking: page loads immediately, tracking happens in background

const SUPABASE_URL = 'https://qypdlkdxdkqvcocqxirr.supabase.co';

export default async function handler(request, context) {
  const response = await context.next();

  // Only track HTML page requests
  const url = new URL(request.url);
  const path = url.pathname;
  const skip = ['.css','.js','.png','.jpg','.jpeg','.gif','.svg','.ico','.xml','.json','.txt','.woff','.woff2','.map','.webp'];
  if (skip.some(ext => path.includes(ext))) return response;

  const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const IPINFO_TOKEN = Deno.env.get('IPINFO_TOKEN');
  const SITE_NAME = Deno.env.get('SITE_NAME') || 'unknown';

  const ip = context.ip || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (!ip || !SUPABASE_KEY) return response;
  if (ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.') || ip === '::1') return response;

  // Fire-and-forget — never block the page
  trackVisitor(ip, path, request.headers, SUPABASE_KEY, IPINFO_TOKEN, SITE_NAME).catch(() => {});

  return response;
}

async function trackVisitor(ip, pagePath, headers, supabaseKey, ipinfoToken, siteName) {
  try {
    let companyName = null, companyDomain = null, country = null, countryCode = null, continent = null, asn = null;

    if (ipinfoToken) {
      const res = await fetch(`https://api.ipinfo.io/lite/${ip}?token=${ipinfoToken}`);
      if (res.ok) {
        const d = await res.json();
        companyName = d.as_name || null;
        companyDomain = d.as_domain || null;
        country = d.country || null;
        countryCode = d.country_code || null;
        continent = d.continent || null;
        asn = d.asn || null;
      }
    }

    await fetch(`${SUPABASE_URL}/rest/v1/site_visitors`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        ip_address: ip,
        site: siteName,
        page_path: pagePath,
        referrer: headers.get('referer') || null,
        user_agent: headers.get('user-agent') || null,
        company_name: companyName,
        company_domain: companyDomain,
        country: country,
        country_code: countryCode,
        continent: continent,
        asn: asn,
      }),
    });
  } catch (err) {
    console.error('Visitor tracking error:', err.message);
  }
}

export const config = { path: '/*' };
