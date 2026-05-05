const getSupabaseClient = (useServiceKey = false) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = useServiceKey 
    ? process.env.SUPABASE_SERVICE_KEY 
    : process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables');
  }

  const query = async (table, method = 'GET', data = null, queryParams = '') => {
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

    if (data && (method === 'POST' || method === 'PATCH')) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Supabase error: ${response.status} - ${error}`);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
  };

  return { query };
};

module.exports = { getSupabaseClient };
