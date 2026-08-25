const fetch = require('node-fetch');

// Fetches the fantasy head-to-head matchups for a given week from Sleeper and maps
// roster IDs to owner/team names. Returns the week's pairings with each side's score
// (live/final points) and a list of the players each roster started. Dormant in the
// preseason (Sleeper returns no matchups until the season/schedule is set).

async function fetchJson(url, retries = 1) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      if (i === retries) return null;
      await new Promise(r => setTimeout(r, 400));
    }
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const qs = event.queryStringParameters || {};
  const leagueId = qs.leagueId || '1312069771746885632';
  const week = parseInt(qs.week, 10) || 1;

  try {
    // Map roster_id -> owner/team name for this league
    const [users, rosters] = await Promise.all([
      fetchJson(`https://api.sleeper.app/v1/league/${leagueId}/users`),
      fetchJson(`https://api.sleeper.app/v1/league/${leagueId}/rosters`)
    ]);
    if (!users || !rosters) {
      return { statusCode: 200, headers: jsonHeaders(), body: JSON.stringify({ week: week, matchups: [], note: 'No users/rosters available.' }) };
    }
    const userById = {};
    users.forEach(u => { userById[u.user_id] = (u.metadata && u.metadata.team_name) || u.display_name || 'Unknown'; });
    const teamByRoster = {};
    rosters.forEach(r => { teamByRoster[r.roster_id] = userById[r.owner_id] || ('Roster ' + r.roster_id); });

    // Pull the week's matchups. Each entry has matchup_id, roster_id, points, starters, players.
    const raw = await fetchJson(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`);
    if (!Array.isArray(raw) || !raw.length) {
      // Dormant: no matchups yet (preseason) or invalid week.
      return { statusCode: 200, headers: jsonHeaders(), body: JSON.stringify({ week: week, matchups: [], note: 'No matchups for this week yet (season may not have started).' }) };
    }

    // Group roster entries by matchup_id to form head-to-head pairings.
    const byMatchup = {};
    raw.forEach(entry => {
      const mid = entry.matchup_id;
      if (mid === null || mid === undefined) return;
      (byMatchup[mid] = byMatchup[mid] || []).push(entry);
    });

    const matchups = Object.keys(byMatchup).map(mid => {
      const sides = byMatchup[mid].map(e => ({
        rosterId: e.roster_id,
        team: teamByRoster[e.roster_id] || ('Roster ' + e.roster_id),
        points: (typeof e.points === 'number') ? Math.round(e.points * 100) / 100 : 0,
        starters: Array.isArray(e.starters) ? e.starters : []
      }));
      return { matchupId: mid, sides: sides };
    });

    // Aggregate per-player actual fantasy points across all rosters for this week.
    // players_points from Sleeper already reflects the league's scoring settings.
    const playerPoints = {};
    raw.forEach(entry => {
      if (entry.players_points && typeof entry.players_points === 'object') {
        Object.assign(playerPoints, entry.players_points);
      }
    });

    return {
      statusCode: 200,
      headers: jsonHeaders(),
      body: JSON.stringify({
        leagueId: leagueId,
        week: week,
        matchupCount: matchups.length,
        matchups: matchups,
        playerPoints: playerPoints  // { player_id: actual_fantasy_points } for this week
      })
    };
  } catch (error) {
    console.error('Matchups fetch failed:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};

function jsonHeaders() {
  // Short cache — scores update live during game days.
  return { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=120' };
}
