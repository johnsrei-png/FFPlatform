const fetch = require('node-fetch');

// Fetches the full NFL regular-season schedule from Sleeper and reshapes it into
// a compact per-team lookup: each team's opponent by week (with home/away) and byes.

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

  const season = (event.queryStringParameters && event.queryStringParameters.season) || '2026';

  try {
    const games = await fetchJson(`https://api.sleeper.com/schedule/nfl/regular/${season}`);
    if (!Array.isArray(games)) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Unexpected schedule shape' }) };
    }

    // team -> { week -> { opp, homeAway } }
    const byTeam = {};
    let maxWeek = 0;
    const ensure = (t) => byTeam[t] || (byTeam[t] = {});

    games.forEach(g => {
      if (!g.home || !g.away || !g.week) return;
      maxWeek = Math.max(maxWeek, g.week);
      ensure(g.home)[g.week] = { opp: g.away, homeAway: 'vs' };
      ensure(g.away)[g.week] = { opp: g.home, homeAway: '@' };
    });

    // Derive bye weeks per team (weeks 1..maxWeek with no game)
    const schedule = {};
    Object.keys(byTeam).forEach(team => {
      const weeks = byTeam[team];
      const byes = [];
      const weekly = {};
      for (let w = 1; w <= maxWeek; w++) {
        if (weeks[w]) {
          weekly[w] = weeks[w].homeAway + weeks[w].opp;
        } else {
          byes.push(w);
        }
      }
      schedule[team] = { weekly: weekly, byes: byes };
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=21600' },
      body: JSON.stringify({ season: season, weeks: maxWeek, schedule: schedule })
    };

  } catch (error) {
    console.error('Schedule fetch failed:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
