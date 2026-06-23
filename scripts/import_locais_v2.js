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
const csvFilePath = path.join(__dirname, '../public/locais_rows fnal.xlsx.csv');

async function importData() {
    console.log(`Lendo: ${csvFilePath}`);
    const csvFile = fs.readFileSync(csvFilePath, 'latin1');

    Papa.parse(csvFile, {
        header: true,
        delimiter: ';',
        skipEmptyLines: true,
        complete: async (results) => {
            let records = [];

            results.data.forEach(row => {
                const cod = row.codigo_pdv || row['código_pdv'] || row['cdigo_pdv'] || row['cdigo_pdv'];
                // skip if no code
                if (!cod || !cod.trim()) return;

                // parse coordinates cleanly (sometimes they have weird dots like -4.632.592)
                let lat = null;
                let lng = null;
                try {
                    if (row.latitude) {
                        const strLat = String(row.latitude).replace(/\./g, '').replace(',', '.');
                        lat = parseFloat(strLat);
                    }
                    if (row.longitude) {
                        const strLng = String(row.longitude).replace(/\./g, '').replace(',', '.');
                        lng = parseFloat(strLng);
                    }
                } catch (e) { }

                records.push({
                    codigo_pdv: cod.trim(),
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
