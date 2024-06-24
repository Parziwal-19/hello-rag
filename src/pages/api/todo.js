import { createClient } from '@supabase/supabase-js'

async function fetchData() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  const { data: fetchedData, error } = await supabase
    .from('todo-table')
    .select();
  if (error) {
    console.error('Error fetching data:', error);
  } else {
    return fetchedData;
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    var data = await fetchData();
    res.status(200).json(data);
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
