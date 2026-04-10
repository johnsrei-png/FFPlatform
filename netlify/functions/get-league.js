const fetch = require('node-fetch');

const SLEEPER_API_BASE = 'https://api.sleeper.app/v1';

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { leagueId } = event.queryStringParameters;

    if (!leagueId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'League ID is required' })
      };
    }

    // Fetch league, rosters, and users (NOT players - too big!)
    const [leagueResponse, rostersResponse, usersResponse] = await Promise.all([
      fetch(`${SLEEPER_API_BASE}/league/${leagueId}`),
      fetch(`${SLEEPER_API_BASE}/league/${leagueId}/rosters`),
      fetch(`${SLEEPER_API_BASE}/league/${leagueId}/users`)
    ]);

    // Check for errors
    if (!leagueResponse.ok) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'League not found' })
      };
    }

    const [league, rosters, users] = await Promise.all([
      leagueResponse.json(),
      rostersResponse.json(),
      usersResponse.json()
    ]);

    // Fetch recent transactions (last 3 weeks)
    const currentWeek = Math.min(league.settings.playoff_week_start - 1, 18);
    const transactionsPromises = [];
    
    for (let week = Math.max(1, currentWeek - 2); week <= currentWeek; week++) {
      transactionsPromises.push(
        fetch(`${SLEEPER_API_BASE}/league/${leagueId}/transactions/${week}`)
          .then(r => r.ok ? r.json() : [])
          .catch(() => [])
      );
    }

    const transactionsArrays = await Promise.all(transactionsPromises);
    const transactions = transactionsArrays.flat().slice(0, 20);

    // Get unique player IDs from rosters
    const playerIds = new Set();
    rosters.forEach(roster => {
      if (roster.players) {
        roster.players.forEach(pid => playerIds.add(pid));
      }
    });

    // Fetch only the players we need
    const allPlayersResponse = await fetch(`${SLEEPER_API_BASE}/players/nfl`);
    const allPlayers = await allPlayersResponse.json();
    
    // Filter to only players in this league
    const leaguePlayers = {};
    playerIds.forEach(pid => {
      if (allPlayers[pid]) {
        leaguePlayers[pid] = allPlayers[pid];
      }
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        league,
        rosters,
        users,
        players: leaguePlayers,  // Only players in this league
        transactions
      })
    };
  } catch (error) {
    console.error('Error fetching league data:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to fetch league data',
        message: error.message 
      })
    };
  }
};
