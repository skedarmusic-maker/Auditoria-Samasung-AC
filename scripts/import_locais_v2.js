import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import Papa from 'papaparse';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) { process.exit(1); }

const supabase = createClient(supabaseUrl, supabaseKey);

const csvFilePath = path.join(__dirname, '../public/locais_rows fnal março.csv');

async function importData() {
    console.log(`Lendo: ${csvFilePath}`);
    const csvFile = fs.readFileSync(csvFilePath, 'utf8');

    Papa.parse(csvFile, {
        header: true,
        delimiter: ';',
        skipEmptyLines: true,
        complete: async (results) => {
            let records = [];

            results.data.forEach(row => {
                // skip if no code
                if (!row.codigo_pdv || !row.codigo_pdv.trim()) return;

                // parse coordinates cleanly (sometimes they have weird dots like -4.632.592)
                let lat = null;
                let lng = null;
                try {
                    if (row.latitude) {
                        const strLat = String(row.latitude).replace('.', '').replace(',', '.');
                        // Se tiver mais de um ponto ou virgula, o parseFloat já cuida de trazer pelo menos o número principal ou a gente precisa limpar melhor? 
                        // Como era uma exportação do banco, provavelmente estão "sujas" do Excel se abertas em português e salvas de novo. 
                        // Vamos deixar o DB resolver a coersão ou o Supabase retorna erro se mandar string errada pra numeric. 
                        // Vou mandar como float validado.
                        lat = parseFloat(row.latitude);
                    }
                    if (row.longitude) lng = parseFloat(row.longitude);
                } catch (e) { }

                records.push({
                    codigo_pdv: row.codigo_pdv.trim(),
                    nome_pdv: row.nome_pdv || null,
                    endereco: row.endereco || null,
                    cidade: row.cidade || null,
                    uf: row.uf || null,
                    latitude: isNaN(lat) ? null : lat,
                    longitude: isNaN(lng) ? null : lng,
                    bandeira: row.bandeira || null
                });
            });

            console.log(`Total Extraído: ${records.length}`);

            console.log('Deletando locais antigos...');
            const { error: delError } = await supabase.from('locais').delete().not('codigo_pdv', 'is', null);
            if (delError) console.error("Erro deletando:", delError);

            console.log('Inserindo nova base...');
            const batchSize = 250;
            let totalInserted = 0;
            for (let i = 0; i < records.length; i += batchSize) {
                const batch = records.slice(i, i + batchSize);
                const { error } = await supabase.from('locais').insert(batch);
                if (error) {
                    console.error("Erro inserindo batch:", error);
                } else {
                    totalInserted += batch.length;
                    console.log(`Inseridos ${totalInserted}...`);
                }
            }
            console.log('Finalizado com sucesso!');
        }
    });
}
importData();
