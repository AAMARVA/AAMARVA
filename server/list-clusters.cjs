const { getSupabaseClient, getClusterTables } = require('./db.js');
const { getSupabaseClient: gs } = require('./supabase.js');

async function listClusters() {
  const supabase = gs();
  const tables = await getClusterTables(supabase);
  const { data, error } = await supabase.from(tables.clusters).select('id, name');
  console.log(JSON.stringify(data, null, 2));
}

listClusters().catch(console.error);
