
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkCount() {
    const { count, error } = await supabase.from('locais').select('*', { count: 'exact', head: true });
    if (error) {
        console.error("Erro ao buscar contagem:", error);
    } else {
        console.log(`Total de registros na tabela 'locais': ${count}`);
    }
}

checkCount();
