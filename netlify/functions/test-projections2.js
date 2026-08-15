const fetch = require('node-fetch');

// Second probe: find the most EFFICIENT way to get full season stat projections
// for many players at once (not just ADP, and not one-player-at-a-time).

exports.handler = async (event) => {
  const season = (event.queryStringParameters && event.queryStringParameters.season) || '2025';
  const results = [];

  // Candidate A: season grouping WITHOUT position filter (maybe returns full stats)
  const urlA = `https://api.sleeper.com/projections/nfl/${season}?season_type=regular&grouping=season`;
  // Candidate B: season grouping, order_by pts_ppr (some versions return stats when ordered)
  const urlB = `https://api.sleeper.com/projections/nfl/${season}?season_type=regular&order_by=pts_ppr`;
  // Candidate C: a single WEEK with full stats (we already know this returns stats) — to confirm QB stat keys present
  const urlC = `https://api.sleeper.com/projections/nfl/${season}/1?season_type=regular&position[]=QB`;

  const probes = [
    { label: 'A: season grouping, no position filter', url: urlA },
    { label: 'B: season grouping, order_by pts_ppr', url: urlB },
    { label: 'C: week 1 QBs (confirm pass stats present)', url: urlC }
  ];

  for (const p of probes) {
    try {
      const res = await fetch(p.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const body = await res.json();
      const arr = Array.isArray(body) ? body : [body];
      // Find first entry that has real stat projections (pass_yd or rec_yd or rush_yd)
      const withStats = arr.find(x => x && x.stats && (
        x.stats.pass_yd !== undefined || x.stats.rec_yd !== undefined || x.stats.rush_yd !== undefined
      ));
      results.push({
        label: p.label,
        url: p.url,
        status: res.status,
        count: arr.length,
        hasFullStats: !!withStats,
        exampleStatKeys: withStats ? Object.keys(withStats.stats) : (arr[0] && arr[0].stats ? Object.keys(arr[0].stats) : null),
        exampleName: withStats && withStats.player ? (withStats.player.first_name + ' ' + withStats.player.last_name) : null,
        exampleStats: withStats ? withStats.stats : null
      });
    } catch (err) {
      results.push({ label: p.label, url: p.url, error: err.message });
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ season, results }, null, 2)
  };
};
