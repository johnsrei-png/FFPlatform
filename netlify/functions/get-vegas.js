const fetch = require('node-fetch');

// NFL full team name → abbreviation mapping for The Odds API → our app
const NAME_TO_ABBR = {
  'Arizona Cardinals': 'ARI', 'Atlanta Falcons': 'ATL', 'Baltimore Ravens': 'BAL',
  'Buffalo Bills': 'BUF', 'Carolina Panthers': 'CAR', 'Chicago Bears': 'CHI',
  'Cincinnati Bengals': 'CIN', 'Cleveland Browns': 'CLE', 'Dallas Cowboys': 'DAL',
  'Denver Broncos': 'DEN', 'Detroit Lions': 'DET', 'Green Bay Packers': 'GB',
  'Houston Texans': 'HOU', 'Indianapolis Colts': 'IND', 'Jacksonville Jaguars': 'JAX',
  'Kansas City Chiefs': 'KC', 'Las Vegas Raiders': 'LV', 'Los Angeles Chargers': 'LAC',
  'Los Angeles Rams': 'LAR', 'Miami Dolphins': 'MIA', 'Minnesota Vikings': 'MIN',
  'New England Patriots': 'NE', 'New Orleans Saints': 'NO', 'New York Giants': 'NYG',
  'New York Jets': 'NYJ', 'Philadelphia Eagles': 'PHI', 'Pittsburgh Steelers': 'PIT',
  'San Francisco 49ers': 'SF', 'Seattle Seahawks': 'SEA', 'Tampa Bay Buccaneers': 'TB',
  'Tennessee Titans': 'TEN', 'Washington Commanders': 'WAS',
};

function abbr(fullName) {
  return NAME_TO_ABBR[fullName] || fullName;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Missing ODDS_API_KEY — add it in Netlify environment variables.' })
    };
  }

  try {
    // Fetch spreads and totals for the current NFL week.
    const url = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/' +
      '?apiKey=' + apiKey +
      '&regions=us&markets=spreads,totals&oddsFormat=american';

    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return { statusCode: res.status, body: JSON.stringify({ error: 'Odds API error: ' + txt.slice(0, 200) }) };
    }

    const games = await res.json();
    if (!Array.isArray(games) || !games.length) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=1800' },
        body: JSON.stringify({ games: [], note: 'No NFL odds available yet — check back once the season starts.' })
      };
    }

    const result = [];

    games.forEach(function(game) {
      const homeTeam = game.home_team;
      const awayTeam = game.away_team;
      const homeAbbr  = abbr(homeTeam);
      const awayAbbr  = abbr(awayTeam);
      const kickoff   = game.commence_time || null;

      let homeSpread = null, total = null;

      // Average across bookmakers for a more stable line.
      const spreads = [], totals = [];
      (game.bookmakers || []).forEach(function(book) {
        (book.markets || []).forEach(function(market) {
          if (market.key === 'spreads') {
            const ho = (market.outcomes || []).find(function(o) { return o.name === homeTeam; });
            if (ho && ho.point != null) spreads.push(ho.point);
          }
          if (market.key === 'totals') {
            const ov = (market.outcomes || []).find(function(o) { return o.name === 'Over'; });
            if (ov && ov.point != null) totals.push(ov.point);
          }
        });
      });

      if (spreads.length) homeSpread = spreads.reduce(function(a,b){return a+b;},0) / spreads.length;
      if (totals.length)  total      = totals.reduce(function(a,b){return a+b;},0) / totals.length;

      if (homeSpread === null || total === null) return;

      // Implied team total:
      // homeImplied = (total - homeSpread) / 2
      // awayImplied = total - homeImplied
      // If home is favored: homeSpread < 0, so homeImplied > total/2 ✓
      const homeImplied = Math.round(((total - homeSpread) / 2) * 10) / 10;
      const awayImplied = Math.round((total - homeImplied) * 10) / 10;
      const spread      = Math.round(homeSpread * 10) / 10; // negative = home favored
      const ouLine      = Math.round(total * 10) / 10;

      result.push({
        homeTeam: homeAbbr, awayTeam: awayAbbr,
        homeImplied, awayImplied,
        spread, ouLine, kickoff,
      });
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=1800', // 30-min cache; lines shift but not constantly
      },
      body: JSON.stringify({ games: result }),
    };

  } catch (e) {
    console.error('Vegas fetch error:', e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
