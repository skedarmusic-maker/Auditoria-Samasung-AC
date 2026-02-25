import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

export const fetchLocations = async () => {
    const { data, error } = await supabase
        .from('locais')
        .select('*');

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

export const fetchConsultants = async () => {
    const { data, error } = await supabase
        .from('consultores')
        .select('*');

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
