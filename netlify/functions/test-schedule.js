const fetch = require('node-fetch');

// Probe for a clean NFL schedule source: who plays whom each week, home/away, byes.
// Deploy, hit /api/test-schedule?season=2025, inspect the JSON.

async function tryFetch(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const status = res.status;
    let body = null;
    try { body = await res.json(); } catch (e) { body = null; }
    return { status, body };
  } catch (e) {
    return { error: e.message };
  }
}

exports.handler = async (event) => {
  const season = (event.queryStringParameters && event.queryStringParameters.season) || '2025';
  const results = {};

  // Sleeper: NFL state (gives current week + season)
  results.state = await tryFetch('https://api.sleeper.app/v1/state/nfl');

  // ESPN public scoreboard for a given week (widely used, returns matchups + teams)
  // Week 1 of the given season, regular season (seasontype=2)
  const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=1`;
  const espn = await tryFetch(espnUrl);
  results.espnWeek1 = {
    status: espn.status,
    error: espn.error,
    eventCount: espn.body && espn.body.events ? espn.body.events.length : null,
    sampleEvent: espn.body && espn.body.events && espn.body.events[0]
      ? {
          name: espn.body.events[0].name,
          date: espn.body.events[0].date,
          shortName: espn.body.events[0].shortName
        }
      : null
  };

  // ESPN teams list (for building a team-abbrev map and bye detection)
  const teamsUrl = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams';
  const teams = await tryFetch(teamsUrl);
  results.espnTeams = {
    status: teams.status,
    error: teams.error,
    teamCount: teams.body && teams.body.sports ? (teams.body.sports[0].leagues[0].teams || []).length : null
  };

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ season, results }, null, 2)
  };
};
