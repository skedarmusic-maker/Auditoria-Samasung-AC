
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import csv from 'csv-parser';
import dotenv from 'dotenv';
import path from 'path';

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from the app's .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase URL or Key in .env file");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const csvFilePath = path.resolve(__dirname, '../../public/locais_rows fnal.xlsx.csv');

const results = [];

console.log(`Reading CSV from: ${csvFilePath}`);

fs.createReadStream(csvFilePath)
    .pipe(csv({ separator: ';' }))
    .on('data', (data) => results.push(data))
    .on('end', async () => {
        try {
            console.log(`Parsed ${results.length} rows. Starting upload...`);

            const formattedData = results.map(row => {
                let val = row.latitude;
                return {
                    codigo_pdv: row.codigo_pdv,
                    nome_pdv: row.nome_pdv,
                    endereco: row.endereco,
                    cidade: row.cidade,
                    uf: row.uf,
                    latitude: row.latitude,
                    longitude: row.longitude
                };
            });

            const chunkSize = 100;
            for (let i = 0; i < formattedData.length; i += chunkSize) {
                const chunk = formattedData.slice(i, i + chunkSize);
                console.log(`Uploading chunk ${i / chunkSize}...`);
                const { error } = await supabase.from('locais').upsert(chunk, { onConflict: 'codigo_pdv' });

                if (error) {
                    console.error(`Error inserting chunk ${i / chunkSize}:`, JSON.stringify(error, null, 2));
                } else {
                    console.log(`Inserted chunk ${i / chunkSize} successfully.`);
                }
            }

            console.log("Upload finished.");
        } catch (err) {
            console.error("FATAL ERROR:", err);
        }
    });
