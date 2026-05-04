const fetch = require('node-fetch');

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

exports.handler = async function(event, context) {
  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const supabase = getSupabaseClient(true); // Read with anon key

    // Get league config
    const leagueConfigs = await supabase.query('league_config', 'GET', null, '?select=*&limit=1');

    if (!leagueConfigs || leagueConfigs.length === 0) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          needsSetup: true,
          error: 'No league configured yet'
        })
      };
    }

    const config = leagueConfigs[0];
    const leagueId = config.league_id;

    // Fetch from Sleeper API
    const [leagueResponse, rostersResponse, usersResponse, playersResponse] = await Promise.all([
      fetch(`https://api.sleeper.app/v1/league/${leagueId}`),
      fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`),
      fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`),
      fetch('https://api.sleeper.app/v1/players/nfl')
    ]);

    const league = await leagueResponse.json();
    const rosters = await rostersResponse.json();
    const users = await usersResponse.json();
    const allPlayers = await playersResponse.json();

    // Get all player IDs currently on rosters
    const activePlayerIds = new Set();
    rosters.forEach(roster => {
      (roster.players || []).forEach(pid => activePlayerIds.add(pid));
    });

    // Get existing player salaries from database
    const playerSalaries = await supabase.query('player_salaries', 'GET', null, `?league_id=eq.${leagueId}&select=*`);

    // Get custom draft picks
    let customPicks = [];
    try {
      customPicks = await supabase.query('draft_picks', 'GET', null, `?league_id=eq.${leagueId}&select=*`);
    } catch (error) {
      console.log('No custom draft picks table or no picks:', error);
    }

    // Create salary lookup
    const salaryMap = {};
    playerSalaries.forEach(ps => {
      salaryMap[ps.player_id] = {
        salary: ps.current_salary,
        isKeeper: ps.is_keeper,
        yearsKept: ps.years_kept
      };
    });

    // Find players to ADD (on roster but not in DB)
    const newPlayers = [];
    activePlayerIds.forEach(pid => {
      if (!salaryMap[pid]) {
        newPlayers.push({
          league_id: leagueId,
          player_id: pid,
          player_name: allPlayers[pid] ? `${allPlayers[pid].first_name || ''} ${allPlayers[pid].last_name || ''}`.trim() : 'Unknown',
          position: allPlayers[pid]?.position || 'N/A',
          team: allPlayers[pid]?.team || 'FA',
          current_salary: 1, // Default $1 for new pickups
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

    // Find players to REMOVE (in DB but not on any roster)
    const droppedPlayerIds = [];
    playerSalaries.forEach(ps => {
      if (!activePlayerIds.has(ps.player_id)) {
        droppedPlayerIds.push(ps.player_id);
      }
    });

    // Use service key client for write operations
    const writeClient = getSupabaseClient(true);

    // Insert new players
    if (newPlayers.length > 0) {
      await writeClient.query('player_salaries', 'POST', newPlayers);
      console.log(`Added ${newPlayers.length} new players`);
    }

    // Delete dropped players
    if (droppedPlayerIds.length > 0) {
      // Supabase doesn't support IN queries easily, so delete one at a time
      for (const playerId of droppedPlayerIds) {
        await writeClient.query(
          'player_salaries',
          'DELETE',
          null,
          `?league_id=eq.${leagueId}&player_id=eq.${playerId}`
        );
      }
      console.log(`Removed ${droppedPlayerIds.length} dropped players`);
    }

    // CRITICAL FIX: Only return players that are on rosters (not entire NFL database)
    const rosterPlayers = {};
    activePlayerIds.forEach(pid => {
      if (allPlayers[pid]) {
        rosterPlayers[pid] = allPlayers[pid];
      }
    });

    // Return combined data
    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        config: {
          salaryCap: config.salary_cap,
          lastSync: config.last_sync
        },
        league,
        rosters,
        users,
        players: rosterPlayers,
        salaries: salaryMap,
        customPicks: customPicks || []
      })
    };

  } catch (error) {
    console.error('Error in get-public-data:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'Failed to load league data',
        details: error.message 
      })
    };
  }
};
