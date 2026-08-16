
const fetch = require('node-fetch');

// Probe Sleeper's schedule endpoints (reachable, since Sleeper powers the app),
// plus a retry of ESPN with fuller browser headers as a backup.

async function tryFetch(url, headers) {
  try {
    const res = await fetch(url, { headers: headers || { 'User-Agent': 'Mozilla/5.0' } });
    const status = res.status;
    let body = null, text = null;
    try { body = await res.json(); } catch (e) { }
    return { status, body };
  } catch (e) {
    return { error: e.message };
  }
}

exports.handler = async (event) => {
  const season = (event.queryStringParameters && event.queryStringParameters.season) || '2026';
  const results = {};

  // A) Sleeper schedule for the season (community endpoint)
  const schedUrl = `https://api.sleeper.com/schedule/nfl/regular/${season}`;
  const sched = await tryFetch(schedUrl);
  results.sleeperSchedule = {
    url: schedUrl,
    status: sched.status,
    error: sched.error,
    isArray: Array.isArray(sched.body),
    count: Array.isArray(sched.body) ? sched.body.length : null,
    sample: Array.isArray(sched.body) ? sched.body.slice(0, 3) : sched.body
  };

  // B) ESPN retry with fuller browser-like headers
  const espnHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://www.espn.com/'
  };
  const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=1&dates=${season}`;
  const espn = await tryFetch(espnUrl, espnHeaders);
  results.espnRetry = {
    url: espnUrl,
    status: espn.status,
    error: espn.error,
    eventCount: espn.body && espn.body.events ? espn.body.events.length : null,
    sampleName: espn.body && espn.body.events && espn.body.events[0] ? espn.body.events[0].shortName : null
  };

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ season, results }, null, 2)
  };
};
