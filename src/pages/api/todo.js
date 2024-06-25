import { createClient } from '@supabase/supabase-js'
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function fetchData() {
  
  const { data, error } = await supabase
    .from('todos')
    .select();
    console.log(data)
  if (error) {
    console.error('Error fetching data:', error);
  } else {
    return data;
  }
}
async function writeData(data) {
  
  const { error } = await supabase
    .from('todos')
    .insert({list: data.data, id: 123456});
    console.log(data)
  if (error) {
    console.error('Error fetching data:', error);
  } else {
    return data;
  }
}





export default async function handler(req, res) {
  
  if (req.method === 'GET') {
    var data = await fetchData();
    res.status(200).json(data);
  }
  else if (req.method === 'POST') {
    var data = await writeData(req.body);
    res.status(200).json(data);
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

// import { createClient } from '@supabase/supabase-js'

// async function fetchData() {
//   const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
//   const { data, error } = await supabase
//     .from('todos')
//     .select();
//     console.log(data)
//   if (error) {
//     console.error('Error fetching data:', error);
//   } else {
//     return data;
//   }
// }





// export default async function handler(req, res) {
//   if (req.method === 'GET') {
//     var dat = await fetchData();
    
//     res.status(200).json(dat);
//   } else {
//     res.setHeader('Allow', ['GET']);
//     res.status(405).end(`Method ${req.method} Not Allowed`);
//   }
// }