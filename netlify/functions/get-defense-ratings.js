const fetch = require('node-fetch');

// Pulls last season's team-defense fantasy points allowed BY POSITION (qb/rb/wr/te)
// from Sleeper, and ranks all 32 defenses at each position.
// Rank 1 = allowed the FEWEST points (toughest matchup); rank 32 = allowed the most (softest).
// The front-end uses these ranks to grade each player's strength of schedule.

async function fetchJson(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 700 * (i + 1)));
    }
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Default to last completed season (2025); the season being played is 2026.
  const season = (event.queryStringParameters && event.queryStringParameters.season) || '2025';

  try {
    const raw = await fetchJson(`https://api.sleeper.com/stats/nfl/${season}?season_type=regular&grouping=season`);
    if (!Array.isArray(raw)) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Unexpected stats shape' }) };
    }

    // Collect each defense's points-allowed-by-position
    const positions = ['qb', 'rb', 'wr', 'te'];
    const defenses = {}; // team -> { qb, rb, wr, te }
    raw.forEach(entry => {
      if (!entry || !entry.player || entry.player.position !== 'DEF' || !entry.stats) return;
      const team = entry.player.team;
      if (!team) return;
      const s = entry.stats;
      defenses[team] = {
        qb: s.fan_pts_allow_qb != null ? s.fan_pts_allow_qb : null,
        rb: s.fan_pts_allow_rb != null ? s.fan_pts_allow_rb : null,
        wr: s.fan_pts_allow_wr != null ? s.fan_pts_allow_wr : null,
        te: s.fan_pts_allow_te != null ? s.fan_pts_allow_te : null,
        total: s.fan_pts_allow != null ? s.fan_pts_allow : null
      };
    });

    const teams = Object.keys(defenses);
    // Rank per position: 1 = fewest allowed (toughest), N = most allowed (softest)
    const ranks = {}; // team -> { qb, rb, wr, te, overall }
    teams.forEach(t => { ranks[t] = {}; });

    positions.forEach(pos => {
      const sorted = teams
        .filter(t => defenses[t][pos] != null)
        .sort((a, b) => defenses[a][pos] - defenses[b][pos]); // ascending: fewest first
      sorted.forEach((t, i) => { ranks[t][pos] = i + 1; });
    });
    // Overall rank from total points allowed
    const sortedTotal = teams.filter(t => defenses[t].total != null)
      .sort((a, b) => defenses[a].total - defenses[b].total);
    sortedTotal.forEach((t, i) => { ranks[t].overall = i + 1; });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' },
      body: JSON.stringify({
        season: season,
        teamCount: teams.length,
        pointsAllowed: defenses,
        ranks: ranks
      })
    };

  } catch (error) {
    console.error('Defense ratings fetch failed:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
