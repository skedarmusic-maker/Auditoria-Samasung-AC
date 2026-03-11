
import { createClient } from '@supabase/supabase-js';
import xlsx from 'xlsx';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const EXCEL_PATH = path.resolve(__dirname, '../../public/BASE AC - atualizada.xlsx');

async function importData() {
    console.log('--- Iniciando Importação Multi-Conta ---');
    
    const workbook = xlsx.readFile(EXCEL_PATH);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = xlsx.utils.sheet_to_json(sheet);

    console.log(`Lendo ${rawData.length} linhas do Excel...`);

    // 1. Limpar tabelas atuais (OPCIONAL: se você quiser um sync total)
    // console.log('Limpando locais e consultores...');
    // await supabase.from('locais').delete().neq('id', 0);
    // await supabase.from('consultores').delete().neq('id', 0);

    const pdvs = [];
    const consultores = new Map();

    rawData.forEach(row => {
        // Extrair código do PDV do nome (Ex: "S00191 - A.DIAS ...")
        const nomePdv = row['NOME PDV'] || '';
        const match = nomePdv.match(/([SH]\d{5,})/i); // S ou H seguido de números
        const codigo_pdv = match ? match[1].toUpperCase() : nomePdv.split(' - ')[0];

        // Tratar coordenadas (Excel trouxe como inteiro sem ponto)
        const fixCoord = (val) => {
            if (!val) return null;
            let s = val.toString();
            if (!s.includes('.')) {
                // Se for algo como -2451169 -> -24.51169
                // Assume-se que tem 5 casas decimais se for grande
                if (s.length > 5) {
                    const insertAt = s.startsWith('-') ? 3 : 2;
                    s = s.slice(0, insertAt) + '.' + s.slice(insertAt);
                }
            }
            return s;
        };

        const PDV = {
            codigo_pdv: codigo_pdv,
            nome_pdv: nomePdv,
            bandeira: row['BANDEIRA'],
            cidade: row['CIDADE'],
            uf: row['UF'],
            latitude: fixCoord(row['LATITUDE']),
            longitude: fixCoord(row['LONGITUDE']),
            conta: (row['CONTA'] || 'SAMSUNG').toUpperCase()
        };
        pdvs.push(PDV);

        // Consultor (Base)
        const consultorName = row['RESPONSÁVEL'];
        if (consultorName && !consultores.has(consultorName + PDV.conta)) {
            consultores.set(consultorName + PDV.conta, {
                nome: consultorName,
                latitude: PDV.latitude,
                longitude: PDV.longitude,
                conta: PDV.conta
            });
        }
    });

    console.log(`Preparando para subir ${pdvs.length} PDVs...`);
    
    // Chunk upsert (Pdvs)
    for (let i = 0; i < pdvs.length; i += 500) {
        const chunk = pdvs.slice(i, i + 500);
        const { error } = await supabase.from('locais').upsert(chunk, { onConflict: 'codigo_pdv' });
        if (error) console.error('Erro PDV chunk:', error);
    }

    console.log(`Preparando para subir ${consultores.size} Consultores...`);
    const consultoresArray = Array.from(consultores.values());
    const { error: errConsult } = await supabase.from('consultores').upsert(consultoresArray, { onConflict: 'nome,conta' });
    if (errConsult) console.error('Erro Consultores:', errConsult);

    console.log('--- Importação Concluída com Sucesso! ---');
}

importData();
