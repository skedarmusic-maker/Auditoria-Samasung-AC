import React, { useMemo } from 'react';
import { clsx } from 'clsx';
import { User, Clock, MapPin, AlertTriangle, CheckCircle, XCircle, TrendingUp } from 'lucide-react';
import StoreDelayRanking from './StoreDelayRanking';

const InsightsDashboard = ({ data }) => {

    // 1. Group Data by Consultant
    const consultantMetrics = useMemo(() => {
        const metrics = {};

        data.forEach(row => {
            const consultant = row.consultant || 'N/A';
            if (!metrics[consultant]) {
                metrics[consultant] = {
                    name: consultant,
                    total: 0,
                    timeOk: 0,
                    timeWarning: 0, // > 15min
                    timeError: 0,   // > 60min
                    geoOk: 0,
                    geoError: 0,    // DISTANCE_ERROR or TRAVEL_ERROR
                };
            }

            const m = metrics[consultant];
            m.total++;

            // Time Compliance (Based on UMOVME PREDICTED vs REALIZED)
            const delayToUse = row.umovmeDelay !== null ? row.umovmeDelay : row.timeDiff;

            if (delayToUse !== null) {
                const diff = Math.abs(delayToUse);
                if (diff <= 15) m.timeOk++;
                else if (diff <= 30) m.timeWarning++; // Updated from 60 to 30
                else m.timeError++; // > 30 is Critical
            } else {
                // If no time data, ignore for compliance
            }

            // Geo Compliance
            if (['OK', 'TRAVEL_OK', 'APPROVED'].includes(row.status)) {
                m.geoOk++;
            } else if (['DISTANCE_ERROR', 'TRAVEL_ERROR'].includes(row.status)) {
                m.geoError++;
            }
            // 'NO_VISIT', 'STORE_NOT_FOUND' are operational errors, maybe not "Geo Compliance" strictly, but let's focus on valid checks.
        });

        return Object.values(metrics).sort((a, b) => b.total - a.total); // Sort by volume
    }, [data]);

    // Helper for Score
    const getScore = (m) => {
        if (m.total === 0) return 0;
        // Weighted: Critical errors punish score more heavily
        const timeTotal = m.timeOk + m.timeWarning + m.timeError || 1;
        const timeScore = (m.timeOk * 1 + m.timeWarning * 0.6 + m.timeError * 0) / timeTotal;

        const geoTotal = m.geoOk + m.geoError || 1;
        const geoScore = (m.geoOk * 1 + m.geoError * 0) / geoTotal;

        return Math.round(((timeScore + geoScore) / 2) * 100);
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* HEADER SUMMARY */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-zinc-900/50 border border-zinc-800 p-4 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-1 opacity-20"><User size={48} /></div>
                    <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Total Consultores</p>
                    <p className="text-2xl font-bold text-white">{consultantMetrics.length}</p>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 p-4 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-1 opacity-20"><CheckCircle size={48} /></div>
                    <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Total Visitas</p>
                    <p className="text-2xl font-bold text-blue-400">{data.length}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                {/* LEFT COLUMN: STORE DELAY RANKING */}
                <div className="xl:col-span-1">
                    <StoreDelayRanking data={data} />
                </div>

                {/* RIGHT COLUMN: CONSULTANT CARDS */}
                <div className="xl:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-6">
                    {consultantMetrics.map((c) => {
                        const score = getScore(c);
                        let scoreColor = 'text-zinc-500';
                        let borderColor = 'border-zinc-800';

                        if (score >= 90) { scoreColor = 'text-emerald-400'; borderColor = 'border-emerald-500/30'; }
                        else if (score >= 70) { scoreColor = 'text-amber-400'; borderColor = 'border-amber-500/30'; }
                        else { scoreColor = 'text-red-400'; borderColor = 'border-red-500/30'; }

                        return (
                            <div key={c.name} className={clsx("bg-zinc-950 border p-5 relative group hover:bg-zinc-900/80 transition-all", borderColor)}>

                                {/* Header */}
                                <div className="flex justify-between items-start mb-4 border-b border-zinc-900 pb-4">
                                    <div>
                                        <h3 className="font-bold text-zinc-200 text-sm">{c.name}</h3>
                                        <span className="text-[10px] uppercase text-zinc-600 tracking-wider font-mono">{c.total} VISITAS PROCESSADAS</span>
                                    </div>
                                    <div className="text-right">
                                        <div className={clsx("text-2xl font-black font-mono", scoreColor)}>{score}%</div>
                                        <div className="text-[9px] text-zinc-600 uppercase">Compliance Score</div>
                                    </div>
                                </div>

                                {/* Metrics Grid */}
                                <div className="grid grid-cols-2 gap-4">

                                    {/* TIME METRICS */}
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Clock size={12} className="text-blue-500" />
                                            <span className="text-[10px] font-bold text-zinc-400 uppercase">Pontualidade (Roteiro)</span>
                                        </div>
                                        <div className="flex justify-between text-xs border-b border-zinc-900 py-1">
                                            <span className="text-zinc-500">No Prazo (0-15m)</span>
                                            <span className="text-emerald-400 font-mono">{c.timeOk}</span>
                                        </div>
                                        <div className="flex justify-between text-xs border-b border-zinc-900 py-1">
                                            <span className="text-zinc-500">Atraso Leve (16-30m)</span>
                                            <span className="text-amber-400 font-mono">{c.timeWarning}</span>
                                        </div>
                                        <div className="flex justify-between text-xs py-1">
                                            <span className="text-zinc-500">Crítico ({'>'}30m)</span>
                                            <span className="text-red-400 font-mono font-bold">{c.timeError}</span>
                                        </div>
                                    </div>

                                    {/* GEO METRICS */}
                                    <div className="space-y-1 border-l border-zinc-900 pl-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <MapPin size={12} className="text-purple-500" />
                                            <span className="text-[10px] font-bold text-zinc-400 uppercase">Geolocalização</span>
                                        </div>
                                        <div className="flex justify-between text-xs border-b border-zinc-900 py-1">
                                            <span className="text-zinc-500">No Local</span>
                                            <span className="text-emerald-400 font-mono">{c.geoOk}</span>
                                        </div>
                                        <div className="flex justify-between text-xs py-1">
                                            <span className="text-zinc-500">Fora do Raio</span>
                                            <span className="text-red-400 font-mono">{c.geoError}</span>
                                        </div>
                                    </div>

                                    {/* Footer / Status Bar */}
                                    <div className="mt-4 pt-4 border-t border-zinc-900">
                                        <div className="h-1 w-full bg-zinc-900 rounded-full overflow-hidden flex">
                                            <div style={{ width: `${(c.timeOk / (c.total || 1)) * 100}%` }} className="bg-blue-600/50 h-full" />
                                            <div style={{ width: `${(c.geoOk / (c.total || 1)) * 100}%` }} className="bg-emerald-600/50 h-full" />
                                        </div>
                                    </div>

                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default React.memo(InsightsDashboard);
