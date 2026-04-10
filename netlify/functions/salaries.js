// This function handles saving and retrieving salary data
// For production, you'd want to use a database like Supabase, MongoDB Atlas, or Netlify Blobs
// For now, we'll use localStorage on the client side and this as a backup

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
    if (event.httpMethod === 'POST') {
      // Save salary data
      const { leagueId, salaries } = JSON.parse(event.body);

      // In a real app, you'd save this to a database
      // For now, we'll just return success and rely on client-side localStorage
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true,
          message: 'Data saved (client-side only for demo)'
        })
      };
    } else {
      // Get salary data
      const { leagueId } = event.queryStringParameters;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          salaries: {},
          message: 'Using client-side storage for demo'
        })
      };
    }
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
