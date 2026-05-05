const fetch = require('node-fetch');

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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const supabase = getSupabaseClient();
    
    if (event.httpMethod === 'POST') {
      const { playerId, newSalary, leagueId, customEscalation } = JSON.parse(event.body);

      if (!playerId || !newSalary || !leagueId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Missing required fields' })
        };
      }

      // Update the player salary
      const result = await supabase.query(
  'player_salaries',
  'PATCH',
  {
    current_salary: newSalary,
    custom_escalation: customEscalation !== '' && customEscalation !== null ? parseInt(customEscalation) : null
  },
  `?player_id=eq.${playerId}&league_id=eq.${leagueId}`
);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Salary updated successfully',
          result
        })
      };

    } else {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Use POST to update salary' })
      };
    }

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to update salary',
        message: error.message 
      })
    };
  }
};
