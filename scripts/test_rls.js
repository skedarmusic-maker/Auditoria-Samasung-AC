
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function testInsert() {
    console.log("Testando inserção única...");
    const { data, error } = await supabase.from('locais').insert([
        {
            codigo_pdv: 'TEST001',
            nome_pdv: 'PDV TESTE',
            endereco: 'Rua Teste, 123',
            cidade: 'Sao Paulo',
            uf: 'SP',
            latitude: '-23.5505',
            longitude: '-46.6333'
        }
    ]);

    if (error) {
        console.error("ERRO NA INSERÇÃO DE TESTE:", JSON.stringify(error, null, 2));
    } else {
        console.log("Inserção de teste realizada com sucesso!");
        // Limpar o teste
        await supabase.from('locais').delete().eq('codigo_pdv', 'TEST001');
    }
}

testInsert();
