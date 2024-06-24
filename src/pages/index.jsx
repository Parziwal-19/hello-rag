import { useState } from "react";
import { createClient } from '@supabase/supabase-js'


const supabase = createClient('https://wkjrdowvrrbceqyugbhf.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndranJkb3d2cnJiY2VxeXVnYmhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTkyMTQxMTYsImV4cCI6MjAzNDc5MDExNn0.ETBAowuq3xSZys0M52Z-ILYcxW7blnPuQH9RLEnkINc')
const { data, error } = await supabase
  .from('todo-list')
  .select()
  


export default function Home() {
  return <div>{data}</div>;
}