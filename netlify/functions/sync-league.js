const fetch = require('node-fetch');

const SLEEPER_API_BASE = 'https://api.sleeper.app/v1';

function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  
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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const supabase = getSupabaseClient();
    
    if (event.httpMethod === 'POST') {
      const { leagueId, csvData } = JSON.parse(event.body);

      if (!leagueId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'League ID required' })
        };
      }

      // Fetch league data from Sleeper
      const [leagueResponse, rostersResponse, usersResponse] = await Promise.all([
        fetch(`${SLEEPER_API_BASE}/league/${leagueId}`),
        fetch(`${SLEEPER_API_BASE}/league/${leagueId}/rosters`),
        fetch(`${SLEEPER_API_BASE}/league/${leagueId}/users`)
      ]);

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

      // Get all players
      const allPlayersResponse = await fetch(`${SLEEPER_API_BASE}/players/nfl`);
      const allPlayers = await allPlayersResponse.json();

      // Get unique player IDs
      const playerIds = new Set();
      rosters.forEach(roster => {
        if (roster.players) {
          roster.players.forEach(pid => playerIds.add(pid));
        }
      });

      // Filter to only league players
      const leaguePlayers = {};
      playerIds.forEach(pid => {
        if (allPlayers[pid]) {
          leaguePlayers[pid] = allPlayers[pid];
        }
      });

      // Save league config
      await supabase.query('league_config', 'POST', {
        league_id: leagueId,
        league_name: league.name,
        season: league.season.toString(),
        salary_cap: 200,
        last_sync: new Date().toISOString()
      });

      // Prepare player salary data
      const playerSalaries = [];
      
      Object.entries(leaguePlayers).forEach(([playerId, player]) => {
        const playerName = `${player.first_name || ''} ${player.last_name || ''}`.trim();
        
        // Try to match with CSV data
        let salary = 10; // Default
        if (csvData) {
          const csvMatch = Object.entries(csvData).find(([csvPlayer]) => {
            const normalize = (name) => name.toLowerCase().replace(/[^a-z]/g, '');
            const playerNorm = normalize(playerName);
            const csvNorm = normalize(csvPlayer);
            return playerNorm.includes(csvNorm) || csvNorm.includes(playerNorm);
          });
          if (csvMatch) {
            salary = csvMatch[1];
          }
        }

        playerSalaries.push({
          league_id: leagueId,
          player_id: playerId,
          player_name: playerName,
          position: player.position || 'N/A',
          team: player.team || 'FA',
          current_salary: salary,
          is_keeper: false,
          years_kept: 0
        });
      });

      // Batch insert player salaries
      if (playerSalaries.length > 0) {
        await supabase.query('player_salaries', 'POST', playerSalaries);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'League data saved to database',
          playersImported: playerSalaries.length
        })
      };

    } else {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Use POST to sync data' })
      };
    }

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to sync league data',
        message: error.message 
      })
    };
  }
};
