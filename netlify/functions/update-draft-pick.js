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

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { leagueId, currentOwner, originalOwner, year, action } = JSON.parse(event.body);

    if (!leagueId || !currentOwner || !originalOwner || !year || !action) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }

    const supabase = getSupabaseClient(true);

    if (action === 'add') {
      // Add a custom draft pick assignment
      await supabase.query(
        'draft_picks',
        'POST',
        {
          league_id: leagueId,
          current_owner: currentOwner,
          original_owner: originalOwner,
          year: year,
          round: 1
        }
      );
    } else if (action === 'remove') {
      // Remove a custom draft pick assignment
      await supabase.query(
        'draft_picks',
        'DELETE',
        null,
        `?league_id=eq.${leagueId}&current_owner=eq.${currentOwner}&original_owner=eq.${originalOwner}&year=eq.${year}`
      );
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true })
    };

  } catch (error) {
    console.error('Error updating draft pick:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'Failed to update draft pick',
        details: error.message 
      })
    };
  }
};
