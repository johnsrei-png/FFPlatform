const { getSupabaseClient } = require('./supabase-client');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { year, champion, runnerUp, third, ownerRecords } = JSON.parse(event.body);

    if (!year || isNaN(parseInt(year))) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'A valid year is required' })
      };
    }

    const supabase = getSupabaseClient(true); // service key for writes
    const yr = parseInt(year);

    // --- Upsert the season (champion / runner-up / third) ---
    // Check if the season already exists
    const existing = await supabase.query(
      'league_seasons',
      'GET',
      null,
      `?year=eq.${yr}&select=year`
    );

    const seasonRow = {
      year: yr,
      champion: champion || null,
      runner_up: runnerUp || null,
      third: third || null
    };

    if (existing && existing.length > 0) {
      await supabase.query(
        'league_seasons',
        'PATCH',
        { champion: seasonRow.champion, runner_up: seasonRow.runner_up, third: seasonRow.third },
        `?year=eq.${yr}`
      );
    } else {
      await supabase.query('league_seasons', 'POST', seasonRow);
    }

    // --- Upsert each owner's record for the year ---
    if (Array.isArray(ownerRecords)) {
      for (const rec of ownerRecords) {
        if (!rec || !rec.owner) continue;

        const payload = {
          year: yr,
          owner: rec.owner,
          reg_wins: rec.regWins != null && rec.regWins !== '' ? parseInt(rec.regWins) : null,
          reg_losses: rec.regLosses != null && rec.regLosses !== '' ? parseInt(rec.regLosses) : null,
          playoff_wins: rec.playoffWins != null && rec.playoffWins !== '' ? parseInt(rec.playoffWins) : null,
          playoff_losses: rec.playoffLosses != null && rec.playoffLosses !== '' ? parseInt(rec.playoffLosses) : null,
          points_for: rec.pointsFor != null && rec.pointsFor !== '' ? parseFloat(rec.pointsFor) : null,
          points_against: rec.pointsAgainst != null && rec.pointsAgainst !== '' ? parseFloat(rec.pointsAgainst) : null
        };

        const existingOwner = await supabase.query(
          'league_owner_seasons',
          'GET',
          null,
          `?year=eq.${yr}&owner=eq.${encodeURIComponent(rec.owner)}&select=owner`
        );

        if (existingOwner && existingOwner.length > 0) {
          await supabase.query(
            'league_owner_seasons',
            'PATCH',
            payload,
            `?year=eq.${yr}&owner=eq.${encodeURIComponent(rec.owner)}`
          );
        } else {
          await supabase.query('league_owner_seasons', 'POST', payload);
        }
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: `Season ${yr} saved` })
    };

  } catch (error) {
    console.error('Error saving season:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
