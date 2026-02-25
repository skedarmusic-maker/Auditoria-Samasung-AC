import Papa from 'papaparse';
import { calculateDistance } from './GoogleMaps';

export const PointHistoryService = {
    parsePointCsv: (file) => {
        return new Promise((resolve, reject) => {
            Papa.parse(file, {
                header: true,
                delimiter: ';', // Force semicolon
                encoding: 'UTF-8',
                transformHeader: (h) => h.trim(), // Trim headers to avoid BOM/whitespace issues
                skipEmptyLines: true,
                complete: (results) => {
                    try {
                        const parsed = processPointData(results.data);
                        resolve(parsed);
                    } catch (e) {
                        reject(e);
                    }
                },
                error: (err) => reject(err)
            });
        });
    }
};

const cleanCoord = (value) => {
    if (!value) return null;
    let s = String(value).trim();
    // Remove dots and commas
    let cleanDigits = s.replace(/[.,]/g, '');

    // Handle negative
    let isNegative = s.startsWith('-');
    if (isNegative) cleanDigits = cleanDigits.substring(1);

    // Heuristic for Brazil Lat/Lng
    // Lat: XX.XXXXXX (e.g., 23.555) -> 8 digits roughly
    // Lng: XX.XXXXXX (e.g., 46.666)

    // Try divides to find reasonable float
    let val = parseFloat(cleanDigits);

    // We need to shift decimal point until it fits typical range
    // Lat: -35 to +6
    // Lng: -75 to -30

    // Attempt with various divisors
    // Usually input is like -23555555 -> -23.555555

    // Brute force reasonable scale
    let candidates = [100, 1000, 10000, 100000, 1000000, 10000000, 100000000];

    for (let div of candidates) {
        let candidate = val / div;
        let signed = isNegative ? -candidate : candidate;

        // Broad check: is it a valid Lat OR Lng?
        if (Math.abs(signed) <= 180 && Math.abs(signed) > 0.1) {
            // Refine check?
            // Just return first reasonable match for now, assuming standard precision
            if (Math.abs(signed) > 180) continue;
            // Logic: Latitude usually < 90. 
            return signed;
        }
    }

    return null;
}

// Better cleaner specific for the format seen: -211.768.362 -> -21.1768362
const cleanPointCoord = (value, type = 'lat') => {
    if (!value) return null;
    let s = String(value).trim();

    // Remove all formatting chars to get raw digits
    // Example: "-211.768.262" -> "-211768262"
    let cleanDigits = s.replace(/[.,]/g, '');

    // Handle negative sign
    let isNegative = cleanDigits.startsWith('-');
    if (isNegative) {
        cleanDigits = cleanDigits.substring(1);
    }

    // Parse base number
    let val = parseFloat(cleanDigits);
    if (isNaN(val) || val === 0) return null;

    // Heuristic: Shift decimal point to fit Brazilian ranges
    // Lat: -34 to +6
    // Lng: -74 to -30

    // We effectively divide by 10^k until it falls in range
    let candidate = val;
    let found = false;

    // Try dividing by increasing powers of 10
    // e.g. 211768262 -> 21.1768262 (divide by 10^7)

    for (let i = 0; i < 15; i++) {
        let checkVal = isNegative ? -candidate : candidate;

        if (type === 'lat') {
            if (checkVal >= -35 && checkVal <= 6) {
                return checkVal;
            }
        } else {
            // Longitude
            if (checkVal >= -75 && checkVal <= -30) {
                return checkVal;
            }
        }
        candidate /= 10;
    }

    // Fallback for extreme cases or if 0
    return null;
}


const processPointData = (rows) => {
    const grouped = {};

    rows.forEach(row => {
        // Normalize keys to lowercase and trim
        const normalizedRow = {};
        Object.keys(row).forEach(k => {
            normalizedRow[k.toLowerCase().trim()] = row[k];
        });

        const date = (normalizedRow['data'] || '').trim();
        const consultant = (normalizedRow['consultor'] || '').trim();

        if (!date || !consultant) return;

        const key = `${consultant}|${date}`;

        if (!grouped[key]) {
            grouped[key] = {
                consultant: consultant,
                date: date,
                points: [],
                windows: []
            };
        }

        const lat = cleanPointCoord(normalizedRow['latitude'], 'lat');
        const lng = cleanPointCoord(normalizedRow['longitude'], 'lng');

        if (lat && lng) {
            const info = normalizedRow['informações adicionais da coleta'] || normalizedRow['informacoes adicionais da coleta'] || '';

            // Try multiple common column names for Store/PDV
            let storeName = (
                normalizedRow['local'] ||
                normalizedRow['pdv'] ||
                normalizedRow['ponto de venda'] ||
                normalizedRow['nome do pdv'] ||
                normalizedRow['nome da loja'] ||
                normalizedRow['cliente'] ||
                normalizedRow['estabelecimento'] ||
                normalizedRow['unidade'] ||
                ''
            ).trim();

            // Smart Search: if still empty, look for ANY column containing keywords
            if (!storeName) {
                const keywords = ['loja', 'pdv', 'ponto', 'cliente', 'local'];
                const foundKey = Object.keys(normalizedRow).find(k =>
                    keywords.some(kw => k.includes(kw)) && normalizedRow[k]
                );
                if (foundKey) storeName = String(normalizedRow[foundKey]).trim();
            }

            // Fallback: Extract from info field
            if (!storeName && info.includes('Execução de atividade')) {
                // Try splitting by common separators
                const parts = info.split(/[-–—:]/).map(p => p.trim());
                // Find the part that is NOT exactly "Execução de atividade"
                const namePart = parts.find(p => p && p.toLowerCase() !== 'execução de atividade' && p.toLowerCase() !== 'execucao de atividade');
                if (namePart) {
                    storeName = namePart;
                }
            }

            const point = {
                time: (normalizedRow['hora'] || '').trim(),
                lat: lat,
                lng: lng,
                info: info,
                storeName: storeName,
                captureType: normalizedRow['forma de captura'] || '',
                isCheckIn: info.includes('Execução de atividade'),
                originalRowIndex: grouped[key].points.length
            };
            grouped[key].points.push(point);
        }
    });

    // Post-process: Identify windows and calculate deviations
    Object.values(grouped).forEach(group => {
        // 1. Sort points by time
        group.points.sort((a, b) => {
            const t1 = a.time.split(':').map(Number);
            const t2 = b.time.split(':').map(Number);
            return (t1[0] * 3600 + t1[1] * 60 + t1[2]) - (t2[0] * 3600 + t2[1] * 60 + t2[2]);
        });

        // 2. Identify Visit Windows (Pairs of Check-ins)
        const checkIns = group.points.filter(p => p.isCheckIn);
        const windows = [];

        for (let i = 0; i < checkIns.length; i += 2) {
            const start = checkIns[i];
            const end = checkIns[i + 1]; // Can be undefined if odd number

            if (start) {
                windows.push({
                    start: start,
                    end: end || null,
                    storeLocation: {
                        lat: start.lat,
                        lng: start.lng,
                        time: start.time,
                        storeName: start.storeName
                    }
                });
            }
        }
        group.windows = windows;

        // 3. Classify each point
        group.points.forEach(p => {
            if (p.isCheckIn) {
                p.status = 'CHECKIN_MARKER'; // New status for the anchor points
                p.distanceFromCheckIn = 0;
                return;
            }

            // Find if point falls into any window
            const activeWindow = windows.find(w => {
                // Logic: time >= start.time AND (time <= end.time OR end is null)
                // Need generic time compare helper
                const tP = timeToSeconds(p.time);
                const tStart = timeToSeconds(w.start.time);
                const tEnd = w.end ? timeToSeconds(w.end.time) : 86400; // End of day if open

                return tP >= tStart && tP <= tEnd;
            });

            if (activeWindow) {
                // INSIDE A VISIT
                const dist = calculateDistance(p.lat, p.lng, activeWindow.storeLocation.lat, activeWindow.storeLocation.lng);
                p.distanceFromCheckIn = dist;
                p.relatedCheckInTime = activeWindow.storeLocation.time;
                p.relatedStoreName = activeWindow.storeLocation.storeName;
                p.checkInCoords = activeWindow.storeLocation; // Add this for the viewer to draw lines

                if (dist > 500) {
                    p.isDeviation = true;
                    p.status = 'DEVIATION_CRITICAL'; // Red
                } else {
                    p.status = 'IN_STORE'; // Green (Working correct)
                }
            } else {
                // OUTSIDE ANY VISIT (TRAVEL)
                p.status = 'TRAVEL'; // Grey/Blue (Ignore)
                p.distanceFromCheckIn = null;
            }
        });
    });

    return Object.values(grouped);
};

const timeToSeconds = (timeStr) => {
    if (!timeStr) return 0;
    const [h, m, s] = timeStr.split(':').map(Number);
    return h * 3600 + m * 60 + (s || 0);
};
