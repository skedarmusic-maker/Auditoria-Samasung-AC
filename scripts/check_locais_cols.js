import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

console.log('🔁 Forçando reload do schema cache via NOTIFY...');

// Call a postgres function using rpc to issue NOTIFY pgrst, 'reload schema'
// Supabase exposes pg_notify via rpc if it exists, but usually we need a custom function.
// Let's try a raw SQL approach via supabase.rpc('pg_reload_conf') 
// Actually the correct way: NOTIFY pgrst, 'reload schema';
// Let's try via the REST API to POST to /rest/v1/rpc/reload_schema (if defined)
// OR: simply insert a test row with cnpj to detect if cache is refreshed

console.log('🔍 Testando se coluna cnpj está acessível...');

const { data, error } = await supabase
    .from('locais')
    .select('cnpj')
    .limit(1);

if (error) {
    console.log('❌ cnpj ainda não está acessível:', error.message);
    console.log('');
    console.log('💡 Para forçar o reload, execute este SQL no Supabase Dashboard:');
    console.log('   NOTIFY pgrst, \'reload schema\';');
    console.log('');
    console.log('   Depois rode novamente: node scripts/import_base_ac.js');
} else {
    console.log('✅ Coluna cnpj acessível! Pode rodar o import agora.');
}
