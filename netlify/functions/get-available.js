const fetch = require('node-fetch');

// Returns the players NOT currently on any roster (the free-agent / waiver pool),
// filtered to fantasy-relevant positions. This is derived, since Sleeper has no direct
// "free agents" endpoint: full player dictionary MINUS everyone on a roster.
// The frontend cross-references these IDs against its projection data to rank them,
// compute a true replacement level, and surface pickup targets.

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
  const RELEVANT = { QB: 1, RB: 1, WR: 1, TE: 1, DEF: 1 };

  try {
    // 1) All rostered player IDs across the league (who is taken)
    const rosters = await fetchJson(`https://api.sleeper.app/v1/league/${leagueId}/rosters`);
    const taken = {};
    if (Array.isArray(rosters)) {
      rosters.forEach(r => {
        (r.players || []).forEach(pid => { taken[pid] = true; });
      });
    }

    // 2) Full NFL player dictionary
    const allPlayers = await fetchJson('https://api.sleeper.app/v1/players/nfl');
    if (!allPlayers || typeof allPlayers !== 'object') {
      return { statusCode: 200, headers: jsonHeaders(), body: JSON.stringify({ available: [], note: 'Player dictionary unavailable.' }) };
    }

    // 3) Available = relevant-position players who are NOT rostered and look active.
    const available = [];
    Object.keys(allPlayers).forEach(function(pid) {
      if (taken[pid]) return;
      const p = allPlayers[pid];
      if (!p) return;
      var posList = p.fantasy_positions || (p.position ? [p.position] : []);
      var pos = (posList[0] || p.position || '').toUpperCase();
      if (pos === 'DST' || pos === 'D/ST') pos = 'DEF';
      if (!RELEVANT[pos]) return;
      // Drop obvious noise: no team (unless DEF), inactive/retired statuses.
      var status = (p.status || '').toLowerCase();
      if (status === 'inactive' || status === 'retired') return;
      if (pos !== 'DEF' && !p.team) return; // unsigned/practice-squad-ish
      var name;
      if (pos === 'DEF') name = (p.last_name || p.first_name || pid) + ' DEF';
      else name = ((p.first_name || '') + ' ' + (p.last_name || '')).trim();
      if (!name) return;
      available.push({ pid: pid, name: name, pos: pos, team: p.team || null });
    });

    return {
      statusCode: 200,
      headers: jsonHeaders(),
      body: JSON.stringify({
        leagueId: leagueId,
        takenCount: Object.keys(taken).length,
        availableCount: available.length,
        available: available
      })
    };
  } catch (error) {
    console.error('Available-players fetch failed:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};

function jsonHeaders() {
  // Roster membership changes slowly day to day; cache 10 min.
  return { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=600' };
}
