import React, { useRef } from 'react';
import { Upload, FileText, X, Check } from 'lucide-react';
import { clsx } from 'clsx';

export function FileUploader({ label, onFileSelect, file, color = "blue" }) {
    const fileInputRef = useRef(null);

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            validateAndSet(e.dataTransfer.files[0]);
        }
    };

    const handleChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            validateAndSet(e.target.files[0]);
        }
    };

    const validateAndSet = (file) => {
        if (file.type !== "text/csv" && !file.name.endsWith(".csv")) {
            alert("Apenas arquivos .csv são permitidos");
            return;
        }
        onFileSelect(file);
    };

    const clearFile = (e) => {
        e.stopPropagation();
        onFileSelect(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const borderColor = color === 'blue' ? 'border-blue-500/50 hover:border-blue-500' : 'border-emerald-500/50 hover:border-emerald-500';
    const textColor = color === 'blue' ? 'text-blue-400' : 'text-emerald-400';
    const bgHover = color === 'blue' ? 'hover:bg-blue-500/5' : 'hover:bg-emerald-500/5';

    return (
        <div className="w-full font-mono text-sm">
            <div className="flex justify-between items-end mb-2">
                <label className={clsx("uppercase text-xs tracking-widest font-bold", textColor)}>
                    {label}
                </label>
                {file && <span className="text-xs text-zinc-500">READY</span>}
            </div>

            <div
                className={clsx(
                    "relative group cursor-pointer transition-all duration-300",
                    "border border-dashed h-32 flex flex-col items-center justify-center",
                    "bg-zinc-900/50 backdrop-blur-sm",
                    borderColor,
                    bgHover
                )}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
            >
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleChange}
                    accept=".csv"
                    className="hidden"
                />

                {file ? (
                    <div className="flex flex-col items-center gap-2 animate-in fade-in zoom-in duration-300">
                        <div className={clsx("p-2 rounded-full bg-zinc-800", textColor)}>
                            <Check size={20} />
                        </div>
                        <span className="font-semibold text-zinc-200">{file.name}</span>
                        <button
                            onClick={clearFile}
                            className="absolute top-2 right-2 p-1 hover:bg-red-500/20 text-zinc-500 hover:text-red-500 transition-colors"
                        >
                            <X size={16} />
                        </button>
                        <span className="text-xs text-zinc-500">{(file.size / 1024).toFixed(1)} KB</span>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-3 text-zinc-500 group-hover:text-zinc-300 transition-colors">
                        <Upload size={24} className="opacity-50 group-hover:opacity-100 transition-opacity" />
                        <span className="text-xs tracking-wide uppercase">Arrastar CSV ou Clicar</span>
                    </div>
                )}

                {/* Corner Accents */}
                <div className={clsx("absolute top-0 left-0 w-2 h-2 border-t border-l", borderColor)}></div>
                <div className={clsx("absolute top-0 right-0 w-2 h-2 border-t border-r", borderColor)}></div>
                <div className={clsx("absolute bottom-0 left-0 w-2 h-2 border-b border-l", borderColor)}></div>
                <div className={clsx("absolute bottom-0 right-0 w-2 h-2 border-b border-r", borderColor)}></div>
            </div>
        </div>
    );
}
