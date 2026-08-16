const fetch = require('node-fetch');

// Maps how far back Sleeper's league history goes (via previous_league_id chain)
// and shows the shape of a transaction so we can build the parser.

async function fetchJson(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return { status: res.status };
    return { status: res.status, body: await res.json() };
  } catch (e) {
    return { error: e.message };
  }
}

exports.handler = async (event) => {
  const startLeague = (event.queryStringParameters && event.queryStringParameters.leagueId) || '1312069771746885632';

  // 1) Walk the previous_league_id chain
  const chain = [];
  let lid = startLeague;
  for (let i = 0; i < 25 && lid; i++) {
    const lg = await fetchJson(`https://api.sleeper.app/v1/league/${lid}`);
    if (!lg.body) break;
    chain.push({
      league_id: lid,
      name: lg.body.name,
      season: lg.body.season,
      status: lg.body.status,
      previous_league_id: lg.body.previous_league_id || null
    });
    lid = lg.body.previous_league_id;
  }

  // 2) Sample transactions from the most recent season with any, checking a few weeks
  let sampleTxn = null, txnCountsByWeek = {};
  const probeLeague = chain[0] ? chain[0].league_id : startLeague;
  for (let w = 1; w <= 18; w++) {
    const tx = await fetchJson(`https://api.sleeper.app/v1/league/${probeLeague}/transactions/${w}`);
    if (Array.isArray(tx.body) && tx.body.length) {
      txnCountsByWeek[w] = tx.body.length;
      if (!sampleTxn) {
        // Grab one of each type if possible
        const trade = tx.body.find(t => t.type === 'trade');
        const waiver = tx.body.find(t => t.type === 'waiver');
        const fa = tx.body.find(t => t.type === 'free_agent');
        sampleTxn = { trade: trade || null, waiver: waiver || null, free_agent: fa || null };
      }
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      seasonsFound: chain.length,
      chain: chain,
      probeLeague: probeLeague,
      txnCountsByWeek: txnCountsByWeek,
      sampleTxn: sampleTxn
    }, null, 2)
  };
};
