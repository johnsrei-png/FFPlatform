const fetch = require('node-fetch');

// Diagnostic: probe Sleeper's (unofficial) projections endpoints and report what
// they return, so we can confirm the data is usable before building on it.
// Deploy this, hit /api/test-projections?season=2025, and inspect the JSON.

exports.handler = async (event) => {
  const season = (event.queryStringParameters && event.queryStringParameters.season) || '2025';

  const candidates = [
    {
      label: 'season-grouping (api.sleeper.com, all skill positions)',
      url: `https://api.sleeper.com/projections/nfl/${season}?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=DEF&grouping=season`
    },
    {
      label: 'week-1 (api.sleeper.com)',
      url: `https://api.sleeper.com/projections/nfl/${season}/1?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE`
    },
    {
      label: 'single-player season (Josh Allen id 4046)',
      url: `https://api.sleeper.com/projections/nfl/player/4046?season_type=regular&season=${season}&grouping=season`
    }
  ];

  const results = [];

  for (const c of candidates) {
    try {
      const res = await fetch(c.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const status = res.status;
      let body = null, note = '';
      try {
        body = await res.json();
      } catch (e) {
        note = 'non-JSON response';
      }

      let sample = null, count = null, keysSeen = null;
      if (Array.isArray(body)) {
        count = body.length;
        sample = body.slice(0, 2);
        // Collect the stat keys from the first entry that has stats
        const first = body.find(x => x && x.stats);
        if (first) keysSeen = Object.keys(first.stats);
      } else if (body && typeof body === 'object') {
        sample = body;
        if (body.stats) keysSeen = Object.keys(body.stats);
      }

      results.push({ label: c.label, url: c.url, status, count, statKeys: keysSeen, sample, note });
    } catch (err) {
      results.push({ label: c.label, url: c.url, error: err.message });
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ season, results }, null, 2)
  };
};
