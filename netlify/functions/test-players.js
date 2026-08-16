const fetch = require('node-fetch');

// Find which players endpoint works and whether the specific failing IDs resolve.

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
  const testIds = ['5850', '11589', '4046']; // failing ones + a known QB (Mahomes)
  const results = {};

  const endpoints = [
    'https://api.sleeper.app/v1/players/nfl',
    'https://api.sleeper.com/players/nfl'
  ];

  for (const url of endpoints) {
    const r = await tryFetch(url);
    const ok = r.body && typeof r.body === 'object';
    const lookups = {};
    if (ok) {
      testIds.forEach(function(id) {
        const p = r.body[id];
        lookups[id] = p ? (((p.first_name||'') + ' ' + (p.last_name||'')).trim() + ' [' + (p.position||'?') + ']') : 'NOT FOUND';
      });
    }
    results[url] = {
      status: r.status,
      error: r.error,
      isObject: ok,
      totalPlayers: ok ? Object.keys(r.body).length : null,
      testLookups: ok ? lookups : null
    };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(results, null, 2)
  };
};
