import * as XLSX from 'xlsx';
import fs from 'fs';

const filePath = 'C:\\Users\\Gabriel Amorim\\Desktop\\APPS ANTIGRAVITY\\AUDITORIA SAMSUNG\\public\\BASE AC - atualizada.xlsx';

const fileData = fs.readFileSync(filePath);
const workbook = XLSX.read(fileData, { type: 'buffer' });

console.log("=== ABAS DISPONÍVEIS ===");
console.log(workbook.SheetNames);

const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

console.log("\n=== TOTAL DE LINHAS ===", data.length);

console.log("\n=== COLUNAS ===");
if (data.length > 0) {
    data[0].forEach((col, idx) => {
        const colLetter = idx < 26 
            ? String.fromCharCode(65 + idx)
            : 'A' + String.fromCharCode(65 + (idx - 26));
        console.log(`  Col ${colLetter} (idx ${idx}): "${col}"`);
    });
}

console.log("\n=== AMOSTRA DE DADOS (Linhas 2-4) ===");
for (let i = 1; i <= 3 && i < data.length; i++) {
    console.log(`\n--- Linha ${i+1} ---`);
    data[0].forEach((header, idx) => {
        console.log(`  ${header}: ${data[i][idx] !== undefined ? data[i][idx] : '(vazio)'}`);
    });
}
