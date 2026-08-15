const fetch = require('node-fetch');

// Fetches full-season stat projections for all players in one call,
// then trims to a compact payload (only the stat fields we score on).
// The front-end applies THIS league's scoring rules to these raw stats.

const STAT_FIELDS = [
  'gp',
  'pass_yd', 'pass_td', 'pass_int', 'pass_2pt',
  'rush_yd', 'rush_td', 'rush_2pt',
  'rec', 'rec_yd', 'rec_td', 'rec_2pt', 'rec_40p',
  'fum_lost',
  'pts_ppr' // Sleeper's own PPR total, kept for reference/fallback
];

async function fetchJson(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 800 * (i + 1)));
    }
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const season = (event.queryStringParameters && event.queryStringParameters.season) || '2025';

  try {
    const url = `https://api.sleeper.com/projections/nfl/${season}?season_type=regular&order_by=pts_ppr`;
    const raw = await fetchJson(url);

    if (!Array.isArray(raw)) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Unexpected projections shape' }) };
    }

    // Build a compact map: player_id -> { stats, position, gp }
    const projections = {};
    raw.forEach(entry => {
      if (!entry || !entry.player_id || !entry.stats) return;
      const s = entry.stats;
      // Skip entries with no real offensive projection
      const hasProj = s.pass_yd || s.rush_yd || s.rec_yd || s.pts_ppr;
      if (!hasProj) return;

      const trimmed = {};
      STAT_FIELDS.forEach(f => { if (s[f] !== undefined) trimmed[f] = s[f]; });

      projections[entry.player_id] = {
        stats: trimmed,
        pos: entry.player && entry.player.position ? entry.player.position : null
      };
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
      body: JSON.stringify({ season, count: Object.keys(projections).length, projections })
    };

  } catch (error) {
    console.error('Projections fetch failed:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
