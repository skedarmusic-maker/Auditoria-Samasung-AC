import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ ERRO: Variáveis de ambiente não encontradas no .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const parseCoord = (value, type) => {
    if (value === undefined || value === null || value === '') return null;
    const num = parseFloat(String(value).replace(',', '.'));
    if (isNaN(num) || num === 0) return null;
    const abs = Math.abs(num);
    if (type === 'lat' && abs <= 35) return num;
    if (type === 'lng' && abs >= 30 && abs <= 75) return num;
    let candidate = abs;
    for (let i = 0; i < 20; i++) {
        candidate /= 10;
        const signed = num < 0 ? -candidate : candidate;
        if (type === 'lat' && signed >= -35 && signed <= 6) return signed;
        if (type === 'lng' && signed >= -75 && signed <= -30) return signed;
    }
    return null;
};

const BATCH_SIZE = 100;
const FILE_PATH = path.join(__dirname, '../../public/BASE AC - atualizada.xlsx');

async function main() {
    console.log('📂 Lendo arquivo Excel...');
    const fileData = fs.readFileSync(FILE_PATH);
    const workbook = XLSX.read(fileData, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
    const dataRows = rows.slice(1).filter(row => row.some(c => c !== undefined && c !== ''));
    console.log(`✅ ${dataRows.length} linhas encontradas\n`);

    const records = [];
    let skipped = 0;

    for (const row of dataRows) {
        const nomePdv = row[2] ? String(row[2]).trim() : null;
        if (!nomePdv) { skipped++; continue; }

        // Only use columns that existed BEFORE the migration (safe columns)
        // + the new ones that should now exist after NOTIFY
        // If cnpj still fails, we omit it and just use the other new fields
        const record = {
            nome_pdv:    nomePdv,
            bandeira:    row[1] ? String(row[1]).trim() : null,
            endereco:    row[5] ? String(row[5]).trim() : null,
            latitude:    parseCoord(row[10], 'lat'),
            longitude:   parseCoord(row[11], 'lng'),
            // New fields (added via ALTER TABLE):
            cliente:         row[0] ? String(row[0]).trim() : null,
            nome_pdv_antigo: row[3] ? String(row[3]).trim() : null,
            responsavel:     row[6] ? String(row[6]).trim() : null,
            cidade:          row[7] ? String(row[7]).trim() : null,
            uf:              row[8] ? String(row[8]).trim() : null,
            cep:             row[9] ? String(row[9]).trim() : null,
            conta:           row[12] ? String(row[12]).trim().toUpperCase() : 'SAMSUNG',
        };

        // Store cnpj separately in case we need to skip it
        record._cnpj = row[4] ? String(row[4]).replace(/\D/g, '') : null;
        records.push(record);
    }

    console.log(`📝 ${records.length} registros (${skipped} ignorados)\n`);

    // Test if cnpj column is available
    const { error: testErr } = await supabase.from('locais').select('cnpj').limit(1);
    const cnpjAvailable = !testErr;
    console.log(cnpjAvailable ? '✅ Coluna cnpj disponível' : '⚠️  Coluna cnpj NÃO disponível - importando sem ela');

    // Prepare final records
    const finalRecords = records.map(r => {
        const { _cnpj, ...rest } = r;
        if (cnpjAvailable && _cnpj) rest.cnpj = _cnpj;
        return rest;
    });

    // Clear table
    console.log('\n🗑️  Limpando tabela...');
    const { error: delErr } = await supabase.from('locais').delete().not('nome_pdv', 'is', null);
    if (delErr) console.warn('⚠️  Aviso ao limpar:', delErr.message);
    else console.log('✅ Tabela limpa\n');

    // Insert in batches
    console.log('📤 Inserindo em lotes...');
    let totalInserted = 0;
    let totalErrors = 0;

    for (let i = 0; i < finalRecords.length; i += BATCH_SIZE) {
        const batch = finalRecords.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from('locais').insert(batch);
        if (error) {
            console.error(`\n❌ Lote ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
            totalErrors += batch.length;
        } else {
            totalInserted += batch.length;
            process.stdout.write(`\r⏳ ${totalInserted}/${finalRecords.length}`);
        }
    }

    console.log('\n\n======== RESULTADO ========');
    console.log(`✅ Inseridos: ${totalInserted}`);
    console.log(`❌ Erros:     ${totalErrors}`);
    console.log(`⏭️  Ignorados: ${skipped}`);
    console.log(`📋 CNPJ incluído: ${cnpjAvailable ? 'SIM' : 'NÃO (rode novamente após reload do schema)'}`);
    console.log('===========================\n');
}

main().catch(err => { console.error('❌ Erro fatal:', err); process.exit(1); });
