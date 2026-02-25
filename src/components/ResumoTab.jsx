import { useMemo, useState, useRef } from 'react';
import { clsx } from 'clsx';
import { Shield, Sparkles, Loader2, FileDown, User, Clock, MapPin } from 'lucide-react';
import { generateConsultantSummary } from '../services/GeminiService';
import DashboardStats from './DashboardStats';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// --- Consultor Card with AI Summary (Insights Style) ---
const ConsultantResumoCard = ({ item, idx, allRows, pointRows }) => {
    const [summary, setSummary] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [expanded, setExpanded] = useState(false);

    const consultantRows = allRows.filter(r => r.consultant === item.name);
    const consultantPoints = pointRows.filter(p => {
        if (!p.name) return false;
        const n1 = p.name.toUpperCase().trim();
        const n2 = item.name.toUpperCase().trim();
        return n1 === n2 || n1.includes(n2.split(' ')[0]) || n2.includes(n1.split(' ')[0]);
    });

    const handleGenerate = async () => {
        setLoading(true);
        setError(null);
        try {
            const text = await generateConsultantSummary(item.name, item, consultantRows, consultantPoints);
            setSummary(text);
            setExpanded(true);
        } catch (e) {
            setError('Erro ao gerar análise. Verifique a API key.');
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const colorClass = item.score >= 90 ? 'text-emerald-400' : item.score >= 70 ? 'text-amber-400' : 'text-red-400';
    const borderClass = item.score >= 90 ? 'border-emerald-500/30' : item.score >= 70 ? 'border-amber-500/30' : 'border-red-500/30';

    return (
        <div className={clsx("bg-zinc-950 border p-5 relative group transition-all", borderClass)}>
            {/* Rank Badge */}
            <div className="absolute -top-2 -left-2 bg-zinc-900 border border-zinc-800 w-6 h-6 flex items-center justify-center text-[10px] font-mono font-bold text-zinc-500 z-10 shadow-xl">
                #{idx + 1}
            </div>

            {/* Header */}
            <div className="flex justify-between items-start mb-4 border-b border-zinc-900 pb-4">
                <div>
                    <h3 className="font-bold text-zinc-200 text-sm flex items-center gap-2">
                        <User size={14} className="text-zinc-500" />
                        {item.name}
                    </h3>
                    <span className="text-[10px] uppercase text-zinc-600 tracking-wider font-mono">{item.total} VISITAS PROCESSADAS</span>
                </div>
                <div className="text-right">
                    <div className={clsx("text-2xl font-black font-mono", colorClass)}>{item.score}%</div>
                    <div className="text-[9px] text-zinc-600 uppercase">Compliance Score</div>
                </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-6 mb-4">
                {/* TIME METRICS */}
                <div className="space-y-1">
                    <div className="flex items-center gap-2 mb-2">
                        <Clock size={12} className="text-blue-500" />
                        <span className="text-[10px] font-bold text-zinc-400 uppercase">Pontualidade</span>
                    </div>
                    <div className="flex justify-between text-[10px] border-b border-zinc-900/50 py-1">
                        <span className="text-zinc-500">No Prazo</span>
                        <span className="text-emerald-400 font-mono font-bold">{item.timeOk}</span>
                    </div>
                    <div className="flex justify-between text-[10px] border-b border-zinc-900/50 py-1">
                        <span className="text-zinc-500">Divergente</span>
                        <span className="text-red-400 font-mono font-bold">{item.timeError + item.timeWarning}</span>
                    </div>
                </div>

                {/* GEO METRICS */}
                <div className="space-y-1 border-l border-zinc-900 pl-6">
                    <div className="flex items-center gap-2 mb-2">
                        <MapPin size={12} className="text-purple-500" />
                        <span className="text-[10px] font-bold text-zinc-400 uppercase">Geolocalização</span>
                    </div>
                    <div className="flex justify-between text-[10px] border-b border-zinc-900/50 py-1">
                        <span className="text-zinc-500">Ok / Viagem</span>
                        <span className="text-emerald-400 font-mono font-bold">{item.geoOk}</span>
                    </div>
                    <div className="flex justify-between text-[10px] py-1">
                        <span className="text-zinc-500">Divergências</span>
                        <span className="text-red-400 font-mono font-bold">{item.geoError}</span>
                    </div>
                </div>
            </div>

            {/* AI Analysis Section */}
            <div className="mt-2 pt-4 border-t border-zinc-900">
                {!summary && !loading && (
                    <button
                        onClick={handleGenerate}
                        className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-purple-500/50 text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-purple-400 transition-all flex items-center justify-center gap-2 group"
                    >
                        <Sparkles size={14} className="group-hover:animate-pulse" />
                        Gerar Análise Comportamental IA
                    </button>
                )}

                {loading && (
                    <div className="flex items-center justify-center py-4 text-purple-400 gap-3">
                        <Loader2 size={16} className="animate-spin" />
                        <span className="text-[10px] font-mono uppercase tracking-widest">Processando Padrões...</span>
                    </div>
                )}

                {summary && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-500">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Sparkles size={12} className="text-purple-400" />
                                <span className="text-[9px] font-bold uppercase text-purple-400 tracking-widest">Parecer da Auditoria (IA)</span>
                            </div>
                            <button onClick={() => setExpanded(!expanded)} className="text-[8px] text-zinc-600 hover:text-zinc-400 uppercase font-mono">
                                {expanded ? '[ Ocultar ]' : '[ Ver Detalhes ]'}
                            </button>
                        </div>
                        {expanded && (
                            <p className="text-[11px] text-zinc-300 leading-relaxed italic border-l-2 border-purple-500/30 pl-3 py-1">
                                "{summary}"
                            </p>
                        )}
                    </div>
                )}

                {error && (
                    <p className="text-[9px] text-red-400 font-mono mt-2">{error}</p>
                )}
            </div>
        </div>
    );
};

// --- Main ResumoTab Component ---
const ResumoTab = ({ data, pointHistoryData }) => {
    const [exportLoading, setExportLoading] = useState(false);
    const reportRef = useRef(null);

    const ranking = useMemo(() => {
        if (!data || data.length === 0) return [];

        const grouped = data.reduce((acc, row) => {
            if (!row.consultant || row.consultant === 'N/A') return acc;
            if (!acc[row.consultant]) {
                acc[row.consultant] = {
                    name: row.consultant,
                    total: 0, timeOk: 0, timeWarning: 0, timeError: 0, geoOk: 0, geoError: 0
                };
            }
            const c = acc[row.consultant];
            c.total++;

            const delayToUse = row.umovmeDelay !== null ? row.umovmeDelay : row.timeDiff;
            if (delayToUse !== null) {
                const diff = Math.abs(delayToUse);
                if (diff <= 15) c.timeOk++;
                else if (diff <= 30) c.timeWarning++;
                else c.timeError++;
            }

            if (['OK', 'TRAVEL_OK', 'APPROVED'].includes(row.status)) c.geoOk++;
            else if (['DISTANCE_ERROR', 'TRAVEL_ERROR'].includes(row.status)) c.geoError++;

            return acc;
        }, {});

        return Object.values(grouped).map(c => {
            const timeTotal = c.timeOk + c.timeWarning + c.timeError || 1;
            const timeScore = (c.timeOk * 1 + c.timeWarning * 0.6) / timeTotal;
            const geoTotal = c.geoOk + c.geoError || 1;
            const geoScore = c.geoOk / geoTotal;
            const finalScore = Math.round(((timeScore + geoScore) / 2) * 100);
            return { ...c, score: finalScore };
        }).sort((a, b) => b.score - a.score);
    }, [data]);

    const handleExportPDF = async () => {
        if (!reportRef.current) return;
        setExportLoading(true);
        try {
            const canvas = await html2canvas(reportRef.current, {
                backgroundColor: '#09090b',
                scale: 2,
                useCORS: true,
                logging: false,
            });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

            let yPos = 0;
            const pageHeight = pdf.internal.pageSize.getHeight();
            let remainingHeight = pdfHeight;

            while (remainingHeight > 0) {
                if (yPos > 0) pdf.addPage();
                const srcY = yPos * (canvas.height / pdfHeight);
                const srcH = Math.min(pageHeight, remainingHeight) * (canvas.height / pdfHeight);
                const segment = document.createElement('canvas');
                segment.width = canvas.width;
                segment.height = srcH;
                const ctx = segment.getContext('2d');
                ctx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);
                pdf.addImage(segment.toDataURL('image/png'), 'PNG', 0, 0, pdfWidth, Math.min(pageHeight, remainingHeight));
                yPos += pageHeight;
                remainingHeight -= pageHeight;
            }

            const today = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
            pdf.save(`auditoria-samsung-${today}.pdf`);
        } catch (e) {
            console.error('PDF Error:', e);
            alert('Erro ao exportar PDF. Tente novamente.');
        } finally {
            setExportLoading(false);
        }
    };

    if (!data || data.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-zinc-600">
                <Shield size={40} className="mb-3 opacity-30" />
                <p className="text-xs font-mono uppercase tracking-widest">Nenhum dado processado</p>
                <p className="text-[10px] text-zinc-700 mt-1">Faça o cruzamento e geocodifique primeiro</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Top Bar */}
            <div className="flex items-center justify-between p-3 border-b border-zinc-800 bg-zinc-900 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <Shield size={14} className="text-purple-400" />
                    <h2 className="text-[11px] font-bold text-zinc-200 uppercase tracking-widest">Relatório Final Personalizado</h2>
                    <span className="text-[9px] text-zinc-600 font-mono">{data.length} registros analisados</span>
                </div>
                <button
                    onClick={handleExportPDF}
                    disabled={exportLoading}
                    className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-[9px] font-bold uppercase tracking-wider transition-all disabled:opacity-50"
                >
                    {exportLoading ? <Loader2 size={11} className="animate-spin" /> : <FileDown size={11} />}
                    Exportar Relatório PDF
                </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto bg-zinc-950">
                <div ref={reportRef} className="p-8 space-y-8 max-w-7xl mx-auto">

                    {/* Header Section for PDF */}
                    <div className="border-b border-zinc-800 pb-6 flex justify-between items-end">
                        <div className="space-y-1">
                            <h1 className="text-2xl font-black text-white tracking-tighter uppercase">Relatório de Performance</h1>
                            <p className="text-xs text-zinc-500 font-mono uppercase tracking-widest">Consolidação de Auditoria · Samsung Brasil</p>
                        </div>
                        <div className="text-right text-[10px] text-zinc-600 font-mono uppercase">
                            Gerado em {new Date().toLocaleDateString('pt-BR')}
                        </div>
                    </div>

                    {/* KPI Cards (General Metrics) */}
                    <section>
                        <DashboardStats data={data} />
                    </section>

                    {/* Consultant Ranking - 2 Columns grid like Insights */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-2 bg-zinc-900/50 p-2 border border-zinc-800/50">
                            <Shield size={12} className="text-purple-400" />
                            <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Ranking de Conformidade & Análises Individuais</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {ranking.map((item, idx) => (
                                <ConsultantResumoCard
                                    key={item.name}
                                    item={item}
                                    idx={idx}
                                    allRows={data}
                                    pointRows={pointHistoryData || []}
                                />
                            ))}
                        </div>
                    </section>

                    {/* Footer for PDF */}
                    <div className="mt-12 pt-8 border-t border-zinc-900 text-center space-y-2 pb-12">
                        <p className="text-[10px] text-zinc-700 font-mono uppercase tracking-widest">
                            Samsung Auditoria de Campo · Sistema de Conciliação Geográfica v2.5
                        </p>
                        <p className="text-[8px] text-zinc-800 font-mono italic">
                            Este relatório utiliza inteligência artificial generativa para identificar padrões comportamentais baseados em dados de Auditoria (Umovme), Insights e Histórico de Ponto (Solides).
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ResumoTab;
