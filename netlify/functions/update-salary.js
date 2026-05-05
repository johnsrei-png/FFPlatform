const { getSupabaseClient } = require('./supabase-client');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { playerId, newSalary, leagueId, customEscalation, acquisitionType } = JSON.parse(event.body);

    if (!playerId || !newSalary || !leagueId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }

    if (isNaN(newSalary) || newSalary < 1 || newSalary > 200) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Salary must be between $1 and $200' })
      };
    }

    const supabase = getSupabaseClient(true); // Use service key for write operations

    // Check if player exists in database
    const existingPlayer = await supabase.query(
      'player_salaries',
      'GET',
      null,
      `?player_id=eq.${playerId}&league_id=eq.${leagueId}`
    );

    if (existingPlayer && existingPlayer.length > 0) {
      // Update existing player
      await supabase.query(
        'player_salaries',
        'PATCH',
        {
          current_salary: newSalary,
          custom_escalation: customEscalation !== '' && customEscalation !== null ? parseInt(customEscalation) : null,
          acquisition_type: acquisitionType || null
        },
        `?player_id=eq.${playerId}&league_id=eq.${leagueId}`
      );
    } else {
      // Insert new player
      await supabase.query(
        'player_salaries',
        'POST',
        {
          player_id: playerId,
          league_id: leagueId,
          current_salary: newSalary,
          is_keeper: true,
          years_kept: 0,
          custom_escalation: customEscalation !== '' && customEscalation !== null ? parseInt(customEscalation) : null,
          acquisition_type: acquisitionType || null
        }
      );
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true,
        message: 'Salary updated successfully'
      })
    };

  } catch (error) {
    console.error('Error updating salary:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
