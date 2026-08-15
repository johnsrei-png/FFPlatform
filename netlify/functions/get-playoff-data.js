const fetch = require('node-fetch');

const SLEEPER_API_BASE = 'https://api.sleeper.app/v1';
const REGULAR_SEASON_WEEKS = 14; // Weeks 1-14 regular season; 15-17 playoffs

async function fetchJson(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const leagueId = event.queryStringParameters?.leagueId;
    if (!leagueId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing leagueId parameter' }) };
    }

    // Current NFL week + season phase
    let currentWeek = 0;
    let seasonType = 'off';
    try {
      const state = await fetchJson(`${SLEEPER_API_BASE}/state/nfl`);
      currentWeek = state.week || 0;
      seasonType = state.season_type || 'off';
    } catch (e) {
      // If state fails, treat as off-season
    }

    // Determine how many regular-season weeks have completed.
    // Sleeper's "week" is the current/active week; completed weeks are those before it.
    // We pull matchups for weeks 1..min(currentWeek, REGULAR_SEASON_WEEKS).
    const lastRegWeek = Math.min(currentWeek, REGULAR_SEASON_WEEKS);

    // Per-roster list of weekly points scored so far
    const weeklyScores = {}; // rosterId -> [scores]
    const weekMatchups = {}; // week -> [{roster_id, points, matchup_id}]

    if (seasonType === 'regular' && lastRegWeek >= 1) {
      for (let w = 1; w <= lastRegWeek; w++) {
        let matchups;
        try {
          matchups = await fetchJson(`${SLEEPER_API_BASE}/league/${leagueId}/matchups/${w}`);
        } catch (e) {
          continue;
        }
        if (!Array.isArray(matchups)) continue;

        // A week is "complete" if teams have non-zero points. Skip the in-progress current week.
        const anyPoints = matchups.some(m => (m.points || 0) > 0);
        if (!anyPoints) continue;

        weekMatchups[w] = matchups.map(m => ({
          roster_id: m.roster_id,
          points: m.points || 0,
          matchup_id: m.matchup_id
        }));

        matchups.forEach(m => {
          if (!weeklyScores[m.roster_id]) weeklyScores[m.roster_id] = [];
          weeklyScores[m.roster_id].push(m.points || 0);
        });
      }
    }

    const weeksCompleted = Object.keys(weekMatchups).length;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({
        currentWeek,
        seasonType,
        regularSeasonWeeks: REGULAR_SEASON_WEEKS,
        weeksCompleted,
        weeklyScores,
        weekMatchups
      })
    };

  } catch (error) {
    console.error('Error fetching playoff data:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
