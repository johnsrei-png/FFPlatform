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

    // Fetch all data in parallel
    const [leagueResponse, rostersResponse, usersResponse, playersResponse] = await Promise.all([
      fetch(`${SLEEPER_API_BASE}/league/${leagueId}`),
      fetch(`${SLEEPER_API_BASE}/league/${leagueId}/rosters`),
      fetch(`${SLEEPER_API_BASE}/league/${leagueId}/users`),
      fetch(`${SLEEPER_API_BASE}/players/nfl`)
    ]);

    // Check for errors
    if (!leagueResponse.ok) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'League not found' })
      };
    }

    const [league, rosters, users, players] = await Promise.all([
      leagueResponse.json(),
      rostersResponse.json(),
      usersResponse.json(),
      playersResponse.json()
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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        league,
        rosters,
        users,
        players,
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
