import React, { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Shield } from 'lucide-react';

const ComplianceRanking = ({ data }) => {
    const [sortOrder, setSortOrder] = useState('desc'); // 'desc' (Best first) or 'asc' (Worst first)

    const ranking = useMemo(() => {
        if (!data || data.length === 0) return [];

        // 1. Group by Consultant
        const grouped = data.reduce((acc, row) => {
            if (!row.consultant || row.consultant === 'N/A') return acc;
            if (!acc[row.consultant]) {
                acc[row.consultant] = {
                    name: row.consultant,
                    total: 0,
                    timeOk: 0,
                    timeWarning: 0,
                    timeError: 0,
                    geoOk: 0,
                    geoError: 0
                };
            }
            const c = acc[row.consultant];
            c.total++;

            // Time Logic (Sync with Insights Dashboard - Route Punctuality)
            const delayToUse = row.umovmeDelay !== null ? row.umovmeDelay : row.timeDiff;

            if (delayToUse !== null) {
                const diff = Math.abs(delayToUse);
                if (diff <= 15) c.timeOk++;
                else if (diff <= 30) c.timeWarning++;
                else c.timeError++;
            }

            // Geo Logic
            if (['OK', 'TRAVEL_OK', 'APPROVED'].includes(row.status)) c.geoOk++;
            else if (['DISTANCE_ERROR', 'TRAVEL_ERROR'].includes(row.status)) c.geoError++;

            return acc;
        }, {});

        // 2. Calculate Score
        return Object.values(grouped).map(c => {
            // Time Score
            const timeTotal = c.timeOk + c.timeWarning + c.timeError || 1;
            const timeScore = (c.timeOk * 1 + c.timeWarning * 0.6 + c.timeError * 0) / timeTotal;

            // Geo Score
            const geoTotal = c.geoOk + c.geoError || 1;
            const geoScore = (c.geoOk * 1 + c.geoError * 0) / geoTotal;

            // Final Score (Average of both * 100)
            const finalScore = Math.round(((timeScore + geoScore) / 2) * 100);

            return { ...c, score: finalScore };
        }).sort((a, b) => sortOrder === 'desc' ? b.score - a.score : a.score - b.score);
    }, [data, sortOrder]);

    if (ranking.length === 0) return null;

    return (
        <div className="bg-zinc-900/50 border border-zinc-800 flex flex-col h-full animate-in fade-in slide-in-from-left-4 min-h-[500px]">
            <div className="p-3 border-b border-zinc-800 bg-zinc-900 flex justify-between items-center">
                <h3 className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest flex items-center gap-2">
                    <Shield size={12} className="text-blue-500" />
                    Ranking de Conformidade
                </h3>
                <button
                    onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                    className="text-[9px] font-mono text-zinc-400 hover:text-white uppercase flex items-center gap-1 bg-zinc-800 px-2 py-1 rounded hover:bg-zinc-700 transition-colors"
                >
                    {sortOrder === 'desc' ? <TrendingUp size={10} className="text-emerald-500" /> : <TrendingDown size={10} className="text-red-500" />}
                    {sortOrder === 'desc' ? 'MELHORES' : 'PIORES'}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {ranking.map((item, idx) => (
                    <div key={item.name} className="flex items-center justify-between p-2 bg-zinc-900/30 border border-zinc-800 hover:border-zinc-700 group transition-all">
                        <div className="flex items-center gap-3 overflow-hidden">
                            <span className={clsx(
                                "text-[10px] font-mono font-bold w-4 text-center opacity-70",
                                idx < 3 ? "text-yellow-500" : "text-zinc-500"
                            )}>#{idx + 1}</span>
                            <div className="flex flex-col overflow-hidden">
                                <span className="text-[10px] text-zinc-200 font-bold truncate group-hover:text-white transition-colors">{item.name}</span>
                                <div className="flex gap-1 mt-0.5">
                                    <div className="h-1 rounded-full bg-zinc-800 w-12 overflow-hidden flex">
                                        <div className={clsx("h-full transition-all duration-1000",
                                            item.score >= 90 ? "bg-emerald-500" :
                                                item.score >= 70 ? "bg-amber-500" : "bg-red-500"
                                        )} style={{ width: `${item.score}%` }}></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col items-end">
                            <span className={clsx(
                                "text-xs font-mono font-bold",
                                item.score >= 90 ? "text-emerald-400" :
                                    item.score >= 70 ? "text-amber-400" : "text-red-400"
                            )}>
                                {item.score}
                            </span>
                            <span className="text-[8px] text-zinc-500 uppercase tracking-wider">SCORE</span>
                            <span className="text-[8px] text-zinc-500 font-mono mt-0.5 font-bold" title="Visitas Válidas / Total">
                                {item.timeOk + item.timeWarning + item.timeError}/{item.total}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="p-2 border-t border-zinc-800 bg-zinc-900/50 text-[9px] text-center text-zinc-500 font-mono uppercase">
                Baseado em Pontualidade + Geo
            </div>
        </div >
    );
};

export default ComplianceRanking;
