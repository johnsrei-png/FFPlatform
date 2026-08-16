const https = require('https');
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Missing ANTHROPIC_API_KEY environment variable' })
    };
  }
  try {
    const { prompt, model, maxTokens } = JSON.parse(event.body);
    if (!prompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing prompt' })
      };
    }
    const requestBody = JSON.stringify({
      model: model || 'claude-sonnet-5',
      max_tokens: maxTokens || 1024,
      messages: [{ role: 'user', content: prompt }]
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
          'Content-Length': Buffer.byteLength(requestBody)
        }
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`Anthropic API error ${res.statusCode}: ${data}`));
          }
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
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      // Pass through stop_reason + model so the frontend can distinguish a
      // token-limit truncation from a genuinely empty response, and fall back.
      body: JSON.stringify({ text, stopReason: data.stop_reason || null, model: data.model || null })
    };
  } catch (error) {
    console.error('Error in roast function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
