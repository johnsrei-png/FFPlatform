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
      
      const text = await response.text();
      return text ? JSON.parse(text) : [];
    }
  };
}

function getKeeperEscalation(salary) {
  if (salary >= 1 && salary <= 5) return 2;
  if (salary >= 6 && salary <= 10) return 4;
  if (salary >= 11 && salary <= 20) return 6;
  if (salary >= 21 && salary <= 30) return 8;
  if (salary >= 31 && salary <= 40) return 10;
  if (salary >= 41 && salary <= 50) return 15;
  if (salary >= 51 && salary <= 100) return 20;
  if (salary >= 101) return 25;
  return 0;
}

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { leagueId } = JSON.parse(event.body);

    if (!leagueId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing leagueId' })
      };
    }

    const supabase = getSupabaseClient(true); // Use service key

    // Get all current salaries
    const salaries = await supabase.query('player_salaries', 'GET', null, `?league_id=eq.${leagueId}&select=*`);

    if (!salaries || salaries.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No salaries found for this league' })
      };
    }

    // Update each salary with escalation
    let updatedCount = 0;
    for (const salary of salaries) {
      const escalation = getKeeperEscalation(salary.current_salary);
      const newSalary = salary.current_salary + escalation;
      
      // Update the salary in database
      await supabase.query(
        'player_salaries',
        'PATCH',
        { current_salary: newSalary },
        `?player_id=eq.${salary.player_id}&league_id=eq.${leagueId}`
      );
      
      updatedCount++;
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        success: true,
        updated: updatedCount,
        message: `Successfully advanced season. ${updatedCount} salaries updated.`
      })
    };

  } catch (error) {
    console.error('Error advancing season:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'Failed to advance season',
        details: error.message 
      })
    };
  }
};
