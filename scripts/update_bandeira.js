
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import csv from 'csv-parser';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const CSV_PATH = path.resolve(__dirname, '../../public/locais_rows fnal.xlsx.csv');

async function run() {
    console.log(`Checking CSV path: ${CSV_PATH}`);
    if (!fs.existsSync(CSV_PATH)) {
        console.error(`ERROR: CSV file not found at ${CSV_PATH}`);
        return;
    }

    console.log(`Reading CSV...`);
    const updates = [];
    let rowCount = 0;

    fs.createReadStream(CSV_PATH)
        .pipe(csv({ separator: ';' }))
        .on('data', (row) => {
            rowCount++;
            if (rowCount === 1) console.log('First row sample:', row);

            if (row.codigo_pdv && row.bandeira) {
                updates.push({
                    codigo_pdv: row.codigo_pdv.trim(),
                    bandeira: row.bandeira.trim()
                });
            }
        })
        .on('error', (error) => {
            console.error('Stream Error:', error);
        })
        .on('end', async () => {
            console.log(`\nCSV Parsing Complete.`);
            console.log(`Total Rows in CSV: ${rowCount}`);
            console.log(`Valid Updates Found: ${updates.length}`);

            if (updates.length > 0) {
                await processUpdates(updates);
            } else {
                console.warn("No updates found. Check CSV headers/content.");
            }
        });
}

async function processUpdates(rows) {
    console.log('Starting updates...');
    let success = 0;
    let errors = 0;

    // Process in batches to control concurrency
    const BATCH_SIZE = 20;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async (item) => {
            const { error } = await supabase
                .from('locais')
                .update({ bandeira: item.bandeira })
                .eq('codigo_pdv', item.codigo_pdv);

            if (error) {
                console.error(`Failed to update ${item.codigo_pdv}:`, error.message);
                errors++;
            } else {
                success++;
            }
        }));

        if (i % 100 === 0) {
            console.log(`Processed ${i} / ${rows.length}...`);
        }
    }

    console.log(`\nUpdate Complete.`);
    console.log(`Success: ${success}`);
    console.log(`Errors: ${errors}`);
}

run();
