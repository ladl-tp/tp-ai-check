// Netlify Function — Trustpilot domain scan
// Called by the client as /.netlify/functions/scan?domain=acme.com
// Runs server-side: no CORS issues, no Cloudflare challenge interception.

exports.handler = async (event) => {
  const HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  // Normalise domain
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

  const tpUrl = `https://www.trustpilot.com/review/${domain}`;

  try {
    const resp = await fetch(tpUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    // 404 = no profile for this domain
    if (resp.status === 404) {
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ found: false, domain }) };
    }

    if (!resp.ok) {
      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({ found: false, domain, httpStatus: resp.status }),
      };
    }

    const html = await resp.text();

    // ── Strategy 1: __NEXT_DATA__ (most complete) ───────────────────
    const ndMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (ndMatch) {
      try {
        const json = JSON.parse(ndMatch[1]);
        const bu = json?.props?.pageProps?.businessUnit;
        if (bu?.numberOfReviews) {
          const totalReviews = bu.numberOfReviews.total ?? 0;
          const trustScore   = bu.score?.trustScore ?? 0;
          const responseRate =
            bu.responseRate ?? bu.replyStats?.responseRatePercent ?? null;
          const displayName  = bu.displayName || domain;
          const reviews      = json?.props?.pageProps?.reviews ?? [];
          let lastDaysAgo    = null;
          if (reviews.length > 0) {
            const d = reviews[0]?.dates?.publishedDate;
            if (d) lastDaysAgo = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
          }
          return {
            statusCode: 200,
            headers: HEADERS,
            body: JSON.stringify({
              found: true, domain, displayName,
              totalReviews, trustScore, responseRate, lastDaysAgo,
            }),
          };
        }
      } catch (_) {}
    }

    // ── Strategy 2: JSON-LD structured data ─────────────────────────
    const ldRe = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
    let ldMatch;
    while ((ldMatch = ldRe.exec(html)) !== null) {
      try {
        const ld = JSON.parse(ldMatch[1]);
        const ar = ld?.aggregateRating;
        if (ar) {
          return {
            statusCode: 200,
            headers: HEADERS,
            body: JSON.stringify({
              found: true, domain,
              displayName:  ld.name || domain,
              totalReviews: parseInt(ar.reviewCount) || 0,
              trustScore:   parseFloat(ar.ratingValue) || 0,
              responseRate: null,
              lastDaysAgo:  null,
            }),
          };
        }
      } catch (_) {}
    }

    // No parseable data found → treat as "no profile"
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ found: false, domain }) };

  } catch (e) {
    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ found: false, error: e.message, domain }),
    };
  }
};
