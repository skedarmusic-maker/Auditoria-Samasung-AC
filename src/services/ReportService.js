import { supabase } from './SupabaseClient';

export const ReportService = {

    // Save a new report (Admin Only)
    // We store the entire processed state + consultant list
    saveReport: async (processedData, consultants) => {
        try {
            const report = {
                created_at: new Date(),
                title: `Relatório Auditado - ${new Date().toLocaleString('pt-BR')}`,
                report_data: {
                    processedData,
                    consultants,
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
    getLatestReport: async () => {
        try {
            const { data, error } = await supabase
                .from('client_reports')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(1);

            if (error) throw error;
            if (data && data.length > 0) {
                return data[0].report_data; // Return the JSON blob directly
            }
            return null;
        } catch (error) {
            console.error("Error fetching report:", error);
            throw error;
        }
    }
};
