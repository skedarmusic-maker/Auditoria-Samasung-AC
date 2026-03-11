import { createClient } from '@supabase/supabase-js';
import chunk from 'lodash.chunk';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

export const fetchLocations = async (conta = null) => {
    let query = supabase.from('locais').select('*');
    
    if (conta) {
        query = query.eq('conta', conta);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching locations:', error);
        return [];
    }

    // Ensure numeric coordinates
    return data.map(loc => ({
        ...loc,
        latitude: loc.latitude ? parseFloat(loc.latitude) : null,
        longitude: loc.longitude ? parseFloat(loc.longitude) : null
    }));
};

export const fetchConsultants = async (conta = null) => {
    let query = supabase.from('consultores').select('*');

    if (conta) {
        query = query.eq('conta', conta);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching consultants:', error);
        return [];
    }

    return data.map(c => ({
        ...c,
        latitude: c.latitude ? parseFloat(c.latitude) : null,
        longitude: c.longitude ? parseFloat(c.longitude) : null
    }));
};

// --- Caching Logic for CSV Uploads ---
export const saveUploadCache = async (id, filename, parsed_data) => {
    try {
        // UPSERT the cache record so we maintain a single row per ID
        const { error } = await supabase
            .from('csv_uploads_cache')
            .upsert({
                id,
                filename,
                parsed_data,
                updated_at: new Date().toISOString()
            }, { onConflict: 'id' });

        if (error) {
            console.error(`Error saving upload cache for ${id}:`, error);
            throw error;
        }
        console.log(`[SupabaseClient] Saved cache for ${id}`);
        return true;
    } catch (e) {
        console.error(`Failed to save cache for ${id}`, e);
        return false;
    }
};

export const getUploadCache = async (id) => {
    try {
        const { data, error } = await supabase
            .from('csv_uploads_cache')
            .select('*')
            .eq('id', id)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 is No Rows Found
            console.error(`Error getting upload cache for ${id}:`, error);
            return null;
        }

        return data || null;
    } catch (e) {
        console.error(`Failed to get cache for ${id}`, e);
        return null;
    }
};
