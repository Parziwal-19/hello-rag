import { useState } from "react";
import { createClient } from '@supabase/supabase-js'


const supabase = createClient('hello-rag-seven.vercel.app', 'public-anon-key')
const { data, error } = await supabase
  .from('todo-list')
  .select()
  


export default function Home() {
  return <div>{data}</div>;
}