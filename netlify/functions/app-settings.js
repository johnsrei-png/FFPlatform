
const { getSupabaseClient } = require('./supabase-client');

// Simple key-value store for small league-wide settings (e.g. the BoomsDay countdown).
// GET  /api/app-settings?key=boomsday        -> { key, value }
// POST /api/app-settings  { key, value }      -> upserts

exports.handler = async (event) => {
  try {
    const supabase = getSupabaseClient(true);

    if (event.httpMethod === 'GET') {
      const key = event.queryStringParameters && event.queryStringParameters.key;
      if (!key) return { statusCode: 400, body: JSON.stringify({ error: 'Missing key' }) };
      const rows = await supabase.query('app_settings', 'GET', null, `?key=eq.${encodeURIComponent(key)}&select=*`);
      const value = (rows && rows.length) ? rows[0].value : null;
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        body: JSON.stringify({ key: key, value: value })
      };
    }

    if (event.httpMethod === 'POST') {
      const { key, value } = JSON.parse(event.body);
      if (!key) return { statusCode: 400, body: JSON.stringify({ error: 'Missing key' }) };

      const existing = await supabase.query('app_settings', 'GET', null, `?key=eq.${encodeURIComponent(key)}&select=key`);
      if (existing && existing.length) {
        await supabase.query('app_settings', 'PATCH', { value: value }, `?key=eq.${encodeURIComponent(key)}`);
      } else {
        await supabase.query('app_settings', 'POST', { key: key, value: value });
      }
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (error) {
    console.error('app-settings error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
