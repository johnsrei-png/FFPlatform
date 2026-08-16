const fetch = require('node-fetch');

// Probe for data to build strength-of-schedule from last season (2025):
// ideally fantasy points ALLOWED by each defense to each position.
// Sleeper doesn't directly give "points allowed to position", but we can derive
// defensive strength from team defense stats and/or aggregate player stats vs each team.
// This probe checks what season stat endpoints return.

async function tryFetch(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const status = res.status;
    let body = null;
    try { body = await res.json(); } catch (e) {}
    return { status, body };
  } catch (e) {
    return { error: e.message };
  }
}

exports.handler = async (event) => {
  const season = (event.queryStringParameters && event.queryStringParameters.season) || '2025';
  const results = {};

  // A) Season-grouped player stats (actual 2025 results). Look for DEF entries + stat keys.
  const statsUrl = `https://api.sleeper.com/stats/nfl/${season}?season_type=regular&grouping=season`;
  const stats = await tryFetch(statsUrl);
  if (Array.isArray(stats.body)) {
    // Find a team-defense entry
    const defEntry = stats.body.find(x => x && x.player && x.player.position === 'DEF' && x.stats);
    // Find a WR entry (to see if opponent context exists)
    const wrEntry = stats.body.find(x => x && x.player && x.player.position === 'WR' && x.stats);
    results.seasonStats = {
      status: stats.status,
      count: stats.body.length,
      defStatKeys: defEntry ? Object.keys(defEntry.stats) : null,
      defSample: defEntry ? { team: defEntry.player.team, stats: defEntry.stats } : null,
      wrStatKeys: wrEntry ? Object.keys(wrEntry.stats).slice(0, 30) : null
    };
  } else {
    results.seasonStats = { status: stats.status, error: 'not an array', raw: stats.body };
  }

  // B) A single WEEK of stats to see if per-game opponent info is attached (needed to
  // compute points allowed BY a defense TO a position).
  const weekUrl = `https://api.sleeper.com/stats/nfl/${season}/1?season_type=regular`;
  const wk = await tryFetch(weekUrl);
  if (Array.isArray(wk.body)) {
    const anyWithOpp = wk.body.find(x => x && (x.opponent || (x.stats && x.stats.opponent)));
    const sampleEntry = wk.body.find(x => x && x.player && x.player.position === 'RB');
    results.weekStats = {
      status: wk.status,
      count: wk.body.length,
      hasOpponentField: !!anyWithOpp,
      sampleKeys: sampleEntry ? Object.keys(sampleEntry) : null,
      sampleStatKeys: sampleEntry && sampleEntry.stats ? Object.keys(sampleEntry.stats).slice(0, 20) : null
    };
  } else {
    results.weekStats = { status: wk.status, error: 'not an array' };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ season, results }, null, 2)
  };
};
