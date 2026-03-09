-- Adicionar colunas novas na tabela locais
-- Execute este SQL no Supabase SQL Editor

ALTER TABLE locais ADD COLUMN IF NOT EXISTS cliente TEXT;
ALTER TABLE locais ADD COLUMN IF NOT EXISTS nome_pdv_antigo TEXT;
ALTER TABLE locais ADD COLUMN IF NOT EXISTS responsavel TEXT;
ALTER TABLE locais ADD COLUMN IF NOT EXISTS cep TEXT;
ALTER TABLE locais ADD COLUMN IF NOT EXISTS cidade TEXT;
ALTER TABLE locais ADD COLUMN IF NOT EXISTS uf TEXT;

-- Confirmar as colunas existentes após a migração
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'locais'
ORDER BY ordinal_position;
