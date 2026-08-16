const fetch = require('node-fetch');

// Walks the league history chain and pulls all transactions across every season.
// Resolves roster IDs to owner/team names. Returns both a full log and per-owner
// behavioral stats (trades, waiver/FAAB activity, adds/drops).

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

  const startLeague = (event.queryStringParameters && event.queryStringParameters.leagueId) || '1312069771746885632';
  const MAX_WEEKS = 18;

  // Fetch Sleeper's full player dictionary once, build a compact id -> name map.
  // This is the authoritative source for names, including dropped/retired players.
  let playerNames = {};
  try {
    const allPlayers = await fetchJson('https://api.sleeper.app/v1/players/nfl');
    if (allPlayers && typeof allPlayers === 'object') {
      Object.keys(allPlayers).forEach(function(pid) {
        const p = allPlayers[pid];
        if (!p) return;
        if (p.position === 'DEF') {
          playerNames[pid] = (p.last_name || p.first_name || pid) + ' DEF';
        } else {
          const nm = ((p.first_name || '') + ' ' + (p.last_name || '')).trim();
          if (nm) playerNames[pid] = nm;
        }
      });
    }
  } catch (e) {
    // If this fails, we fall back to raw IDs (front-end still has its own lookup)
  }

  const nameFor = function(pid) { return playerNames[pid] || null; };

  try {
    // 1) Build the season chain
    const chain = [];
    let lid = startLeague;
    for (let i = 0; i < 8 && lid && lid !== '0'; i++) {
      const lg = await fetchJson(`https://api.sleeper.app/v1/league/${lid}`);
      if (!lg) break;
      chain.push({ league_id: lid, season: lg.season });
      lid = lg.previous_league_id;
    }

    // Map fractured historical Sleeper team names back to the 10 real owners so
    // behavioral stats aggregate correctly at the source (mirrors the frontend map).
    const normalizeTeamName = (name) =>
      (name || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
    const TEAM_OWNER_MAP = {
      'rosterbaters anonymous': 'Tyler', 'rosterbators anonymous': 'Tyler',
      'the scramblers': 'Kurt', 'fuck it': 'Reid', 'beavers': 'Russ',
      'franks little beauties': 'Jason', 'irrelevant wonz': 'Lance',
      'amon top of the world': 'Steve', 'poptart': 'Mark',
      'retiredlife82': 'Bob', 'hock tuah': 'Duke',
      // Historical aliases:
      'jt started the fire': 'Jason', 'all set see you in 2026': 'Jason', 'neverjason': 'Jason',
      'the peoples champion': 'Tyler', 'make america gronk again': 'Tyler',
      'americas team': 'Tyler', 'foxys team murica': 'Tyler',
      'jauan some': 'Russ', 'tentenths': 'Russ', 'sloppy seconds': 'Russ',
      'roster 4': 'Russ', 'dontbeatwat': 'Russ', 'headshot by a snowflake': 'Russ',
      'game of mahomes': 'Steve', 'stevefarnham': 'Steve', 'hawk tua': 'Duke'
    };
    // Canonical owner name: map alias -> real owner, else keep original display name.
    const canonOwner = (name) => TEAM_OWNER_MAP[normalizeTeamName(name)] || name;

    // 2) For each season, fetch users + rosters to map roster_id -> owner display name
    // 3) Then fetch transactions week by week
    const allTxns = [];
    const ownerStats = {}; // canonical owner -> { trades, waivers, freeAgents, adds, drops, faabSpent }

    const ensureOwner = (rawName) => {
      const name = canonOwner(rawName);
      return ownerStats[name] || (ownerStats[name] = {
        owner: name, trades: 0, waivers: 0, freeAgents: 0, adds: 0, drops: 0, faabSpent: 0, seasons: {}
      });
    };

    for (const season of chain) {
      const [users, rosters] = await Promise.all([
        fetchJson(`https://api.sleeper.app/v1/league/${season.league_id}/users`),
        fetchJson(`https://api.sleeper.app/v1/league/${season.league_id}/rosters`)
      ]);
      if (!users || !rosters) continue;

      // roster_id -> owner display name
      const userById = {};
      users.forEach(u => { userById[u.user_id] = (u.metadata && u.metadata.team_name) || u.display_name || 'Unknown'; });
      const ownerByRoster = {};
      rosters.forEach(r => { ownerByRoster[r.roster_id] = userById[r.owner_id] || ('Roster ' + r.roster_id); });

      for (let w = 1; w <= MAX_WEEKS; w++) {
        const txns = await fetchJson(`https://api.sleeper.app/v1/league/${season.league_id}/transactions/${w}`);
        if (!Array.isArray(txns) || !txns.length) continue;

        txns.forEach(t => {
          if (t.status !== 'complete') return;
          const rosterIds = t.roster_ids || [];
          const owners = rosterIds.map(rid => ownerByRoster[rid]).filter(Boolean);

          // Behavioral stats
          owners.forEach(o => {
            const s = ensureOwner(o);
            if (t.type === 'trade') s.trades += 1;
            else if (t.type === 'waiver') s.waivers += 1;
            else if (t.type === 'free_agent') s.freeAgents += 1;
          });
          if (t.adds) Object.values(t.adds).forEach(rid => { const o = ownerByRoster[rid]; if (o) ensureOwner(o).adds += 1; });
          if (t.drops) Object.values(t.drops).forEach(rid => { const o = ownerByRoster[rid]; if (o) ensureOwner(o).drops += 1; });
          if (Array.isArray(t.waiver_budget)) {
            t.waiver_budget.forEach(wb => {
              const o = ownerByRoster[wb.receiver != null ? wb.receiver : wb.sender];
              if (o && wb.amount) ensureOwner(o).faabSpent += wb.amount;
            });
          }

          // Compact log entry
          allTxns.push({
            season: season.season,
            week: w,
            type: t.type,
            created: t.created,
            owners: owners,
            adds: t.adds ? Object.entries(t.adds).map(([pid, rid]) => ({ pid, name: nameFor(pid), owner: ownerByRoster[rid] })) : [],
            drops: t.drops ? Object.entries(t.drops).map(([pid, rid]) => ({ pid, name: nameFor(pid), owner: ownerByRoster[rid] })) : [],
            picks: (t.draft_picks || []).map(dp => ({ round: dp.round, season: dp.season, to: ownerByRoster[dp.owner_id], from: ownerByRoster[dp.previous_owner_id] }))
          });
        });
      }
    }

    // Sort log newest first
    allTxns.sort((a, b) => (b.created || 0) - (a.created || 0));

    // Balanced cap: keep up to PER_SEASON_CAP newest txns per season so older
    // seasons (2022-2024) aren't crowded out of the payload by recent activity.
    // Then re-sort the kept set newest-first for display.
    const PER_SEASON_CAP = 120;
    const perSeasonCount = {};
    const capped = [];
    for (const t of allTxns) { // already newest-first, so we keep the newest per season
      const key = String(t.season);
      perSeasonCount[key] = (perSeasonCount[key] || 0) + 1;
      if (perSeasonCount[key] <= PER_SEASON_CAP) capped.push(t);
    }
    capped.sort((a, b) => (b.created || 0) - (a.created || 0));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
      body: JSON.stringify({
        seasons: chain.map(c => c.season),
        transactionCount: allTxns.length,
        returnedCount: capped.length,
        perSeasonReturned: perSeasonCount,
        ownerStats: Object.values(ownerStats),
        transactions: capped
      })
    };

  } catch (error) {
    console.error('Transactions fetch failed:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
