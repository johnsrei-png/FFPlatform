const fetch = require('node-fetch');

const SLEEPER_API_BASE = 'https://api.sleeper.app/v1';

function getSupabaseClient(useServiceKey = false) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = useServiceKey ? process.env.SUPABASE_SERVICE_KEY : process.env.SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured');
  }

  return {
    url: supabaseUrl,
    key: supabaseKey,
    async query(table, method = 'GET', body = null, queryParams = '') {
      const url = `${supabaseUrl}/rest/v1/${table}${queryParams}`;
      const options = {
        method,
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        }
      };
      
      if (body) {
        options.body = JSON.stringify(body);
      }
      
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
    const leagueConfigs = await supabase.query('league_config', 'GET', null, '?select=*&limit=1');
    
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

    // Get unique player IDs from rosters FIRST
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

    // Get player salaries from database
    const playerSalaries = await supabase.query(
      'player_salaries',
      'GET',
      null,
      '?league_id=eq.' + leagueId + '&select=*'
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

    // Check for new players and auto-assign default salary
    const newPlayers = [];
    playerIds.forEach(pid => {
      if (!salaryMap[pid]) {
        newPlayers.push({
          league_id: leagueId,
          player_id: pid,
          player_name: allPlayers[pid] ? `${allPlayers[pid].first_name || ''} ${allPlayers[pid].last_name || ''}`.trim() : 'Unknown',
          position: allPlayers[pid]?.position || 'N/A',
          team: allPlayers[pid]?.team || 'FA',
          current_salary: 1,
          is_keeper: false,
          years_kept: 0
        });
        salaryMap[pid] = {
          salary: 1,
          isKeeper: false,
          yearsKept: 0
        };
      }
    });

    // Insert new players into database
    if (newPlayers.length > 0) {
      const writeClient = getSupabaseClient(true);
      await writeClient.query('player_salaries', 'POST', newPlayers);
    }

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
