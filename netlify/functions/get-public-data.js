const { getSupabaseClient } = require('./supabase-client');
const https = require('https');

const SLEEPER_API_BASE = 'https://api.sleeper.app/v1';

function fetchWithRetry(url, retries = 3) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    
    const tryFetch = () => {
      attempts++;
      https.get(url, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error('Invalid JSON response'));
            }
          } else if (attempts < retries) {
            setTimeout(tryFetch, 1000 * attempts);
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      }).on('error', (err) => {
        if (attempts < retries) {
          setTimeout(tryFetch, 1000 * attempts);
        } else {
          reject(err);
        }
      });
    };
    
    tryFetch();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const leagueId = event.queryStringParameters?.leagueId;
    
    if (!leagueId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing leagueId parameter' })
      };
    }

    // Fetch league data
    const league = await fetchWithRetry(`${SLEEPER_API_BASE}/league/${leagueId}`);
    
    // Fetch rosters
    const rosters = await fetchWithRetry(`${SLEEPER_API_BASE}/league/${leagueId}/rosters`);
    
    // Fetch users
    const users = await fetchWithRetry(`${SLEEPER_API_BASE}/league/${leagueId}/users`);
    
    // Fetch all players
    const players = await fetchWithRetry(`${SLEEPER_API_BASE}/players/nfl`);

    // Fetch traded picks
    const tradedPicks = await fetchWithRetry(`${SLEEPER_API_BASE}/league/${leagueId}/traded_picks`);

    // Get user map for owner names
    const userMap = {};
    users.forEach(user => {
      userMap[user.user_id] = user.display_name || user.username;
    });

    // Get roster owner map
    const rosterOwnerMap = {};
    rosters.forEach(roster => {
      rosterOwnerMap[roster.roster_id] = userMap[roster.owner_id] || 'Unknown';
    });

    // Fetch salaries from Supabase
    const supabase = getSupabaseClient(true);
    
    const playerSalaries = await supabase.query(
      'player_salaries',
      'GET',
      null,
      `?league_id=eq.${leagueId}&select=*`
    );

    // Fetch custom draft picks from Supabase
    const customPicks = await supabase.query(
      'draft_picks',
      'GET',
      null,
      `?league_id=eq.${leagueId}`
    );

    // Auto-cleanup: Remove salary records for players no longer on any roster
    const allPlayerIds = new Set();
    rosters.forEach(roster => {
      if (roster.players) {
        roster.players.forEach(playerId => allPlayerIds.add(playerId));
      }
    });

    if (playerSalaries && playerSalaries.length > 0) {
      const playersToRemove = playerSalaries.filter(ps => !allPlayerIds.has(ps.player_id));
      
      for (const playerSalary of playersToRemove) {
        await supabase.query(
          'player_salaries',
          'DELETE',
          null,
          `?player_id=eq.${playerSalary.player_id}&league_id=eq.${leagueId}`
        );
      }
    }

    // Build salary map
    const salaryMap = {};
    if (playerSalaries) {
      playerSalaries.forEach(ps => {
        salaryMap[ps.player_id] = {
          salary: ps.current_salary,
          isKeeper: ps.is_keeper,
          yearsKept: ps.years_kept,
          customEscalation: ps.custom_escalation,
          acquisitionType: ps.acquisition_type
        };
      });
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        league,
        rosters,
        users,
        players,
        salaries: salaryMap,
        rosterOwnerMap,
        tradedPicks,
        customPicks: customPicks || []
      })
    };

  } catch (error) {
    console.error('Error fetching public data:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
