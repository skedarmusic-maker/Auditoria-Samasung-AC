import React, { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Building2, AlertTriangle, Clock, ChevronDown, ChevronUp } from 'lucide-react';

const StoreDelayRanking = ({ data }) => {
    const [sortMetric, setSortMetric] = useState('count'); // 'count' | 'avg'
    const [expandedNetwork, setExpandedNetwork] = useState(null);

    const ranking = useMemo(() => {
        if (!data || data.length === 0) return [];

        // 1. Filter for delays > 15 min and valid visits
        const delayedVisits = data.filter(row => {
            const delay = row.umovmeDelay !== null ? Math.abs(row.umovmeDelay) : (row.timeDiff ? Math.abs(row.timeDiff) : 0);
            return delay > 15; // Only care about delays > 15 min
        });

        // 2. Group by BANDEIRA (Network)
        const grouped = delayedVisits.reduce((acc, row) => {
            const networkName = (row.store && row.store.bandeira) ? row.store.bandeira : 'DESCONHECIDO';

            if (!acc[networkName]) {
                acc[networkName] = {
                    name: networkName,
                    count: 0,
                    totalDelayMinutes: 0,
                    storeDetails: {} // Map to track stats per store
                };
            }

            const delay = row.umovmeDelay !== null ? Math.abs(row.umovmeDelay) : (row.timeDiff ? Math.abs(row.timeDiff) : 0);

            acc[networkName].count++;
            acc[networkName].totalDelayMinutes += delay;

            // Track distinct store details
            const storeName = row.store ? row.store.name : 'Unknown';

            if (!acc[networkName].storeDetails[storeName]) {
                acc[networkName].storeDetails[storeName] = { count: 0, totalDelay: 0 };
            }
            acc[networkName].storeDetails[storeName].count++;
            acc[networkName].storeDetails[storeName].totalDelay += delay;

            return acc;
        }, {});

        // 3. Calculate Stats and Sort
        return Object.values(grouped).map(item => {
            // Convert storeDetails map to sorted array
            const storesList = Object.entries(item.storeDetails).map(([name, stats]) => ({
                name,
                count: stats.count,
                avgDelay: Math.round(stats.totalDelay / stats.count)
            })).sort((a, b) => b.count - a.count);

            return {
                ...item,
                avgDelay: Math.round(item.totalDelayMinutes / item.count),
                uniqueStores: storesList.length,
                storesList
            };
        }).sort((a, b) => {
            if (sortMetric === 'count') return b.count - a.count;
            return b.avgDelay - a.avgDelay;
        });

    }, [data, sortMetric]);

    if (ranking.length === 0) return null;

    return (
        <div className="bg-zinc-900/50 border border-zinc-800 flex flex-col h-full animate-in fade-in slide-in-from-right-4 min-h-[400px]">
            <div className="p-3 border-b border-zinc-800 bg-zinc-900 flex justify-between items-center">
                <h3 className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest flex items-center gap-2">
                    <Building2 size={12} className="text-orange-500" />
                    Ofensores (Redes/Lojas)
                </h3>
                <div className="flex gap-1">
                    <button
                        onClick={() => setSortMetric('count')}
                        className={clsx(
                            "text-[8px] font-mono uppercase px-2 py-1 rounded transition-colors",
                            sortMetric === 'count' ? "bg-zinc-700 text-white" : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                        )}
                        title="Ordenar por Frequência"
                    >
                        Qtd
                    </button>
                    <button
                        onClick={() => setSortMetric('avg')}
                        className={clsx(
                            "text-[8px] font-mono uppercase px-2 py-1 rounded transition-colors",
                            sortMetric === 'avg' ? "bg-zinc-700 text-white" : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                        )}
                        title="Ordenar por Média de Atraso"
                    >
                        Tempo
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {ranking.map((item, idx) => (
                    <div key={item.name} className="border border-zinc-800 bg-zinc-900/30 overflow-hidden transition-all">
                        {/* Header Row - CLICÁVEL */}
                        <div
                            onClick={() => setExpandedNetwork(expandedNetwork === item.name ? null : item.name)}
                            className="flex items-center justify-between p-2 cursor-pointer hover:bg-zinc-800/50 transition-colors group"
                            title="Clique para ver as lojas"
                        >
                            <div className="flex items-center gap-3 overflow-hidden">
                                <span className={clsx(
                                    "text-[10px] font-mono font-bold w-4 text-center opacity-70",
                                    idx < 3 ? "text-red-500" : "text-zinc-500"
                                )}>#{idx + 1}</span>
                                <div className="flex flex-col overflow-hidden">
                                    <span className="text-[10px] text-zinc-200 font-bold truncate group-hover:text-white transition-colors">{item.name}</span>
                                    <span className="text-[8px] text-zinc-500 truncate">{item.uniqueStores} loja(s) com atrasos</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <div className="flex flex-col items-end gap-1">
                                    <div className="flex items-center gap-1" title="Quantidade de Atrasos (>15min)">
                                        <span className="text-[7px] text-zinc-600 font-mono uppercase">QTD</span>
                                        <span className="text-[10px] font-bold text-red-400">{item.count}</span>
                                        <AlertTriangle size={8} className="text-red-500/50" />
                                    </div>
                                    <div className="flex items-center gap-1" title="Média de Tempo de Atraso">
                                        <span className="text-[7px] text-zinc-600 font-mono uppercase">MÉD</span>
                                        <span className="text-[9px] font-mono text-zinc-400">{item.avgDelay}m</span>
                                        <Clock size={8} className="text-zinc-600" />
                                    </div>
                                </div>
                                {expandedNetwork === item.name ?
                                    <ChevronUp size={14} className="text-orange-500" /> :
                                    <ChevronDown size={14} className="text-zinc-500" />
                                }
                            </div>
                        </div>

                        {/* Expanded List - DROPDOWN */}
                        {expandedNetwork === item.name && (
                            <div className="bg-zinc-950/50 border-t border-zinc-800 p-2 space-y-1 animate-in slide-in-from-top-2 duration-200">
                                <div className="text-[8px] text-zinc-600 uppercase font-mono mb-2 px-2">Lojas Ofensoras:</div>
                                {item.storesList.map((store, sIdx) => (
                                    <div key={store.name} className="flex justify-between items-center text-[9px] pl-6 pr-2 py-1.5 hover:bg-zinc-900/50 rounded border-l-2 border-l-transparent hover:border-l-orange-500/50 transition-all">
                                        <span className="text-zinc-300 truncate flex-1" title={store.name}>{store.name}</span>
                                        <div className="flex gap-4 items-center">
                                            <div className="flex items-center gap-1">
                                                <span className="text-[7px] text-zinc-600">QTD</span>
                                                <span className="text-zinc-400 font-mono font-bold">{store.count}</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <span className="text-[7px] text-zinc-600">MÉD</span>
                                                <span className="text-orange-500/80 font-mono font-bold w-8 text-right">{store.avgDelay}m</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
            <div className="p-2 border-t border-zinc-800 bg-zinc-900/50 text-[9px] text-center text-zinc-500 font-mono uppercase">
                Atrasos {'>'} 15min
            </div>
        </div>
    );
};

export default StoreDelayRanking;
