// Netlify Function — Trustpilot domain scan via official API
// Endpoint: /.netlify/functions/scan?domain=acme.com
// API key stored as TRUSTPILOT_API_KEY env variable in Netlify.

exports.handler = async (event) => {
  const HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  const API_KEY = process.env.TRUSTPILOT_API_KEY;
  if (!API_KEY) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'API key not configured' }) };
  }

  const raw = event.queryStringParameters?.domain || '';
  const domain = raw
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
    .trim();

  if (!domain) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'domain required' }) };
  }

  const base = 'https://api.trustpilot.com/v1';

  try {
    // ── Step 1: find business unit by domain ────────────────────────
    const findResp = await fetch(
      `${base}/business-units/find?name=${encodeURIComponent(domain)}&apikey=${API_KEY}`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (findResp.status === 404) {
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ found: false, domain }) };
    }
    if (!findResp.ok) {
      return { statusCode: 200, headers: HEADERS,
        body: JSON.stringify({ found: false, domain, httpStatus: findResp.status }) };
    }

    const bu = await findResp.json();
    const buId        = bu.id;
    const totalReviews = bu.numberOfReviews?.total ?? 0;
    const trustScore   = bu.score?.trustScore ?? 0;
    const displayName  = bu.displayName || domain;

    // ── Step 2: latest review → recency in days ─────────────────────
    let lastDaysAgo = null;
    try {
      const revResp = await fetch(
        `${base}/business-units/${buId}/reviews?apikey=${API_KEY}&perPage=1&orderBy=recency`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (revResp.ok) {
        const revData = await revResp.json();
        const latest  = revData.reviews?.[0];
        if (latest?.createdAt) {
          lastDaysAgo = Math.floor((Date.now() - new Date(latest.createdAt).getTime()) / 86400000);
        }
      }
    } catch (_) {}

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({
        found: true,
        domain,
        displayName,
        totalReviews,
        trustScore,
        responseRate: null,   // requires OAuth — rep fills manually
        lastDaysAgo,
      }),
    };

  } catch (e) {
    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ found: false, error: e.message, domain }),
    };
  }
};
