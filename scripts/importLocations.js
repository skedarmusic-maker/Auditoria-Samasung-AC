import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import Papa from 'papaparse';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from parent directory
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Path to public/Cadastro_Locais.csv
// Assuming structure: root/app/scripts/importLocations.js
// CSV is in: root/public/Cadastro_Locais.csv (or root/app/public?)
// User trace said "public\Cadastro_Locais.csv", usually implies root public if Vite app.
// But find_by_name found "public\Cadastro_Locais.csv". 
// Let's try to find it relative to app root or project root.
// If run from 'app', '../public' relative to 'app' is 'root/public'.
const csvFilePath = path.join(__dirname, '../../public/Cadastro_Locais.csv');

async function importData() {
    try {
        console.log(`Reading CSV from: ${csvFilePath}`);
        const csvFile = fs.readFileSync(csvFilePath, 'utf8');

        Papa.parse(csvFile, {
            header: true,
            delimiter: ';',
            skipEmptyLines: true,
            complete: async (results) => {
                const uniqueRowsMap = new Map();
                let skippedNoId = 0;
                let duplicateCount = 0;

                results.data.forEach((row) => {
                    let lat = null;
                    let lng = null;
                    const coordRaw = row['COORDENADA'] || row['COORDENADAS'];

                    if (coordRaw) {
                        const parts = coordRaw.split(',');
                        if (parts.length === 2) {
                            lat = parseFloat(parts[0].trim());
                            lng = parseFloat(parts[1].trim());
                        }
                    }

                    // Extract ID from name (e.g. "12866 - ...") or use PDV code
                    let codigo = null;
                    const name = row['NOME PDV'] || '';
                    const nameMatch = name.match(/^(\d+)\s*-\s*/);

                    if (nameMatch && nameMatch[1]) {
                        codigo = nameMatch[1];
                    } else if (row['CÓDIGO PDV'] && !String(row['CÓDIGO PDV']).includes('E+')) {
                        codigo = row['CÓDIGO PDV'];
                    }

                    if (!codigo) {
                        skippedNoId++;
                        return;
                    }

                    const cleanCode = String(codigo).trim();

                    if (uniqueRowsMap.has(cleanCode)) {
                        duplicateCount++;
                        return;
                    }

                    uniqueRowsMap.set(cleanCode, {
                        codigo_pdv: cleanCode,
                        nome_pdv: name,
                        razao_social: row['RAZÃO SOCIAL'],
                        status: row['STATUS'],
                        endereco: row['ENDEREÇO'],
                        bairro: row['BAIRRO'],
                        cidade: row['CIDADE'],
                        uf: row['UF'],
                        cep: row['CEP'],
                        latitude: lat,
                        longitude: lng
                    });
                });

                const rows = Array.from(uniqueRowsMap.values());

                console.log(`CSV Total Rows: ${results.data.length}`);
                console.log(`Unique Rows to Import: ${rows.length}`);
                console.log(`Skipped: ${skippedNoId} (No valid ID), ${duplicateCount} (Duplicates)`);

                // 3. Clear Existing Data
                console.log('Deleting existing records...');
                const { error: deleteError } = await supabase
                    .from('locais')
                    .delete()
                    .not('codigo_pdv', 'is', null);

                if (deleteError) {
                    console.error('Error clearing table:', deleteError.message);
                    return;
                }
                console.log('Table cleared.');

                // 4. Insert New Data
                const batchSize = 100;
                let totalInserted = 0;
                for (let i = 0; i < rows.length; i += batchSize) {
                    const batch = rows.slice(i, i + batchSize);
                    const { error } = await supabase.from('locais').insert(batch);

                    if (error) {
                        console.error(`Error inserting batch ${i}:`, error.message);
                    } else {
                        totalInserted += batch.length;
                        console.log(`Inserted batch ${i}..${i + batch.length} (Total: ${totalInserted})`);
                    }
                }

                console.log(`Import completed! Total visible in DB: ${totalInserted}`);
            },
            error: (err) => {
                console.error('Error parsing CSV:', err);
            }
        });
    } catch (err) {
        console.error('Error reading/processing file:', err);
    }
}

importData();
