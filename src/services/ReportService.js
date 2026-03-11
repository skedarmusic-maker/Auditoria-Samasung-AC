import { supabase } from './SupabaseClient';

export const ReportService = {

    // Save a new report (Admin Only)
    saveReport: async (processedData, consultants, pointHistoryData = [], conta = 'SAMSUNG') => {
        try {
            const report = {
                created_at: new Date(),
                conta: conta, // NEW FIELD
                title: `Relatório Auditado (${conta}) - ${new Date().toLocaleString('pt-BR')}`,
                report_data: {
                    processedData,
                    consultants,
                    pointHistoryData,
                    generatedAt: new Date().toISOString()
                }
            };

            const { data, error } = await supabase
                .from('client_reports')
                .insert([report])
                .select();

            if (error) throw error;
            return data[0];
        } catch (error) {
            console.error("Error saving report:", error);
            throw error;
        }
    },

    // Get the MOST RECENT report (Client Mode)
    getLatestReport: async (conta = null) => {
        try {
            let query = supabase
                .from('client_reports')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (conta) {
                query = query.eq('conta', conta);
            }

            const { data, error } = await query.limit(1);

            if (error) throw error;
            if (data && data.length > 0) {
                return {
                    ...data[0].report_data,
                    conta: data[0].conta
                };
            }
            return null;
        } catch (error) {
            console.error("Error fetching report:", error);
            throw error;
        }
    }
};
