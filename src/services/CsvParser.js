import Papa from 'papaparse';
import { parse, isValid, format } from 'date-fns';

const normalizeDate = (dateStr) => {
    if (!dateStr) return null;
    try {
        // Try parsing DD/MM/YYYY
        let date = parse(dateStr, 'dd/MM/yyyy', new Date());
        if (!isValid(date)) {
            // Try parsing D/M/YYYY
            date = parse(dateStr, 'd/M/yyyy', new Date());
        }
        if (!isValid(date)) {
            // Try ISO or other formats if needed, or just return trimmed
            return dateStr.trim();
        }
        // Return standard DD/MM/YYYY
        // Note: verify if input is MM/DD/YYYY? Assuming Brazilian format DD/MM/YYYY
        // Actually, let's just use string manipulation to be safer if date-fns fails or if strictly string matching is desired.
        // Simple regex to pad zeros:
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            const year = parts[2];
            return `${day}/${month}/${year}`;
        }
        return dateStr.trim();
    } catch (e) {
        return dateStr;
    }
};

const normalizeTime = (timeStr) => {
    if (!timeStr) return null;
    try {
        // Enforce that it must look like a time (has a colon)
        if (!timeStr.includes(':')) return null;

        // Handle "DD/MM/YYYY HH:mm" or "YYYY-MM-DD HH:mm"
        if (timeStr.includes(' ')) {
            const parts = timeStr.split(' ');
            const timePart = parts.find(p => p.includes(':'));
            if (timePart) return timePart.substring(0, 5);
        }
        // Handle "HH:mm:ss"
        if (timeStr.includes(':')) {
            return timeStr.substring(0, 5);
        }
        return null;
    } catch (e) {
        return null;
    }
};

export const parseCsv = (file) => {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            delimiter: ';', // Assuming semicolon delimiter (standard in Brazil)
            encoding: 'ISO-8859-1', // Fix for latin characters
            complete: (results) => {
                if (results.data && results.data.length > 0) {
                    console.log("CSV Headers detected:", Object.keys(results.data[0]));
                }
                resolve(results.data);
            },
            error: (error) => {
                reject(error);
            },
        });
    });
};

export const processSolidesData = (data) => {
    return data.map(row => {
        // Build a case-insensitive, space-trimmed row lookup map for Solides
        const cleanRow = {};
        Object.keys(row).forEach(k => {
            cleanRow[k.toLowerCase().trim()] = row[k];
        });

        // Search for standard columns
        const rawDate = cleanRow['data'] || cleanRow['data '];
        const rawIn = cleanRow['entrada'] || cleanRow['hora entrada'] || cleanRow['checkin'];
        const rawOut = cleanRow['saida'] || cleanRow['saída'] || cleanRow['hora saida'];
        const localIn = cleanRow['local entrada'] || cleanRow['endereço entrada'];
        const lograd = cleanRow['logradouro'] || cleanRow['endereco'];
        const local = cleanRow['local'] || cleanRow['loja'];
        const consultant = cleanRow['colaborador'] || cleanRow['consultor'] || cleanRow['nome'] || cleanRow['funcionario'] || cleanRow['usuario'] || cleanRow['usuário'];

        return {
            originalData: rawDate,
            data: normalizeDate(rawDate),
            entrada: normalizeTime(rawIn),
            saida: normalizeTime(rawOut),
            localEntrada: localIn,
            logradouro: lograd,
            local: local,
            consultor: consultant
        }
    }).filter(row => row.data && row.entrada);
};

export const processUmovmeData = (data) => {
    // Helper to find value across multiple potential keys
    const findValue = (row, keys, exclude = []) => {
        const rowKeys = Object.keys(row);
        for (const key of keys) {
            // Fuzzy lookup: check if row key INCLUDES the search key ignoring accents and spaces
            const normalizeStr = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

            const foundKey = rowKeys.find(k => {
                const cleanK = normalizeStr(k);
                const cleanSearch = normalizeStr(key);
                if (!cleanK.includes(cleanSearch)) return false;
                if (exclude.some(ex => cleanK.includes(normalizeStr(ex)))) return false;
                return true;
            });
            if (foundKey && row[foundKey] && row[foundKey].trim() !== '') return row[foundKey].trim();
        }
        return null;
    };

    return data.map(row => {
        // 1. Check In Realizado (Existing logic)
        let checkIn = findValue(row,
            ['Check In Realizado', 'Check-in Realizado', 'Realizado', 'Check In', 'Check-in', 'Horario', 'Horário', 'Hora'],
            ['Previsto', 'Planejado', 'Saida', 'Out']
        );
        const originalCheckIn = checkIn; // Keep original format before normalizing
        if (checkIn) checkIn = normalizeTime(checkIn);

        // 2. Hora Prevista (New logic)
        let predictedTime = findValue(row,
            ['Check In Previsto', 'Check-in Previsto', 'Hora Prevista', 'Previsto', 'Planejado', 'Entrada Prevista'],
            ['Realizado', 'Saida']
        );
        if (predictedTime) predictedTime = normalizeTime(predictedTime);

        const dateStr = findValue(row, ['Data Prevista', 'Data Planejada', 'Data']);
        const local = findValue(row, ['Local', 'Loja', 'Cliente', 'PDV']);
        const endereco = findValue(row,
            ['Endereço', 'Endereços', 'Endereco', 'Enderecos', 'Logradouro', 'Rua'],
            ['Local', 'Loja', 'Situação', 'Total']
        );
        const consultor = findValue(row, ['Usuário', 'Usuario', 'Colaborador', 'Consultor', 'Nome']);

        return {
            originalData: dateStr,
            dataPrevista: normalizeDate(dateStr),
            local: local,
            endereco: endereco,
            consultor: consultor,
            checkIn: checkIn,
            predictedTime: predictedTime,
            checkInOriginal: originalCheckIn
        }
    }).filter(row => row.dataPrevista && (row.checkIn || row.local));
};
