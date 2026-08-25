const fetch = require('node-fetch');

// Fetches FantasyPros consensus season-long projections and scores them with
// the Boom Boom Room's exact league rules (full PPR, 5pt passing TDs, etc.).
// The frontend blends these 50/50 with Sleeper's projections for a consensus number.

// Score FantasyPros raw stat projections using our league's exact scoring settings.
function scoreForOurLeague(stats) {
  if (!stats) return 0;
  const g = (k) => parseFloat(stats[k]) || 0;
  let pts = 0;

  // Passing: 1pt/25yds (0.04/yd), 5pt TDs (not standard 4), -2 per INT.
  pts += g('pass_yds') * 0.04;
  pts += g('pass_tds') * 5;
  pts += g('pass_ints') * -2;

  // Rushing: 1pt/10yds (0.1/yd), 6pt TDs.
  pts += g('rush_yds') * 0.1;
  pts += g('rush_tds') * 6;

  // Receiving: Full PPR (1pt/rec). FP uses 'rec_rec' for receptions.
  // 1pt/10yds (0.1/yd), 6pt TDs.
  pts += g('rec_rec') * 1;
  pts += g('rec_yds') * 0.1;
  pts += g('rec_tds') * 6;

  // Fumbles: FP gives projected total fumbles; roughly half are lost.
  // Fumble lost = -2 in our league.
  pts += g('fumbles') * 0.5 * -2;

  return Math.max(0, Math.round(pts));
}

// Normalize player name for fuzzy matching (handles D.K., D'Andre, etc.)
function normName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')   // remove punctuation (periods, apostrophes)
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchJson(url, headers, retries = 1) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers, timeout: 8000 });
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
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing FP_API_KEY environment variable — add it in Netlify settings.' }) };
  }

  const qs = event.queryStringParameters || {};
  const season = qs.season || '2026';

  const headers = {
    'x-api-key': apiKey,
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0',
  };

  // Fetch all skill positions. week=0 = full season projections.
  const BASE = `https://api.fantasypros.com/public/v2/json/nfl/${season}/projections`;
  const positions = ['QB', 'RB', 'WR', 'TE'];

  let allPlayers = [];
  const errors = [];

  for (const pos of positions) {
    try {
      const url = `${BASE}?position=${pos}&week=0&scoring=PPR`;
      const data = await fetchJson(url, headers);
      if (data && Array.isArray(data.players)) {
        data.players.forEach(p => {
          const pts = scoreForOurLeague(p.stats);
          allPlayers.push({
            fpid:     p.fpid,
            name:     p.name || p.player_name,
            nameKey:  normName(p.name || p.player_name || ''),
            position: p.position_id || p.player_position_id || pos,
            team:     p.team_id || p.player_team_id || '',
            pts:      pts,
            // Include the FantasyPros pre-scored PPR points as a sanity check.
            fpPts:    parseFloat((p.stats && (p.stats.points_ppr || p.stats.points)) || 0),
          });
        });
      }
    } catch (e) {
      errors.push(pos + ': ' + e.message);
    }
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      // Cache 12 hours — FP projections update weekly at most.
      'Cache-Control': 'public, max-age=43200',
    },
    body: JSON.stringify({
      season,
      count: allPlayers.length,
      players: allPlayers,
      errors: errors.length ? errors : undefined,
    }),
  };
};
