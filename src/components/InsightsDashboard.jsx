import React, { useMemo } from 'react';
import { clsx } from 'clsx';
import { User, Clock, MapPin, AlertTriangle, CheckCircle, XCircle, TrendingUp } from 'lucide-react';
import StoreDelayRanking from './StoreDelayRanking';

const formatMinutes = (minutes) => {
    if (minutes === undefined || minutes === null) return '';
    const mins = Math.abs(minutes);
    const hrs = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    
    if (hrs > 0) {
        return `${hrs}h ${remainingMins > 0 ? `${remainingMins}m` : ''}`;
    }
    return `${remainingMins}m`;
};

const InsightsDashboard = ({ data }) => {

    // 1. Group Data by Consultant with the new time and geolocalization rules
    const consultantMetrics = useMemo(() => {
        const metrics = {};

        data.forEach(row => {
            const consultant = row.consultant || 'N/A';
            if (!metrics[consultant]) {
                metrics[consultant] = {
                    name: consultant,
                    total: 0,
                    timeOk: 0,
                    timeWarning: 0, // Desvio leve (16-30m)
                    timeError: 0,   // Desvio crítico (>30m)
                    geoOk: 0,
                    geoError: 0,    // DISTANCE_ERROR or TRAVEL_ERROR
                };
            }

            const m = metrics[consultant];
            m.total++;

            // Regra Especial: Se a visita foi APROVADA manualmente pelo auditor, conta como 100% OK!
            if (row.status === 'APPROVED') {
                m.timeOk++;
                m.geoOk++;
                return;
            }

            // Time Compliance (Roteiro e Batida Antecipada Local)
            const umovmeDelay = row.umovmeDelay; // Atraso/antecedência do roteiro (Umovme real vs planejado)
            const timeDiff = row.timeDiff;       // Comparativo Sólides vs Umovme (Ponto vs Chegada na Loja)
            const isViagem = ['TRAVEL_OK', 'TRAVEL_ERROR'].includes(row.status) || ['TRAVEL_OK', 'TRAVEL_ERROR'].includes(row.originalStatus);

            let hasTimeError = false;
            let hasTimeWarning = false;

            // A) Desvio de Roteiro (Umovme Delay)
            if (umovmeDelay !== null) {
                const diff = Math.abs(umovmeDelay);
                if (diff > 30) {
                    hasTimeError = true;
                } else if (diff > 15) {
                    hasTimeWarning = true;
                }
            }

            // B) Batida Antecipada Local (Sólides vs Umovme)
            // Se for rota LOCAL (não viagem) e ele bateu o ponto no Sólides antes de chegar na loja no Umovme (timeDiff < 0)
            if (timeDiff !== null && !isViagem) {
                if (timeDiff < -30) {
                    hasTimeError = true; // Batida mais de 30m antes de estar na loja (Crítico)
                } else if (timeDiff < -15) {
                    hasTimeWarning = true; // Batida entre 16m e 30m antes (Leve)
                }
            }

            // Classificar o status final de pontualidade da visita
            if (hasTimeError) {
                m.timeError++;
            } else if (hasTimeWarning) {
                m.timeWarning++;
            } else {
                m.timeOk++;
            }

            // Geo Compliance
            if (['OK', 'TRAVEL_OK', 'APPROVED'].includes(row.status)) {
                m.geoOk++;
            } else if (['DISTANCE_ERROR', 'TRAVEL_ERROR'].includes(row.status)) {
                m.geoError++;
            }
        });

        return Object.values(metrics).sort((a, b) => b.total - a.total); // Sort by volume
    }, [data]);

    // 1.1. Extrair os alertas de batida adiantada excessiva em rotas locais (Sólides vs Umovme)
    const earlyLocalAlerts = useMemo(() => {
        const alerts = [];
        data.forEach(row => {
            // Regra Especial: Se a visita foi APROVADA manualmente, NÃO gera alertas!
            if (row.status === 'APPROVED') return;

            const timeDiff = row.timeDiff;
            const isViagem = ['TRAVEL_OK', 'TRAVEL_ERROR'].includes(row.status) || ['TRAVEL_OK', 'TRAVEL_ERROR'].includes(row.originalStatus);
            
            // Se o timeDiff for negativo (Sólides batido antes de estar na loja) e não for viagem e for menor que -15 minutos
            if (timeDiff !== null && timeDiff < -15 && !isViagem) {
                alerts.push({
                    consultant: row.consultant || 'N/A',
                    date: row.date,
                    storeName: row.store?.name || row.umovme?.store || 'Loja Desconhecida',
                    solidesTime: row.solides?.time || '-',
                    umovmeTime: row.umovme?.time || '-',
                    minutesEarly: Math.abs(timeDiff)
                });
            }
        });
        // Ordenar pelos mais adiantados primeiro
        return alerts.sort((a, b) => b.minutesEarly - a.minutesEarly);
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
                    <p className="text-[10px] uppercase tracking-widest text-zinc-400 mb-1">Total Consultores</p>
                    <p className="text-2xl font-bold text-white">{consultantMetrics.length}</p>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 p-4 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-1 opacity-20"><CheckCircle size={48} /></div>
                    <p className="text-[10px] uppercase tracking-widest text-zinc-400 mb-1">Total Visitas</p>
                    <p className="text-2xl font-bold text-blue-400">{data.length}</p>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 p-4 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-1 opacity-20"><Clock size={48} className="text-amber-500/30" /></div>
                    <p className="text-[10px] uppercase tracking-widest text-zinc-400 mb-1">Alertas de Antecedência Local</p>
                    <p className="text-2xl font-bold text-amber-500">{earlyLocalAlerts.length}</p>
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
                                        <span className="text-[10px] uppercase text-zinc-400 tracking-wider font-mono">{c.total} VISITAS PROCESSADAS</span>
                                    </div>
                                    <div className="text-right">
                                        <div className={clsx("text-2xl font-black font-mono", scoreColor)}>{score}%</div>
                                        <div className="text-[9px] text-zinc-400 uppercase">Compliance Score</div>
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
                                            <span className="text-zinc-300">No Prazo (±15m)</span>
                                            <span className="text-emerald-400 font-mono">{c.timeOk}</span>
                                        </div>
                                        <div className="flex justify-between text-xs border-b border-zinc-900 py-1">
                                            <span className="text-zinc-300">Desvio Leve (16-30m)</span>
                                            <span className="text-amber-400 font-mono">{c.timeWarning}</span>
                                        </div>
                                        <div className="flex justify-between text-xs py-1">
                                            <span className="text-zinc-300">Desvio Crítico ({'>'}30m)</span>
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
                                            <span className="text-zinc-300">No Local</span>
                                            <span className="text-emerald-400 font-mono">{c.geoOk}</span>
                                        </div>
                                        <div className="flex justify-between text-xs py-1">
                                            <span className="text-zinc-300">Fora do Raio</span>
                                            <span className="text-red-400 font-mono">{c.geoError}</span>
                                        </div>
                                    </div>

                                    {/* Footer / Status Bar */}
                                    <div className="mt-4 pt-4 border-t border-zinc-900 col-span-2">
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

            {/* SEÇÃO PREMIUM: ALERTAS DE ANTECEDÊNCIA LOCAL EXCESSIVA (PONTO VS CHEGADA NA LOJA) */}
            <div className="bg-zinc-950 border border-zinc-800 p-6 rounded shadow-xl">
                <div className="flex items-center justify-between mb-4 border-b border-zinc-800 pb-4">
                    <div>
                        <h3 className="text-md font-bold text-amber-400 flex items-center gap-2 uppercase tracking-tighter">
                            <AlertTriangle size={18} />
                            Alertas de Antecedência Excessiva (Atendimento Local)
                        </h3>
                        <p className="text-xs text-zinc-500 mt-1">
                            Detecção de batidas de ponto no <b>Sólides</b> efetuadas mais de 15 minutos antes do registro real de chegada na loja (<b>Umovme</b>) em rotas locais.
                        </p>
                    </div>
                    <span className="bg-amber-950/40 text-amber-400 border border-amber-900/50 px-3 py-1 rounded text-xs font-bold font-mono">
                        {earlyLocalAlerts.length} Ocorrências
                    </span>
                </div>

                {earlyLocalAlerts.length === 0 ? (
                    <div className="text-center p-8 text-zinc-600 text-xs font-mono">
                        NENHUMA ANTECEDÊNCIA LOCAL EXCESSIVA DETECTADA.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-widest text-[9px] font-mono">
                                    <th className="py-3 px-4">Consultor</th>
                                    <th className="py-3 px-4">Data</th>
                                    <th className="py-3 px-4">Ponto de Venda (PDV)</th>
                                    <th className="py-3 px-4 text-center">Ponto Sólides</th>
                                    <th className="py-3 px-4 text-center">Chegada Loja (Umovme)</th>
                                    <th className="py-3 px-4 text-right">Antecedência</th>
                                </tr>
                            </thead>
                            <tbody>
                                {earlyLocalAlerts.map((alert, idx) => (
                                    <tr key={idx} className="border-b border-zinc-900 hover:bg-zinc-900/30 transition-colors">
                                        <td className="py-3 px-4 font-bold text-zinc-300">{alert.consultant}</td>
                                        <td className="py-3 px-4 text-zinc-400 font-mono">{alert.date}</td>
                                        <td className="py-3 px-4 text-zinc-400 truncate max-w-[250px]" title={alert.storeName}>
                                            {alert.storeName}
                                        </td>
                                        <td className="py-3 px-4 text-center text-zinc-500 font-mono">{alert.solidesTime}</td>
                                        <td className="py-3 px-4 text-center text-zinc-300 font-mono">{alert.umovmeTime}</td>
                                        <td className="py-3 px-4 text-right">
                                            <span className="inline-block bg-amber-950/20 text-amber-400 border border-amber-950 px-2 py-0.5 rounded font-mono font-bold">
                                                -{formatMinutes(alert.minutesEarly)}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default React.memo(InsightsDashboard);
