
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    // 1. Check if ANY bandeira is set
    const { count, error } = await supabase
        .from('locais')
        .select('*', { count: 'exact', head: true })
        .not('bandeira', 'is', null);

    console.log(`Rows with bandeira: ${count} (Error: ${error?.message})`);

    // 2. Fetch a specific row to check code format
    // Try to find 10901 by casting or just listing
    const { data: sample, error: err2 } = await supabase
        .from('locais')
        .select('*')
        .eq('codigo_pdv', 10901)
        .limit(1);

    if (sample && sample.length > 0) {
        console.log('Found 10901:', sample[0]);
    } else {
        console.log('Did NOT find 10901. Listing first 3 rows:');
        const { data: list } = await supabase.from('locais').select('*').limit(3);
        console.log(list);
    }
}

run();
