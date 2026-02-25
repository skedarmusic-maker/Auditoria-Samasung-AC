/**
 * GeminiService - Behavioral pattern analysis for consultant audits.
 * Uses Gemini 2.5 Flash via REST API.
 */

const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`;

/**
 * Pre-processes raw audit rows to extract rich behavioral patterns.
 * This is done in JS before sending to the AI to reduce token cost and
 * ensure the AI has concrete facts, not just numbers.
 */
function extractBehavioralPatterns(name, rows, pointRows, metrics) {
    const firstName = name.split(' ')[0];
    const totalVisits = rows.length;
    if (totalVisits === 0) return null;

    // ── 1. PONTUALIDADE ───────────────────────────────────────────────────
    const delayedRows = rows.filter(r => {
        const d = r.umovmeDelay !== null ? r.umovmeDelay : r.timeDiff;
        return d !== null && d > 15;
    });
    const onTimeRows = rows.filter(r => {
        const d = r.umovmeDelay !== null ? r.umovmeDelay : r.timeDiff;
        return d !== null && Math.abs(d) <= 15;
    });
    const latePercent = Math.round((delayedRows.length / totalVisits) * 100);
    const delays = rows
        .map(r => r.umovmeDelay !== null ? r.umovmeDelay : r.timeDiff)
        .filter(d => d !== null && d > 0);
    const avgDelay = delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : 0;
    const maxDelay = delays.length ? Math.max(...delays) : 0;
    const alwaysLate = latePercent >= 50; // behavioral flag

    // ── 2. DESVIOS GEOGRÁFICOS (Solides vs Loja) ─────────────────────────
    const geoErrors = rows.filter(r => ['DISTANCE_ERROR', 'TRAVEL_ERROR', 'GEOLOC_ERROR'].includes(r.status));
    const geoOk = rows.filter(r => ['OK', 'TRAVEL_OK', 'APPROVED'].includes(r.status));
    const geoErrorCount = geoErrors.length;
    const geoErrorPercent = Math.round((geoErrorCount / totalVisits) * 100);
    const distances = rows.filter(r => r.distance != null).map(r => r.distance);
    const avgDist = distances.length ? Math.round(distances.reduce((a, b) => a + b, 0) / distances.length) : 0;
    const maxDist = distances.length ? Math.max(...distances) : 0;

    // ── 3. VIAGENS ────────────────────────────────────────────────────────
    const travelErrorRows = rows.filter(r => r.status === 'TRAVEL_ERROR');

    // ── 4. CONSTRUIR O RELATÓRIO DE FATOS (Para a IA) ─────────────────────
    const facts = [];
    facts.push(`Total de visitas processadas: ${totalVisits}.`);
    facts.push(`Pontualidade: ${onTimeRows.length} visitas no prazo, ${delayedRows.length} atrasos.`);

    if (delayedRows.length > 0) {
        facts.push(`O atraso médio foi de ${avgDelay} minutos, com um pico de ${maxDelay} minutos.`);
        if (alwaysLate) facts.push(`⚠️ ATENÇÃO: O consultor apresenta um padrão de atraso em ${latePercent}% das visitas.`);
    }

    if (geoErrorCount > 0) {
        facts.push(`❗ CRÍTICO: Identificamos ${geoErrorCount} divergências geográficas (${geoErrorPercent}% do total).`);
        facts.push(`Média de desvio das marcações: ${(avgDist / 1000).toFixed(1)}km do local correto.`);
    }

    if (travelErrorRows.length > 0) {
        facts.push(`❌ ERRO DE VIAGEM: Foram detectados ${travelErrorRows.length} registros de viagem sem a devida marcação de saída da base (casa).`);
    }

    return {
        firstName,
        facts,
        score: metrics?.score || 0,
        geoErrorCount
    };
}

/**
 * Builds a behavioral prompt from extracted patterns.
 */
function buildPrompt(name, metrics, rows, pointRows) {
    const p = extractBehavioralPatterns(name, rows, pointRows, metrics);
    if (!p) return `Não há dados suficientes para analisar ${name}.`;

    const factsText = p.facts.join('\n- ');

    const prompt = `
Você é um Auditor Técnico de Operações de Campo da Samsung Brasil.
Escreva um parecer analítico sobre a performance de ${name.toUpperCase()}.

DADOS BRUTOS DA AUDITORIA:
- ${factsText}
Score de Conformidade: ${p.score}/100

INSTRUÇÕES DE ESCRITA:
1. Comece sendo direto: "${p.firstName} apresenta um desempenho [positivo/irregular/crítico]..."
2. Use os dados de porcentagem e números para sustentar sua análise.
3. Se houver divergências geográficas (erros de GPS), priorize essa informação, pois ela afeta a credibilidade da visita.
4. Escreva um parágrafo único, coeso, com linguagem profissional e sem rodeios.
5. O texto DEVE Ter entre 4 e 7 linhas. NÃO corte o texto antes de concluir.

Parecer Técnico Final:
`.trim();

    return prompt;
}

/**
 * Generates an AI behavioral summary for a consultant.
 */
export async function generateConsultantSummary(name, metrics, rows, pointRows = []) {
    const prompt = buildPrompt(name, metrics, rows, pointRows);

    const body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2048,
        },
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
    };

    const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `API Error ${res.status}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    const finishReason = data?.candidates?.[0]?.finishReason;

    if (!text && finishReason !== 'STOP') {
        return `⚠️ Análise bloqueada pelo modelo da IA. (Motivo: ${finishReason})`;
    }

    if (finishReason && finishReason !== 'STOP') {
        // Appends the reason if the AI cut it off for safety or tokens
        return text + ` \n\n[⚠️ Corte da IA. Motivo: ${finishReason}]`;
    }

    return text || 'Não foi possível gerar o resumo.';
}
