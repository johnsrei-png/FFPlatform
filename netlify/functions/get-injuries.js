const fetch = require('node-fetch');

// Fetches current NFL injury report from FantasyPros.
// Returns players with injury status (Q/D/O/IR) and injury type.
// Uses the same FP_API_KEY as get-fp-projections.js.

async function fetchJson(url, headers, retries = 1) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + await res.text().catch(() => ''));
      return await res.json();
    } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.FP_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing FP_API_KEY' }) };
  }

  const qs = event.queryStringParameters || {};
  const season = qs.season || '2026';
  const week   = qs.week   || '0'; // 0 = most recent / pre-season

  const headers = { 'x-api-key': apiKey, 'Content-Type': 'application/json' };

  try {
    const url = `https://api.fantasypros.com/public/v2/json/nfl/${season}/injuries?week=${week}&position=ALL`;
    const data = await fetchJson(url, headers);

    if (!data || !Array.isArray(data.players)) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
        body: JSON.stringify({ injuries: [], note: 'No injury data available.' })
      };
    }

    // Filter to relevant positions and meaningful statuses only.
    const RELEVANT_POS = { QB: 1, RB: 1, WR: 1, TE: 1 };
    const RELEVANT_STATUS = { Q: 1, D: 1, O: 1, IR: 1, PUP: 1 };

    const injuries = data.players
      .filter(function(p) {
        const pos    = (p.player_position_id || p.position || '').toUpperCase();
        const status = (p.injury_status || p.status || '').toUpperCase();
        return RELEVANT_POS[pos] && RELEVANT_STATUS[status];
      })
      .map(function(p) {
        return {
          name:     p.player_name || p.name || '',
          team:     p.player_team_id || p.team || '',
          position: (p.player_position_id || p.position || '').toUpperCase(),
          status:   (p.injury_status || p.status || '').toUpperCase(),
          injury:   p.injury_type || p.injury || '',
          practice: p.practice_status || '',
        };
      })
      .filter(function(p) { return p.name; });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600', // 1-hour cache; injury reports update daily
      },
      body: JSON.stringify({ injuries, count: injuries.length }),
    };

  } catch (e) {
    console.error('Injuries fetch error:', e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
