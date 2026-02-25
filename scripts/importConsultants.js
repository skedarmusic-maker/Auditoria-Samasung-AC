
import fs from 'fs';
import Papa from 'papaparse';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import iconv from 'iconv-lite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Adjust filename here as needed
const CSV_FILE_PATH = resolve(__dirname, '../../public/Endereços consultores.csv');

async function importConsultants() {
    if (!fs.existsSync(CSV_FILE_PATH)) {
        console.error(`File not found: ${CSV_FILE_PATH}`);
        return;
    }

    // Read buffer and decode manually from Windows-1252 (common in Excel)
    const buffer = fs.readFileSync(CSV_FILE_PATH);
    const fileContent = iconv.decode(buffer, 'win1252');

    Papa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
        delimiter: ';',
        complete: async (results) => {
            const rows = results.data;
            let successCount = 0;
            let errorCount = 0;

            console.log(`Found ${rows.length} rows. Processing...`);

            if (rows.length > 0) {
                console.log('Sample Row Keys (Decoded):', Object.keys(rows[0]));
            }

            for (const row of rows) {
                // Normalize keys to handle potential BOM or encoding issues
                const normalizedRow = {};
                Object.keys(row).forEach(key => {
                    // Normalize: Trim and remove invisible characters, but keep spaces and latin chars
                    // We saw 'Name', 'Endereço Residencial' in logs.
                    const cleanKey = key.trim();
                    normalizedRow[cleanKey] = row[key];
                });

                // Adjust column names based on CSV (Matching what we saw in logs)
                const nome = normalizedRow['Name'] || normalizedRow['Nome'] || normalizedRow['Consultor'];

                // Fuzzy match for Lat/Long keys which had encoding issues
                const latKey = Object.keys(normalizedRow).find(k => k.startsWith('Lat') || k.startsWith('lat'));
                const lngKey = Object.keys(normalizedRow).find(k => k.startsWith('Long') || k.startsWith('long') || k.startsWith('Lng') || k.startsWith('lng'));

                const latStr = latKey ? normalizedRow[latKey] : null;
                const lngStr = lngKey ? normalizedRow[lngKey] : null;

                const endereco = normalizedRow['Endereço Residencial'] || normalizedRow['Endereço'] || normalizedRow['Endereco'] || '';
                const area = normalizedRow['Regional'] || normalizedRow['Area'] || '';

                if (!nome || !latStr || !lngStr) {
                    console.warn(`Skipping row (missing data): ${JSON.stringify(row)}`);
                    errorCount++;
                    continue;
                }

                // Parse float (handle comma decimals if needed)
                const latitude = parseFloat(String(latStr).replace(',', '.'));
                const longitude = parseFloat(String(lngStr).replace(',', '.'));

                if (isNaN(latitude) || isNaN(longitude)) {
                    console.warn(`Skipping row (invalid coords): ${nome} - ${latStr}, ${lngStr}`);
                    errorCount++;
                    continue;
                }

                const { error } = await supabase
                    .from('consultores')
                    .upsert({
                        nome: nome.trim(),
                        latitude,
                        longitude,
                        endereco: endereco.trim(),
                        area: area.trim()
                    }, { onConflict: 'nome' });

                if (error) {
                    console.error(`Error upserting ${nome}:`, error.message);
                    errorCount++;
                } else {
                    console.log(`Imported: ${nome}`);
                    successCount++;
                }
            }

            console.log(`\nImport Completed! Success: ${successCount}, Errors: ${errorCount}`);
        }
    });
}

importConsultants();
