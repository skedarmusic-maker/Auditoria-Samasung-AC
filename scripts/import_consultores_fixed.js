import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Convert current module URL to file path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase URL or Key in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Path to CSV file
const CSV_PATH = path.resolve(__dirname, '../../public/Endereços consultores.csv');

function cleanCoord(value, type) {
    if (!value) return null;
    let s = String(value).trim();

    // Remove all dots and commas
    let cleanDigits = s.replace(/[.,]/g, '');

    // Check for negative sign
    let isNegative = s.startsWith('-');
    if (isNegative) {
        cleanDigits = cleanDigits.substring(1);
    }

    // Heuristic: Latitude for Brazil is roughly -35 to +6. Longitude -75 to -30.
    // Usually Lat has 2 integer digits (e.g. 23) or 1 (e.g. 5).
    // Longitude usually has 2 integer digits (e.g. 46).

    let val2 = parseFloat(cleanDigits) / Math.pow(10, cleanDigits.length - 2); // XX.XXXX
    let val1 = parseFloat(cleanDigits) / Math.pow(10, cleanDigits.length - 1); // X.XXXX

    let finalVal = 0;

    if (type === 'lat') {
        const v2 = isNegative ? -val2 : val2;
        const v1 = isNegative ? -val1 : val1;

        if (v2 >= -35 && v2 <= 6) finalVal = v2;
        else if (v1 >= -35 && v1 <= 6) finalVal = v1;
        else finalVal = v2; // Fallback
    } else {
        const v2 = isNegative ? -val2 : val2;
        if (v2 >= -75 && v2 <= -30) finalVal = v2;
        else finalVal = v2; // Fallback
    }

    return finalVal;
}

async function run() {
    console.log(`Reading CSV from: ${CSV_PATH}`);

    if (!fs.existsSync(CSV_PATH)) {
        console.error('File not found!');
        process.exit(1);
    }

    const content = fs.readFileSync(CSV_PATH, 'utf-8');
    const lines = content.split('\n');
    const headers = lines[0].split(';'); // "Name;Endereço Residencial;Latitude;Longitude"

    console.log(`Headers found: ${headers.join(', ')}`);

    // Clean existing data
    console.log('Cleaning old data...');
    const { error: delError } = await supabase.from('consultores').delete().neq('nome', 'X'); // Delete all (hacky neq check)
    if (delError) console.warn('Delete error (might need RLS off):', delError.message);

    let success = 0;
    let errors = 0;

    for (let i = 1; i < lines.length; i++) { // Skip header
        const line = lines[i].trim();
        if (!line) continue;

        const cols = line.split(';');
        if (cols.length < 2) continue;

        const nome = cols[0].trim();
        const endereco = cols[1]?.trim() || '';
        const rawLat = cols[2]?.trim();
        const rawLng = cols[3]?.trim();

        const lat = cleanCoord(rawLat, 'lat');
        const lng = cleanCoord(rawLng, 'lng');

        console.log(`Importing: ${nome} | Lat: ${lat}, Lng: ${lng}`);

        const { error } = await supabase.from('consultores').insert({
            nome,
            endereco,
            latitude: lat,
            longitude: lng
        });

        if (error) {
            console.error(`Error inserting ${nome}:`, error.message);
            errors++;
        } else {
            success++;
        }
    }

    console.log(`\nImport Complete.`);
    console.log(`Success: ${success}`);
    console.log(`Errors: ${errors}`);
}

run();
