
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase URL or Key not found in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectData() {
    console.log('Fetching first 10 rows from locais...');
    const { data, error } = await supabase
        .from('locais')
        .select('id, codigo_pdv, latitude, longitude')
        .limit(10);

    if (error) {
        console.error('Error fetching data:', error);
        return;
    }

    console.log('Data sample:');
    data.forEach(row => {
        console.log(`ID: ${row.id}, Code: ${row.codigo_pdv}, Lat: "${row.latitude}" (${typeof row.latitude}), Lng: "${row.longitude}" (${typeof row.longitude})`);
    });
}

inspectData();
