-- Create the 'consultores' table to store consultant home addresses
CREATE TABLE IF NOT EXISTS public.consultores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nome TEXT NOT NULL,
    endereco TEXT,
    latitude NUMERIC,
    longitude NUMERIC,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS (though for now we might disable for import script)
ALTER TABLE public.consultores ENABLE ROW LEVEL SECURITY;

-- Allow public read (for the app to use it in travel logic)
CREATE POLICY "Allow public read access" ON public.consultores
    FOR SELECT TO anon USING (true);

-- Allow anon insert for the import script (temp)
CREATE POLICY "Allow anon insert access" ON public.consultores
    FOR INSERT TO anon WITH CHECK (true);
    
-- Allow anon update for the import script (temp)
CREATE POLICY "Allow anon update access" ON public.consultores
    FOR UPDATE TO anon USING (true);

-- Allow anon delete for cleanup (temp)
CREATE POLICY "Allow anon delete access" ON public.consultores
    FOR DELETE TO anon USING (true);
