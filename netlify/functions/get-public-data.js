const fetch = require('node-fetch');

const SLEEPER_API_BASE = 'https://api.sleeper.app/v1';

function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured');
  }

  return {
    url: supabaseUrl,
    key: supabaseKey,
    async query(table, queryParams = '') {
      const url = `${supabaseUrl}/rest/v1/${table}${queryParams}`;
      const options = {
        method: 'GET',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      };
      
      const response = await fetch(url, options);
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Supabase error: ${error}`);
      }
      
      return response.json();
    }
  };
}

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const supabase = getSupabaseClient();

    // Get league config
    const leagueConfigs = await supabase.query('league_config', '?select=*&limit=1');
    
    if (!leagueConfigs || leagueConfigs.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ 
          error: 'No league configured yet',
          needsSetup: true 
        })
      };
    }

    const leagueConfig = leagueConfigs[0];
    const leagueId = leagueConfig.league_id;

    // Get fresh data from Sleeper
    const [leagueResponse, rostersResponse, usersResponse] = await Promise.all([
      fetch(`${SLEEPER_API_BASE}/league/${leagueId}`),
      fetch(`${SLEEPER_API_BASE}/league/${leagueId}/rosters`),
      fetch(`${SLEEPER_API_BASE}/league/${leagueId}/users`)
    ]);

    const [league, rosters, users] = await Promise.all([
      leagueResponse.json(),
      rostersResponse.json(),
      usersResponse.json()
    ]);

    // Get player salaries from database
    const playerSalaries = await supabase.query(
      'player_salaries',
      `?league_id=eq.${leagueId}&select=*`
    );

    // Create salary lookup
    const salaryMap = {};
    playerSalaries.forEach(ps => {
      salaryMap[ps.player_id] = {
        salary: ps.current_salary,
        isKeeper: ps.is_keeper,
        yearsKept: ps.years_kept
      };
    });

    // Get unique player IDs from rosters
    const playerIds = new Set();
    rosters.forEach(roster => {
      if (roster.players) {
        roster.players.forEach(pid => playerIds.add(pid));
      }
    });

    // Fetch players
    const allPlayersResponse = await fetch(`${SLEEPER_API_BASE}/players/nfl`);
    const allPlayers = await allPlayersResponse.json();
    
    const leaguePlayers = {};
    playerIds.forEach(pid => {
      if (allPlayers[pid]) {
        leaguePlayers[pid] = allPlayers[pid];
      }
    });

    // Fetch transactions
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
        players: leaguePlayers,
        transactions,
        salaries: salaryMap,
        config: {
          salaryCap: leagueConfig.salary_cap,
          lastSync: leagueConfig.last_sync
        }
      })
    };

  } catch (error) {
    console.error('Error:', error);
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
