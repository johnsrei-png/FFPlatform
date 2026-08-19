const https = require('https');

// Comma-separated list of allowed site origins, set in Netlify env as ALLOWED_ORIGINS
// e.g. "https://bbrplatform.netlify.app,https://boomboomroom.com". If unset, origin
// checking is skipped (so local dev / first deploy don't lock you out).
function originAllowed(event) {
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!allowed.length) return true; // not configured -> don't block
  const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const referer = (event.headers && (event.headers.referer || event.headers.Referer)) || '';
  return allowed.some(a => origin === a || (referer && referer.indexOf(a) === 0));
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // ---- Protection layer: origin check ----
  // Only accept requests coming from our own site (set ALLOWED_ORIGINS in Netlify).
  // This needs no secret in the frontend, so nothing sensitive ends up in public files.
  if (!originAllowed(event)) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden origin' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing ANTHROPIC_API_KEY environment variable' }) };
  }

  try {
    const { prompt, model, maxTokens } = JSON.parse(event.body);
    if (!prompt) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing prompt' }) };
    }

    // Prompt caching: mark the prompt block with cache_control so Anthropic caches it.
    // Repeated identical prompts (regenerated briefings/rankings, repeated context in
    // multi-turn chat) then bill cached input at ~10% of normal, cutting cost with no
    // quality change. cache_control requires the beta header below.
    const requestBody = JSON.stringify({
      model: model || 'claude-sonnet-5',
      max_tokens: maxTokens || 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt, cache_control: { type: 'ephemeral' } }
        ]
      }]
    });

    const responseText = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'prompt-caching-2024-07-31',
          'Content-Length': Buffer.byteLength(requestBody)
        }
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
          else reject(new Error(`Anthropic API error ${res.statusCode}: ${data}`));
        });
      });
      req.on('error', reject);
      req.write(requestBody);
      req.end();
    });

    const data = JSON.parse(responseText);
    const text = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      // Pass through stop_reason + model so the frontend can distinguish a token-limit
      // truncation from a genuinely empty response. usage included for cost visibility.
      body: JSON.stringify({
        text,
        stopReason: data.stop_reason || null,
        model: data.model || null,
        usage: data.usage || null
      })
    };
  } catch (error) {
    console.error('Error in roast function:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
