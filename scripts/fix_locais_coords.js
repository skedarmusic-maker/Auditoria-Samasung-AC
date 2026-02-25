
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

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

    let result = 0;

    // Heuristic: Latitude for Brazil is roughly -34 to +5. Longitude -74 to -34.
    // Usually Lat has 2 integer digits (e.g. 23) or 1 (e.g. 5).
    // Longitude usually has 2 integer digits (e.g. 46).

    // Try interpreted as X.XXXX...
    let val1 = parseFloat(cleanDigits) / Math.pow(10, cleanDigits.length - 1);
    // Try interpreted as XX.XXXX...
    let val2 = parseFloat(cleanDigits) / Math.pow(10, cleanDigits.length - 2);
    // Try interpreted as XXX.XXXX...
    let val3 = parseFloat(cleanDigits) / Math.pow(10, cleanDigits.length - 3);

    let finalVal = 0;

    if (type === 'lat') {
        // Valid Lat: -90 to +90. Brazil mostly negative.
        // Try to find the one that fits best in Brazil range (-35 to +6)
        // Apply sign
        let v1 = isNegative ? -val1 : val1;
        let v2 = isNegative ? -val2 : val2;

        if (v2 >= -35 && v2 <= 6) finalVal = v2;
        else if (v1 >= -35 && v1 <= 6) finalVal = v1;
        else finalVal = v2; // Fallback
    } else {
        // Valid Lng: -180 to +180. Brazil mostly -75 to -30
        let v2 = isNegative ? -val2 : val2;
        let v3 = isNegative ? -val3 : val3; // unlikely for brazil unless specific

        if (v2 >= -75 && v2 <= -30) finalVal = v2;
        else finalVal = v2; // Fallback to XX.XXXX
    }

    return finalVal;
}

async function run() {
    console.log('Fetching all rows...');
    const { data, error } = await supabase
        .from('locais')
        .select('id, latitude, longitude');

    if (error) {
        console.error('Error fetching data:', error);
        return;
    }

    console.log(`Found ${data.length} rows. Starting update...`);

    let updatedCount = 0;
    let errorCount = 0;

    // Process in chunks of 50
    for (let i = 0; i < data.length; i += 50) {
        const chunk = data.slice(i, i + 50);
        const updates = chunk.map(row => {
            const newLat = cleanCoord(row.latitude, 'lat');
            const newLng = cleanCoord(row.longitude, 'lng');

            if (newLat && newLng) {
                return {
                    id: row.id,
                    latitude: String(newLat),
                    longitude: String(newLng)
                };
            }
            return null;
        }).filter(u => u !== null);

        if (updates.length > 0) {
            // Perform upsert (using id) or individual updates
            // Supabase upsert is efficient
            const { error: upsertError } = await supabase
                .from('locais')
                .upsert(updates);

            if (upsertError) {
                console.error(`Error updating chunk ${i}:`, upsertError);
                errorCount += updates.length;
            } else {
                updatedCount += updates.length;
                console.log(`Updated rows ${i} to ${i + updates.length}`);
            }
        }
    }

    console.log(`Done. Updated: ${updatedCount}, Errors: ${errorCount}`);
}

run();
