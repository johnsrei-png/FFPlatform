const { getSupabaseClient } = require('./supabase-client');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const supabase = getSupabaseClient(true); // service key to read

    // Fetch all seasons (champions), newest first
    const seasons = await supabase.query(
      'league_seasons',
      'GET',
      null,
      '?select=*&order=year.desc'
    );

    // Fetch all owner season records
    const ownerSeasons = await supabase.query(
      'league_owner_seasons',
      'GET',
      null,
      '?select=*&order=year.desc'
    );

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        seasons: seasons || [],
        ownerSeasons: ownerSeasons || []
      })
    };

  } catch (error) {
    console.error('Error fetching league history:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
