import React, { useState, useMemo } from 'react';
import { MapPin, Navigation, AlertTriangle, Clock, Calendar, User, Search } from 'lucide-react';
import MapViewer from './MapViewer';
import { calculateDistance } from '../services/GoogleMaps';

const PointHistoryViewer = ({
    data,
    locations,
    selectedConsultant,
    setSelectedConsultant,
    selectedDate,
    setSelectedDate
}) => {
    // data is an array of groups: { consultant, date, points: [...] }

    const consultants = useMemo(() => [...new Set(data.map(d => d.consultant))].sort(), [data]);

    // Filter available dates for selected consultant
    const availableDates = useMemo(() => {
        return data
            .filter(d => d.consultant === selectedConsultant)
            .map(d => d.date)
            .sort((a, b) => {
                const [d1, m1, y1] = a.split('/').map(Number);
                const [d2, m2, y2] = b.split('/').map(Number);
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
            if (!availableDates.includes(selectedDate)) {
                setSelectedDate(availableDates[0]);
            }
        } else {
            setSelectedDate('');
        }
    }, [selectedConsultant, availableDates, selectedDate, setSelectedDate]);

    // Get the specific day data
    const currentDayData = useMemo(() => {
        return data.find(d => d.consultant === selectedConsultant && d.date === selectedDate);
    }, [data, selectedConsultant, selectedDate]);

    // Prepare deviations list
    const deviations = useMemo(() => {
        if (!currentDayData) return [];
        return currentDayData.points.filter(p => p.status === 'DEVIATION_CRITICAL');
    }, [currentDayData]);

    // Prepare check-ins list with store name lookup
    const checkIns = useMemo(() => {
        if (!currentDayData) return [];
        return currentDayData.points
            .filter(p => p.status === 'CHECKIN_MARKER')
            .map(p => {
                // If we have a storeName from CSV, keep it. 
                // BUT if it's empty or generic, try to find the nearest store in Supabase "locations"
                let finalStoreName = p.storeName;

                if ((!finalStoreName || finalStoreName.length < 3) && locations && locations.length > 0) {
                    // Find nearest store (within 1km tolerance)
                    let minInfo = { name: null, dist: 1000 }; // 1km max tolerance for lookup

                    locations.forEach(loc => {
                        const dist = calculateDistance(p.lat, p.lng, Number(loc.latitude), Number(loc.longitude));
                        if (dist < minInfo.dist) {
                            minInfo = { name: loc.bandeira || loc.nome_pdv, dist: dist };
                        }
                    });

                    if (minInfo.name) {
                        finalStoreName = minInfo.name;
                    }
                }

                return { ...p, storeName: finalStoreName };
            });
    }, [currentDayData, locations]);

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
                // The Check-In Anchor (Green Circle)
                storeLocation = {
                    latitude: p.lat,
                    longitude: p.lng,
                    nome_pdv: `PONTO ZERO (CHECK-IN) - ${p.time}`,
                    code: 'CHECKIN'
                };
                return {
                    consultant: currentDayData.consultant,
                    date: currentDayData.date,
                    solides: {}, // No Arrow
                    storeLocation: storeLocation,
                    distance: 0,
                    status: 'OK',
                    customType: 'CHECKIN'
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
                customLineColor: customLineColor
            };
        });
    }, [currentDayData]);

    // Summary Statistics Calculation
    const summaryStats = useMemo(() => {
        if (!data) return [];
        const stats = {};
        data.forEach(group => {
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
    }, [data]);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-200px)] relative">

            {/* COLUMN 1: SUMMARY (CONSULTANT LIST) - 2 COLS */}
            <div className="lg:col-span-2 flex flex-col gap-4 overflow-hidden h-full border-r border-zinc-800 pr-2">
                <div className="p-3 bg-zinc-950/20 border-b border-zinc-800 flex justify-between items-center">
                    <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                        <User size={14} />
                        Consultores
                    </h3>
                    <span className="text-[10px] text-zinc-600">{summaryStats.length}</span>
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
            </div>

            {/* COLUMN 2: DETAILS (FILTERS & LOGS) - 3 COLS */}
            <div className="lg:col-span-3 flex flex-col gap-4 overflow-hidden h-full">

                {/* FILTERS */}
                <div className="bg-zinc-900/50 border border-zinc-800 p-4 space-y-4">
                    <div>
                        <label className="text-[10px] uppercase font-bold text-zinc-500 mb-1 block flex items-center gap-2">
                            <Calendar size={12} /> Data Selecionada
                        </label>
                        <select
                            value={selectedDate}
                            onChange={e => setSelectedDate(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs p-2 rounded focus:border-blue-500 outline-none"
                        >
                            {availableDates.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </div>
                </div>

                {/* ALERTS / DEVIATIONS */}
                <div className="flex-1 bg-zinc-900 border border-zinc-800 flex flex-col overflow-hidden">
                    <div className="p-3 bg-red-950/20 border-b border-red-900/30 flex justify-between items-center">
                        <h3 className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-2">
                            <AlertTriangle size={14} />
                            Desvios Críticos ({deviations.length})
                        </h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin scrollbar-thumb-zinc-700">
                        {deviations.length === 0 ? (
                            <div className="text-center p-8 text-zinc-600 text-xs">
                                Nenhum desvio detectado durante as janelas de visita.
                            </div>
                        ) : (
                            deviations.map((dev, idx) => (
                                <div key={idx} className="bg-red-950/10 border border-red-900/30 p-2 rounded hover:bg-red-900/20 transition-colors">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-red-300 font-mono font-bold text-xs">{dev.time}</span>
                                        <span className="text-[10px] text-zinc-500">
                                            {dev.relatedStoreName || 'Desconhecida'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] text-red-500 font-bold">
                                            +{Math.round(dev.distanceFromCheckIn)}m
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-zinc-500 truncate" title={dev.info}>
                                        {dev.info || 'Sem informações adicionais'}
                                    </p>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* CHECK-INS LIST */}
                <div className="bg-zinc-900 border border-zinc-800 flex flex-col overflow-hidden h-1/3">
                    <div className="p-3 bg-emerald-950/20 border-b border-emerald-900/30 flex justify-between items-center">
                        <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                            <MapPin size={14} />
                            Janelas de Visita ({currentDayData?.windows?.length || 0} Lojas)
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
                                        <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${isStart ? 'bg-emerald-900/30 text-emerald-500' : 'bg-zinc-800 text-zinc-500'}`}>
                                            {isStart ? 'INÍCIO' : 'FIM'}
                                        </span>
                                    </div>
                                    <div className="mt-1 text-[10px] font-bold text-zinc-300 uppercase truncate" title={ci.storeName || ci.info}>
                                        {ci.storeName || (ci.info && ci.info.length > 5 ? ci.info : 'Loja não identificada')}
                                    </div>
                                    <p className="text-[10px] text-zinc-500 truncate">
                                        {ci.lat.toFixed(5)}, {ci.lng.toFixed(5)}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* COLUMN 3: RIGHT MAIN MAP - 7 COLS */}
            <div className="lg:col-span-7 bg-zinc-900 border border-zinc-800 relative">
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
