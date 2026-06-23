import React, { useState, useMemo } from 'react';
import { MapPin, Navigation, AlertTriangle, Clock, Calendar, User, Search, Upload, FileDown, Mail } from 'lucide-react';
import { jsPDF } from 'jspdf';
import MapViewer from './MapViewer';
import { calculateDistance } from '../services/GoogleMaps';
import { FileUploader } from './FileUploader';

const formatDistance = (meters) => {
    if (meters === undefined || meters === null) return '';
    const roundedMeters = Math.round(meters);
    const wholeKm = Math.floor(roundedMeters / 1000);
    const remainingMeters = roundedMeters % 1000;
    const km = remainingMeters > 750 ? wholeKm + 1 : wholeKm;
    
    if (km > 0) {
        return `${roundedMeters}m ( ${km} km )`;
    }
    return `${roundedMeters}m`;
};

const PointHistoryViewer = ({
    data,
    locations,
    consultantAddresses,
    selectedConsultant,
    setSelectedConsultant,
    selectedDate,
    setSelectedDate,
    isClientMode,
    pointHistoryFile,
    onFileSelect
}) => {
    const [pingViewMode, setPingViewMode] = useState('deviations'); // 'deviations' | 'all'

    // FILTRO GLOBAL: Ignorar Sábados e Domingos
    const filteredData = useMemo(() => {
        return (data || []).filter(group => {
            if (!group.date) return false;
            const parts = group.date.split('/');
            if (parts.length !== 3) return true; 
            const [d, m, y] = parts.map(Number);
            const dow = new Date(y, m - 1, d).getDay();
            return dow !== 0 && dow !== 6; // 0 = Domingo, 6 = Sábado
        });
    }, [data]);

    const consultants = useMemo(() => [...new Set(filteredData.map(d => d.consultant))].sort(), [filteredData]);

    // Filter available dates for selected consultant
    const availableDates = useMemo(() => {
        return filteredData
            .filter(d => d.consultant === selectedConsultant)
            .map(d => {
                const hasWarning = d.points.some(p => p.status === 'DEVIATION_CRITICAL');
                return {
                    date: d.date,
                    hasWarning: hasWarning
                };
            })
            .sort((a, b) => {
                const [d1, m1, y1] = a.date.split('/').map(Number);
                const [d2, m2, y2] = b.date.split('/').map(Number);
                return new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1); // Descending
            });
    }, [data, selectedConsultant]);

    // Initial load sync
    React.useEffect(() => {
        if (!selectedConsultant && consultants.length > 0) {
            setSelectedConsultant(consultants[0]);
        }
    }, [consultants, selectedConsultant, setSelectedConsultant]);

    // Sync selectedDate when consultant or data changes
    React.useEffect(() => {
        if (availableDates.length > 0) {
            // Only update if current selectedDate is NOT in availableDates
            if (!availableDates.find(d => d.date === selectedDate)) {
                setSelectedDate(availableDates[0].date);
            }
        } else {
            setSelectedDate('');
        }
    }, [selectedConsultant, availableDates, selectedDate, setSelectedDate]);

    // Get the specific day data
    const currentDayData = useMemo(() => {
        return filteredData.find(d => d.consultant === selectedConsultant && d.date === selectedDate);
    }, [filteredData, selectedConsultant, selectedDate]);

    // 1. Resolve store names for all check-ins (Anchor Points)
    const resolvedCheckIns = useMemo(() => {
        if (!currentDayData) return [];
        return currentDayData.points
            .filter(p => p.status === 'CHECKIN_MARKER')
            .map(p => {
                let finalStoreName = p.storeName;
                let isResolved = false;

                // Try to resolve if name is missing, too short (like codes), numeric, or just "Execução de atividade"
                const nameLower = (finalStoreName || '').toLowerCase();
                const isGeneric = !finalStoreName || finalStoreName.length <= 4 || /^\d+$/.test(finalStoreName) || nameLower.includes('execução') || nameLower.includes('execucao') || nameLower.includes('tracking');

                if (isGeneric && locations && locations.length > 0) {
                    let minInfo = { name: null, dist: 1500 }; // 1.5km tolerance

                    locations.forEach(loc => {
                        const dist = calculateDistance(p.lat, p.lng, Number(loc.latitude), Number(loc.longitude));
                        if (dist !== null && dist < minInfo.dist) {
                            minInfo = { name: loc.nome_pdv || loc.bandeira, dist: dist };
                        }
                    });

                    if (minInfo.name) {
                        finalStoreName = minInfo.name;
                        isResolved = true;
                    }
                }

                return { 
                    ...p, 
                    storeName: finalStoreName || (p.info && p.info.length > 10 ? p.info : 'Loja Desconhecida'),
                    isResolved 
                };
            });
    }, [currentDayData, locations]);

    // Prepare deviations list with resolved store names
    const deviations = useMemo(() => {
        if (!currentDayData || resolvedCheckIns.length === 0) return [];
        return currentDayData.points
            .filter(p => p.status === 'DEVIATION_CRITICAL')
            .map(p => {
                // Find the resolved check-in that match the relatedCheckInTime
                const resolved = resolvedCheckIns.find(rc => rc.time === p.relatedCheckInTime);
                return {
                    ...p,
                    relatedStoreName: resolved?.storeName || p.relatedStoreName
                };
            });
    }, [currentDayData, resolvedCheckIns]);

    // Prepare all points list with resolved store names
    const allPoints = useMemo(() => {
        if (!currentDayData) return [];
        return currentDayData.points.map(p => {
            const resolved = resolvedCheckIns.find(rc => rc.time === p.relatedCheckInTime);
            return {
                ...p,
                relatedStoreName: resolved?.storeName || p.relatedStoreName
            };
        });
    }, [currentDayData, resolvedCheckIns]);

    // Prepare check-ins list for sidebar
    const checkIns = resolvedCheckIns;

    // Find Home Address for current consultant
    const currentConsultantHome = useMemo(() => {
        if (!selectedConsultant || !consultantAddresses) return null;
        // Case-insensitive match or inclusion
        const name = selectedConsultant.toUpperCase();
        const found = consultantAddresses.find(c => {
            const cName = (c.nome || '').toUpperCase();
            return cName === name || cName.includes(name) || name.includes(cName);
        });
        if (found && found.latitude) {
            return { lat: Number(found.latitude), lng: Number(found.longitude), address: found.endereco };
        }
        return null;
    }, [selectedConsultant, consultantAddresses]);

    // Format for MapViewer
    // MapViewer expects an array of "rows" where each row has { solides, storeLocation, distance, ... }
    const mapDataPoints = useMemo(() => {
        if (!currentDayData) return [];

        return currentDayData.points.map((p, idx) => {
            // New Logic: Status Driven
            let storeLocation = null;
            let customColor = null;
            let customLineColor = null;

            if (p.status === 'CHECKIN_MARKER') {
                // Find resolved data for this check-in
                const resolved = resolvedCheckIns.find(rc => rc.time === p.time);
                
                // The Check-In Anchor (Green Circle)
                storeLocation = {
                    latitude: p.lat,
                    longitude: p.lng,
                    nome_pdv: resolved?.storeName || `PONTO ZERO - ${p.time}`,
                    code: 'CHECKIN'
                };
                return {
                    consultant: currentDayData.consultant,
                    date: currentDayData.date,
                    solides: {}, // No Arrow
                    storeLocation: storeLocation,
                    distance: 0,
                    status: 'OK',
                    customType: 'CHECKIN',
                    consultantHome: currentConsultantHome
                };
            }

            if (p.status === 'CHECKOUT_MARKER') {
                // Find resolved data for the related check-in
                const resolved = resolvedCheckIns.find(rc => rc.time === p.relatedCheckInTime);
                const storeNameToDisplay = resolved?.storeName || p.relatedStoreName || 'Loja Desconhecida';

                // The Check-Out Marker (Small Circle or Flag)
                storeLocation = {
                    latitude: p.lat,
                    longitude: p.lng,
                    nome_pdv: `SAÍDA [${storeNameToDisplay}] - ${p.time}`,
                    code: 'CHECKOUT'
                };
                return {
                    consultant: currentDayData.consultant,
                    date: currentDayData.date,
                    solides: {}, 
                    storeLocation: storeLocation,
                    distance: p.distanceFromCheckIn || 0,
                    status: 'OK',
                    customType: 'CHECKOUT',
                    consultantHome: currentConsultantHome
                };
            }

            // Normal Points (Arrows)
            const solides = {
                coords: { lat: p.lat, lng: p.lng },
                address: `Horário: ${p.time} | Info: ${p.info || '-'}`
            };

            if (p.status === 'IN_STORE') {
                // Green Arrow + Green Line to CheckIn
                customColor = '#10b981'; // emerald-500
                customLineColor = '#10b981';
                if (p.checkInCoords) {
                    storeLocation = {
                        latitude: p.checkInCoords.lat,
                        longitude: p.checkInCoords.lng
                    };
                }
            } else if (p.status === 'DEVIATION_CRITICAL') {
                // Red Arrow + Red Line
                customColor = '#ef4444'; // red-500
                customLineColor = '#ef4444';
                if (p.checkInCoords) {
                    storeLocation = {
                        latitude: p.checkInCoords.lat,
                        longitude: p.checkInCoords.lng
                    };
                }
            } else if (p.status === 'TRAVEL' || p.status === 'BEFORE_CHECKIN') {
                // Grey/Blue Arrow + NO Line
                customColor = '#71717a'; // zinc-500
                customLineColor = null; // No line
                storeLocation = null;
            }

            return {
                consultant: currentDayData.consultant,
                date: currentDayData.date,
                solides: solides,
                storeLocation: storeLocation,
                distance: p.distanceFromCheckIn || 0,
                status: p.status === 'DEVIATION_CRITICAL' ? 'DISTANCE_ERROR' : 'OK',
                customType: 'POINT', // Generic type
                customColor: customColor,
                customLineColor: customLineColor,
                consultantHome: currentConsultantHome
            };
        });
    }, [currentDayData, currentConsultantHome, resolvedCheckIns]);

    // Summary Statistics Calculation
    const summaryStats = useMemo(() => {
        if (!filteredData) return [];
        const stats = {};
        filteredData.forEach(group => {
            const name = group.consultant;
            if (!stats[name]) {
                stats[name] = { name: name, deviations: 0, daysAnalyzed: 0 };
            }
            stats[name].daysAnalyzed += 1;
            // Count deviations (only Critical ones)
            const devCount = group.points.filter(p => p.status === 'DEVIATION_CRITICAL').length;
            stats[name].deviations += devCount;
        });
        return Object.values(stats).sort((a, b) => b.deviations - a.deviations);
    }, [filteredData]);

    const generatePDFReport = (consultantName = null) => {
        const doc = new jsPDF();
        let yPos = 20;
        
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text("Relatório de Exceções Geográficas (Auditoria)", 14, yPos);
        yPos += 10;
        
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        const dateStr = new Date().toLocaleString('pt-BR');
        doc.text(`Gerado em: ${dateStr}`, 14, yPos);
        
        if (consultantName) {
            yPos += 7;
            doc.setFont("helvetica", "bold");
            doc.text(`Consultor: ${consultantName}`, 14, yPos);
            doc.setFont("helvetica", "normal");
        }
        
        yPos += 15;

        // Determine which data to process
        let targets = filteredData || [];
        if (consultantName) {
            targets = targets.filter(g => g.consultant === consultantName);
        }

        let hasDeviations = false;

        targets.forEach(group => {
            // Resolver os check-ins desse grupo/dia por proximidade geográfica
            const groupCheckIns = group.points
                .filter(p => p.status === 'CHECKIN_MARKER')
                .map(p => {
                    let finalStoreName = p.storeName;

                    const nameLower = (finalStoreName || '').toLowerCase();
                    const isGeneric = !finalStoreName || finalStoreName.length <= 4 || /^\d+$/.test(finalStoreName) || nameLower.includes('execução') || nameLower.includes('execucao') || nameLower.includes('tracking');

                    if (isGeneric && locations && locations.length > 0) {
                        let minInfo = { name: null, dist: 1500 };

                        locations.forEach(loc => {
                            const dist = calculateDistance(p.lat, p.lng, Number(loc.latitude), Number(loc.longitude));
                            if (dist !== null && dist < minInfo.dist) {
                                minInfo = { name: loc.nome_pdv || loc.bandeira, dist: dist };
                            }
                        });

                        if (minInfo.name) {
                            finalStoreName = minInfo.name;
                        }
                    }

                    return { 
                        ...p, 
                        storeName: finalStoreName || (p.info && p.info.length > 10 ? p.info : 'Loja Desconhecida')
                    };
                });

            // Mapear os desvios resolvendo os nomes das lojas com base nos check-ins resolvidos
            const deviations = group.points
                .filter(p => p.status === 'DEVIATION_CRITICAL')
                .map(p => {
                    const resolved = groupCheckIns.find(rc => rc.time === p.relatedCheckInTime);
                    return {
                        ...p,
                        relatedStoreName: resolved?.storeName || p.relatedStoreName
                    };
                });

            if (deviations.length === 0) return;

            // Agrupar desvios por loja
            const storeGroups = {};
            deviations.forEach(dev => {
                const store = dev.relatedStoreName || 'Desconhecida';
                if (!storeGroups[store]) {
                    storeGroups[store] = [];
                }
                storeGroups[store].push(dev);
            });

            Object.keys(storeGroups).forEach(store => {
                hasDeviations = true;
                const points = storeGroups[store];
                
                // Find min/max time and max distance
                let minTime = points[0].time;
                let maxTime = points[0].time;
                let maxDistance = 0;

                points.forEach(p => {
                    if (p.time < minTime) minTime = p.time;
                    if (p.time > maxTime) maxTime = p.time;
                    if (p.distanceFromCheckIn > maxDistance) maxDistance = p.distanceFromCheckIn;
                });

                const timeStr = minTime === maxTime ? minTime : `${minTime} até as ${maxTime}`;
                const distFormatted = formatDistance(maxDistance);

                const text = `${group.consultant} > desvio no dia ${group.date} previsto para atender a loja ${store} esteve gps constando ${distFormatted} da loja entre os horarios das ${timeStr}`;

                // Add bullet point
                doc.circle(15, yPos - 1.5, 1, 'F');
                
                // Add to PDF, handle word wrap
                const splitText = doc.splitTextToSize(text, 175); // 175mm width to account for bullet
                
                // Check page bounds
                if (yPos + (splitText.length * 5) > 280) {
                    doc.addPage();
                    yPos = 20;
                }

                doc.text(splitText, 18, yPos);
                yPos += (splitText.length * 5) + 5;
            });
        });

        if (!hasDeviations) {
            doc.text("Nenhum desvio crítico encontrado para o filtro selecionado.", 14, yPos);
        }

        const fileName = consultantName 
            ? `Relatorio_Desvios_${consultantName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.pdf`
            : `Relatorio_Desvios_Geral_${new Date().toISOString().slice(0,10)}.pdf`;

        doc.save(fileName);
    };

    const sendEmailReport = (consultantName) => {
        if (!consultantName) return;

        let targets = (filteredData || []).filter(g => g.consultant === consultantName);

        const deviationsList = [];
        const uniqueDates = new Set();

        targets.forEach(group => {
            const groupCheckIns = group.points
                .filter(p => p.status === 'CHECKIN_MARKER')
                .map(p => {
                    let finalStoreName = p.storeName;
                    const nameLower = (finalStoreName || '').toLowerCase();
                    const isGeneric = !finalStoreName || finalStoreName.length <= 4 || /^\d+$/.test(finalStoreName) || nameLower.includes('execução') || nameLower.includes('execucao') || nameLower.includes('tracking');

                    if (isGeneric && locations && locations.length > 0) {
                        let minInfo = { name: null, dist: 1500 };
                        locations.forEach(loc => {
                            const dist = calculateDistance(p.lat, p.lng, Number(loc.latitude), Number(loc.longitude));
                            if (dist !== null && dist < minInfo.dist) {
                                minInfo = { name: loc.nome_pdv || loc.bandeira, dist: dist };
                            }
                        });
                        if (minInfo.name) {
                            finalStoreName = minInfo.name;
                        }
                    }

                    return { 
                        ...p, 
                        storeName: finalStoreName || (p.info && p.info.length > 10 ? p.info : 'Loja Desconhecida')
                    };
                });

            const deviations = group.points
                .filter(p => p.status === 'DEVIATION_CRITICAL')
                .map(p => {
                    const resolved = groupCheckIns.find(rc => rc.time === p.relatedCheckInTime);
                    return {
                        ...p,
                        relatedStoreName: resolved?.storeName || p.relatedStoreName
                    };
                });

            if (deviations.length === 0) return;

            const storeGroups = {};
            deviations.forEach(dev => {
                const store = dev.relatedStoreName || 'Desconhecida';
                if (!storeGroups[store]) {
                    storeGroups[store] = [];
                }
                storeGroups[store].push(dev);
            });

            Object.keys(storeGroups).forEach(store => {
                const points = storeGroups[store];
                let minTime = points[0].time;
                let maxTime = points[0].time;
                let maxDistance = 0;

                points.forEach(p => {
                    if (p.time < minTime) minTime = p.time;
                    if (p.time > maxTime) maxTime = p.time;
                    if (p.distanceFromCheckIn > maxDistance) maxDistance = p.distanceFromCheckIn;
                });

                const timeStr = minTime === maxTime ? minTime : `${minTime} até as ${maxTime}`;
                const distFormatted = formatDistance(maxDistance);

                uniqueDates.add(group.date);

                deviationsList.push({
                    date: group.date,
                    store: store,
                    distance: distFormatted,
                    time: timeStr
                });
            });
        });

        if (deviationsList.length === 0) {
            alert("Nenhum desvio crítico encontrado para este consultor.");
            return;
        }

        const sortedDatesArray = Array.from(uniqueDates).sort((a, b) => {
            const [d1, m1, y1] = a.split('/').map(Number);
            const [d2, m2, y2] = b.split('/').map(Number);
            return new Date(y1, m1 - 1, d1) - new Date(y2, m2 - 1, d2);
        });

        const formattedDatesOnly = sortedDatesArray.map(dateStr => {
            const parts = dateStr.split('/');
            return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : dateStr;
        });

        let datesText = '';
        if (formattedDatesOnly.length === 1) {
            datesText = `no dia ${formattedDatesOnly[0]}`;
        } else if (formattedDatesOnly.length > 1) {
            const lastDate = formattedDatesOnly.pop();
            datesText = `nos dias ${formattedDatesOnly.join(', ')} e ${lastDate}`;
        }

        let detailsText = '';
        deviationsList.forEach(dev => {
            detailsText += `- No dia ${dev.date}, previsto para atender a loja "${dev.store}", o GPS registrou um desvio de ${dev.distance} entre os horários das ${dev.time}.\n\n`;
        });

        const emailMap = {
            'alexandre': 'alexandre.lima@protrademkt.com.br',
            'diogo': 'diogo.santos@protrademkt.com.br',
            'tatiane': 'tatiane.souza@protrademkt.com.br',
            'liedy': 'liedy.santos@protrademkt.com.br',
            'luiz': 'luiz.falcao@protrademkt.com.br'
        };

        const lowerName = (consultantName || '').toLowerCase();
        let toEmail = 'gabriel.amorim@protrademkt.com.br';
        for (const [key, email] of Object.entries(emailMap)) {
            if (lowerName.includes(key)) {
                toEmail = email;
                break;
            }
        }

        const ccEmail = 'laryssa.teixeira@protrademkt.com.br';
        const subject = encodeURIComponent('Alinhamento de registros de roteiro – Sistema Umov.me');
        
        const bodyText = `Olá,

Durante a análise rotineira dos dados de GPS do sistema Umov.me, notamos algumas divergências de localização ${datesText}. O sistema registrou deslocamentos superiores a 500 metros em relação aos pontos de atendimento previstos no roteiro.

Para que possamos regularizar esses registros, você poderia nos informar se nessas datas houve alguma demanda extra solicitada pela Samsung, como ações de café, treinamentos ou almoços de relacionamento?


Detalhamento das divergências encontradas:

${detailsText}

Atenciosamente,
Coordenação de Operações`;

        const body = encodeURIComponent(bodyText);

        window.location.href = `mailto:${toEmail}?cc=${ccEmail}&subject=${subject}&body=${body}`;
    };

    // If no data and not client mode, show upload prompt
    if ((!data || data.length === 0) && !isClientMode) {
        return (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-6 text-center bg-zinc-950/40 border border-zinc-800 border-dashed rounded-lg">
                <div className="w-20 h-20 bg-purple-500/10 rounded-full flex items-center justify-center border border-purple-500/20">
                    <Upload size={32} className="text-purple-400" strokeWidth={1.5} />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white mb-2 uppercase tracking-tighter">Histórico de Pontos</h2>
                    <p className="text-zinc-500 text-sm max-w-md mx-auto">
                        Suba o arquivo CSV de rastreamento para visualizar desvios e rotas no mapa geográfico.
                    </p>
                </div>
                <div className="w-full max-w-sm px-4">
                    <FileUploader 
                        label="UPLOAD HISTÓRICO (.CSV)" 
                        file={pointHistoryFile} 
                        onFileSelect={onFileSelect} 
                        color="blue" 
                    />
                </div>
            </div>
        );
    }

    if (!data || data.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4">
                <Search size={48} className="text-zinc-700" strokeWidth={1} />
                <span className="text-zinc-500 font-mono text-xs uppercase tracking-widest">Nenhum dado disponível</span>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full relative">

            {/* COLUMN 1: SUMMARY (CONSULTANT LIST) - 2 COLS */}
            <div className="lg:col-span-2 flex flex-col gap-4 overflow-hidden h-full border-r border-zinc-800 pr-2">
                <div className="p-3 bg-zinc-950/20 border-b border-zinc-800">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                            <User size={14} />
                            Consultores
                        </h3>
                        <span className="text-[10px] text-zinc-600">{summaryStats.length}</span>
                    </div>
                    <button
                        onClick={() => generatePDFReport()}
                        className="w-full flex items-center justify-center gap-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-900/50 hover:border-red-500/50 p-2 rounded text-[10px] uppercase font-bold tracking-widest transition-colors"
                        title="Baixar PDF Geral com todos os desvios"
                    >
                        <FileDown size={14} />
                        PDF Geral
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-zinc-700">
                    {summaryStats.map((stat, idx) => (
                        <div
                            key={idx}
                            onClick={() => setSelectedConsultant(stat.name)}
                            className={`
                                p-3 rounded cursor-pointer border transition-all text-xs
                                ${selectedConsultant === stat.name
                                    ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/20'
                                    : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}
                            `}
                        >
                            <div className="font-bold truncate mb-1">{stat.name}</div>
                            <div className="flex justify-between items-center text-[10px]">
                                <span>{stat.daysAnalyzed} dias</span>
                                {stat.deviations > 0 ? (
                                    <span className="text-red-400 font-bold flex items-center gap-1">
                                        <AlertTriangle size={8} /> {stat.deviations}
                                    </span>
                                ) : (
                                    <span className="text-emerald-500 font-bold">OK</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                {/* New Uploader section at the bottom of the list */}
                {!isClientMode && (
                    <div className="mt-auto pt-4 border-t border-zinc-800 px-1 pb-2">
                        <div className="bg-zinc-900/40 p-3 border border-zinc-800 rounded group hover:border-zinc-700 transition-all">
                            <h4 className="text-[10px] text-zinc-500 uppercase tracking-widest mb-3 font-mono">Alterar Arquivo</h4>
                            <FileUploader 
                                label="" 
                                file={pointHistoryFile} 
                                onFileSelect={onFileSelect} 
                                color="blue" 
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* COLUMN 2: DETAILS (FILTERS & LOGS) - 2 COLS */}
            <div className="hidden lg:flex lg:col-span-2 flex-col gap-4 overflow-hidden h-full">

                {/* FILTERS */}
                <div className="bg-zinc-900/50 border border-zinc-800 p-4 space-y-4">
                    {selectedConsultant && (
                        <div className="pb-3 mb-3 border-b border-zinc-800 space-y-2">
                            <button
                                onClick={() => generatePDFReport(selectedConsultant)}
                                className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 hover:border-zinc-500 p-2 rounded text-[10px] uppercase font-bold tracking-widest transition-colors"
                            >
                                <FileDown size={14} />
                                Exportar PDF Individual
                            </button>
                            <button
                                onClick={() => sendEmailReport(selectedConsultant)}
                                className="w-full flex items-center justify-center gap-2 bg-blue-900/30 hover:bg-blue-900/50 text-blue-400 border border-blue-900/50 hover:border-blue-500/50 p-2 rounded text-[10px] uppercase font-bold tracking-widest transition-colors"
                            >
                                <Mail size={14} />
                                Enviar por E-mail
                            </button>
                        </div>
                    )}
                    <div>
                        <label className="text-[10px] uppercase font-bold text-zinc-500 mb-1 flex items-center gap-2">
                            <Calendar size={12} /> Data
                        </label>
                        <select
                            value={selectedDate}
                            onChange={e => setSelectedDate(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs p-2 rounded focus:border-blue-500 outline-none"
                        >
                            {availableDates.map(d => (
                                <option
                                    key={d.date}
                                    value={d.date}
                                    className={d.hasWarning ? "text-red-500 font-bold bg-zinc-900" : "text-zinc-300"}
                                >
                                    {d.date} {d.hasWarning ? " ⚠️" : ""}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* ALERTS / DEVIATIONS */}
                <div className="flex-1 bg-zinc-900 border border-zinc-800 flex flex-col overflow-hidden">
                    <div className="p-3 bg-zinc-950/20 border-b border-zinc-800 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <AlertTriangle size={14} className="text-zinc-400" />
                            <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Pings do Dia</span>
                        </div>
                        <div className="flex bg-zinc-900 p-0.5 rounded border border-zinc-800 text-[10px]">
                            <button
                                onClick={() => setPingViewMode('deviations')}
                                className={`px-2 py-0.5 rounded transition-colors uppercase font-mono ${pingViewMode === 'deviations' ? 'bg-red-950/45 text-red-400 font-bold border border-red-900/30' : 'text-zinc-500 hover:text-zinc-350'}`}
                            >
                                Desvios ({deviations.length})
                            </button>
                            <button
                                onClick={() => setPingViewMode('all')}
                                className={`px-2 py-0.5 rounded transition-colors uppercase font-mono ${pingViewMode === 'all' ? 'bg-blue-950/45 text-blue-400 font-bold border border-blue-900/30' : 'text-zinc-500 hover:text-zinc-350'}`}
                            >
                                Todos ({currentDayData?.points?.length || 0})
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin scrollbar-thumb-zinc-700">
                        {pingViewMode === 'deviations' ? (
                            deviations.length === 0 ? (
                                <div className="text-center p-8 text-zinc-600 text-xs">
                                    Nenhum desvio
                                </div>
                            ) : (
                                deviations.map((dev, idx) => (
                                    <div key={idx} className="bg-red-950/10 border border-red-900/30 p-2 rounded hover:bg-red-900/20 transition-colors">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-red-300 font-mono font-bold text-xs">{dev.time}</span>
                                            <span className="text-[10px] text-zinc-500 truncate max-w-[80px]" title={dev.relatedStoreName}>
                                                {dev.relatedStoreName || 'Desc.'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] text-red-500 font-bold">
                                                +{formatDistance(dev.distanceFromCheckIn)}
                                            </span>
                                        </div>
                                        <p className="text-[10px] text-zinc-500 truncate" title={dev.info}>
                                            {dev.info || 'Sem informações'}
                                        </p>
                                    </div>
                                ))
                            )
                        ) : (
                            allPoints.length === 0 ? (
                                <div className="text-center p-8 text-zinc-600 text-xs">
                                    Nenhum ping registrado
                                </div>
                            ) : (
                                allPoints.map((p, idx) => {
                                    let bgClass = "bg-zinc-900/30 border border-zinc-800";
                                    let textClass = "text-zinc-400";
                                    let distText = "";
                                    let statusLabel = "Viagem";
                                    
                                    if (p.status === 'DEVIATION_CRITICAL') {
                                        bgClass = "bg-red-950/10 border border-red-900/30 hover:bg-red-900/20";
                                        textClass = "text-red-300";
                                        statusLabel = "Desvio";
                                        distText = `+${formatDistance(p.distanceFromCheckIn)}`;
                                    } else if (p.isGpsSpike) {
                                        bgClass = "bg-amber-950/10 border border-amber-900/20 hover:bg-amber-900/10";
                                        textClass = "text-amber-300";
                                        statusLabel = "Oscilação GPS";
                                        distText = `+${formatDistance(p.distanceFromCheckIn)}`;
                                    } else if (p.lowGpsAccuracy) {
                                        bgClass = "bg-amber-950/5 border border-amber-900/15 hover:bg-amber-900/10";
                                        textClass = "text-amber-300/80";
                                        statusLabel = "Sinal Ruim";
                                        distText = `+${formatDistance(p.distanceFromCheckIn)}`;
                                    } else if (p.status === 'IN_STORE') {
                                        bgClass = "bg-emerald-950/5 border border-emerald-900/20 hover:bg-emerald-900/10";
                                        textClass = "text-emerald-300";
                                        statusLabel = "Na Loja";
                                        distText = formatDistance(p.distanceFromCheckIn);
                                    } else if (p.status === 'CHECKIN_MARKER') {
                                        bgClass = "bg-emerald-900/10 border border-emerald-500/30 hover:bg-emerald-900/25";
                                        textClass = "text-emerald-400";
                                        statusLabel = "Check-In";
                                    } else if (p.status === 'CHECKOUT_MARKER') {
                                        bgClass = "bg-emerald-950/10 border border-emerald-900/30 hover:bg-emerald-950/20";
                                        textClass = "text-emerald-400";
                                        statusLabel = "Check-Out";
                                        distText = formatDistance(p.distanceFromCheckIn);
                                    }

                                    return (
                                        <div key={idx} className={`${bgClass} p-2 rounded transition-colors`}>
                                            <div className="flex justify-between items-center mb-1">
                                                <span className={`${textClass} font-mono font-bold text-xs`}>{p.time}</span>
                                                <span className="text-[9px] text-zinc-500 truncate max-w-[80px]" title={p.relatedStoreName || p.storeName}>
                                                    {p.relatedStoreName || p.storeName || ''}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center text-[10px]">
                                                <span className="text-zinc-400 font-mono text-[9px] uppercase">{statusLabel}</span>
                                                {distText && (
                                                    <span className={`${p.status === 'DEVIATION_CRITICAL' ? 'text-red-500 font-bold' : 'text-emerald-500'}`}>
                                                        {distText}
                                                    </span>
                                                )}
                                            </div>
                                            {p.info && (
                                                <p className="text-[10px] text-zinc-500 truncate mt-0.5" title={p.info}>
                                                    {p.info}
                                                </p>
                                            )}
                                        </div>
                                    );
                                })
                            )
                        )}
                    </div>
                </div>

                {/* CHECK-INS LIST */}
                <div className="bg-zinc-900 border border-zinc-800 flex flex-col overflow-hidden h-1/3">
                    <div className="p-3 bg-emerald-950/20 border-b border-emerald-900/30 flex justify-between items-center">
                        <h3 className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                            <MapPin size={12} />
                            Janelas ({currentDayData?.windows?.length || 0})
                        </h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {checkIns.map((ci, idx) => {
                            const isStart = idx % 2 === 0;
                            return (
                                <div key={idx} className={`p-2 rounded border ${isStart ? 'bg-emerald-950/20 border-emerald-900/30' : 'bg-zinc-900/50 border-zinc-800'}`}>
                                    <div className="flex justify-between items-center">
                                        <span className={`font-mono font-bold text-xs ${isStart ? 'text-emerald-300' : 'text-zinc-400'}`}>
                                            {ci.time}
                                        </span>
                                    </div>
                                    <div className="mt-1 text-[10px] font-bold text-zinc-300 uppercase truncate" title={ci.storeName || ci.info}>
                                        {ci.storeName || (ci.info && ci.info.length > 5 ? ci.info : 'Desconhecida')}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* COLUMN 3: RIGHT MAIN MAP - 8 COLS */}
            <div className="col-span-1 lg:col-span-8 bg-zinc-900 border border-zinc-800 relative min-h-[500px] lg:min-h-0">
                <MapViewer points={mapDataPoints} />

                {/* OVERLAY LEGEND */}
                <div className="absolute bottom-4 left-4 bg-zinc-950/90 border border-zinc-800 p-3 rounded text-[10px] space-y-2 backdrop-blur">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                        <span className="text-zinc-300">Ponto Zero (Check-in)</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full border border-emerald-500"></div>
                        <span className="text-zinc-300">Em Loja (Validado)</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500"></div>
                        <span className="text-zinc-300">Desvio Crítico (&gt;500m)</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-zinc-500"></div>
                        <span className="text-zinc-300">Deslocamento (Ignorado)</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PointHistoryViewer;
