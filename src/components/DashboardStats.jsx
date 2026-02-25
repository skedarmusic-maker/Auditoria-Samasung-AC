import React from 'react';
import { Activity, CheckCircle, AlertTriangle, MapPin, Clock } from 'lucide-react';
import { clsx } from 'clsx';

/**
 * DashboardStats Component
 * Renders statistical summary cards for the audit data.
 * 
 * @param {Object[]} data - Array of processed audit records
 * @param {number} limitDistance - Distance tolerance in meters (default: 500)
 * @param {number} limitTime - Time tolerance in minutes (default: 15)
 */
const DashboardStats = ({ data, limitDistance = 500, limitTime = 15 }) => {
    // Calculate metrics
    const total = data.length;

    const validTime = data.filter(r => {
        const delayToUse = r.umovmeDelay !== null ? r.umovmeDelay : r.timeDiff;
        if (delayToUse === null) return false;
        return Math.abs(delayToUse) <= limitTime;
    }).length;

    const distError = data.filter(r => {
        if (r.distance === null) return false;
        return r.distance > limitDistance;
    }).length;

    // Calculate percentages for bars
    const validTimePercent = total > 0 ? (validTime / total) * 100 : 0;
    const distErrorPercent = total > 0 ? (distError / total) * 100 : 0;

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
            {/* TOTAL REGISTRO */}
            <div className="bg-zinc-900 border border-zinc-800 p-4 relative group hover:border-zinc-700 transition-all">
                <div className="flex justify-between items-start mb-2">
                    <div>
                        <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">TOTAL REGISTROS</p>
                        <div className="text-3xl font-bold text-white font-mono tracking-tighter">{total}</div>
                    </div>
                    <Activity className="text-zinc-700 group-hover:text-zinc-500 transition-colors" size={20} />
                </div>
                <div className="w-full h-1 bg-zinc-800 mt-2">
                    <div className="h-full bg-zinc-600" style={{ width: '100%' }}></div>
                </div>
                <div className="mt-2 text-[10px] text-zinc-600 font-mono">
                    AUDITORIA EM CURSO
                </div>
            </div>

            {/* VALIDOS HORARIO */}
            <div className="bg-zinc-900 border border-zinc-800 p-4 relative group hover:border-emerald-900/50 transition-all">
                <div className="flex justify-between items-start mb-2">
                    <div>
                        <p className="text-[10px] font-mono text-emerald-600/70 uppercase tracking-widest mb-1 flex items-center gap-1">
                            <Clock size={10} /> VALIDOS HORÁRIO
                        </p>
                        <div className="text-3xl font-bold text-emerald-400 font-mono tracking-tighter">{validTime}</div>
                    </div>
                    <CheckCircle className="text-emerald-900/40 group-hover:text-emerald-500/40 transition-colors" size={20} />
                </div>
                <div className="w-full h-1 bg-zinc-800 mt-2">
                    <div className="h-full bg-emerald-500/50" style={{ width: `${validTimePercent}%` }}></div>
                </div>
                <div className="mt-2 text-[10px] text-emerald-700/60 font-mono">
                    TOLERÂNCIA: ±{limitTime} MIN
                </div>
            </div>

            {/* ERRO DISTANCIA */}
            <div className="bg-zinc-900 border border-zinc-800 p-4 relative group hover:border-red-900/50 transition-all">
                <div className="flex justify-between items-start mb-2">
                    <div>
                        <p className="text-[10px] font-mono text-red-600/70 uppercase tracking-widest mb-1 flex items-center gap-1">
                            <MapPin size={10} /> ERRO DISTÂNCIA
                        </p>
                        <div className="text-3xl font-bold text-red-500 font-mono tracking-tighter">{distError}</div>
                    </div>
                    <AlertTriangle className="text-red-900/40 group-hover:text-red-500/40 transition-colors" size={20} />
                </div>
                <div className="w-full h-1 bg-zinc-800 mt-2">
                    <div className="h-full bg-red-500/50" style={{ width: `${distErrorPercent}%` }}></div>
                </div>
                <div className="mt-2 text-[10px] text-red-700/60 font-mono">
                    DIVERGÊNCIA &gt; {limitDistance}m
                </div>
            </div>
        </div>
    );
};

export default DashboardStats;
