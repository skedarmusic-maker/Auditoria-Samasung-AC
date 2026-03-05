/**
 * fix_locais_coords.js
 * 
 * O CSV exportado em PT-BR usa ponto como separador de milhar (ex: -23.456.789)
 * e vírgula como decimal. Isso resulta em coordenadas corrompidas no banco.
 * 
 * Este script lê o CSV original, reprocessa as coordenadas corretamente e atualiza o Supabase.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import Papa from 'papaparse';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
const csvFilePath = path.join(__dirname, '../public/locais_rows fnal março.csv');

/**
 * Parse Brazilian number format.
 * "-23.456,789" => -23456.789  (dot=thousands, comma=decimal)
 * "-23.456.789" => -23.456789  (multiple dots = dots are thousands, last section is decimal)
 */
function parseBrazilianCoord(str) {
    if (!str || str.trim() === '') return null;
    let s = str.trim();

    // Count dots and commas
    const dotCount = (s.match(/\./g) || []).length;
    const commaCount = (s.match(/,/g) || []).length;

    if (commaCount === 1) {
        // Has comma = PT-BR format: replace dots (thousands) then comma (decimal)
        s = s.replace(/\./g, '').replace(',', '.');
    } else if (dotCount > 1) {
        // Multiple dots = last dot is decimal? No, that's still ambiguous.
        // For BR coordinates, a value like -23.456.789 means -23456789 with the decimal
        // implied. Most likely it's -23.456789 with the middle dot as thousands separator.
        // Strategy: remove all dots except the LAST one that separates integer from decimals.
        // We'll join everything, then insert decimal at the right position.
        // Simpler: remove all dots, then if the result is too large, divide by 10^n.
        const withoutDots = s.replace(/\./g, '');
        const num = parseFloat(withoutDots);
        // If absolute value > 90 for lat or > 180 for lon, it's missing the decimal
        // For SP coordinates: lat ~= -23.5 so without decimal it would be -235xxxxx
        // We need to find where to put the decimal to get a valid geo coordinate.
        if (Math.abs(num) > 200) {
            // Try dividing to bring into reasonable range
            // Typical BR coords: lat -3 to -33, lon -35 to -73
            // Find the right power of 10
            let candidate = num;
            let divisor = 1;
            while (Math.abs(candidate) > 90 && divisor < 10000000) {
                divisor *= 10;
                candidate = num / divisor;
            }
            return isNaN(candidate) ? null : candidate;
        }
        return isNaN(num) ? null : num;
    }

    // Simple float
    const result = parseFloat(s.replace(',', '.'));
    return isNaN(result) ? null : result;
}

async function fixCoords() {
    console.log('Lendo CSV...');
    const csvFile = fs.readFileSync(csvFilePath, 'utf8');

    Papa.parse(csvFile, {
        header: true,
        delimiter: ';',
        skipEmptyLines: true,
        complete: async (results) => {
            const updates = [];
            let skipped = 0;

            results.data.forEach(row => {
                if (!row.codigo_pdv || !row.codigo_pdv.trim()) return;

                const lat = parseBrazilianCoord(row.latitude);
                const lng = parseBrazilianCoord(row.longitude);

                // Only update rows where coords are present
                if (lat !== null && lng !== null) {
                    // Sanity check: valid geo range
                    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
                        updates.push({ codigo_pdv: row.codigo_pdv.trim(), latitude: lat, longitude: lng });
                    } else {
                        console.warn(`Coord fora do range: ${row.codigo_pdv} lat=${lat} lng=${lng}`);
                        skipped++;
                    }
                }
            });

            console.log(`Atualizando ${updates.length} locais com coordenadas válidas (${skipped} pulados)...`);

            // Update in batches
            let updated = 0;
            for (const item of updates) {
                const { error } = await supabase
                    .from('locais')
                    .update({ latitude: item.latitude, longitude: item.longitude })
                    .eq('codigo_pdv', item.codigo_pdv);

                if (error) {
                    console.error(`Erro em ${item.codigo_pdv}:`, error.message);
                } else {
                    updated++;
                    if (updated % 100 === 0) console.log(`  ${updated}/${updates.length}...`);
                }
            }

            console.log(`\nCoordenadas corrigidas: ${updated} locais atualizados!`);

            // Show some samples
            const sample = updates.slice(0, 3);
            console.log('\nAmostra dos valores corrigidos:');
            sample.forEach(s => console.log(`  ${s.codigo_pdv}: lat=${s.latitude}, lng=${s.longitude}`));
        }
    });
}

fixCoords();
