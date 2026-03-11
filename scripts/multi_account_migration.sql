-- Migration: Adicionar suporte multi-conta (Samsung/Huawei)

-- 1. Adicionar coluna 'conta' na tabela 'locais'
ALTER TABLE locais ADD COLUMN IF NOT EXISTS conta TEXT DEFAULT 'SAMSUNG';

-- 2. Adicionar coluna 'conta' na tabela 'consultores' (para endereços base)
ALTER TABLE consultores ADD COLUMN IF NOT EXISTS conta TEXT DEFAULT 'SAMSUNG';

-- 3. Adicionar coluna 'conta' na tabela 'client_reports'
ALTER TABLE client_reports ADD COLUMN IF NOT EXISTS conta TEXT DEFAULT 'SAMSUNG';

-- 4. Criar um índice para melhorar as buscas por conta
CREATE INDEX IF NOT EXISTS idx_locais_conta ON locais(conta);
CREATE INDEX IF NOT EXISTS idx_consultores_conta ON consultores(conta);
CREATE INDEX IF NOT EXISTS idx_client_reports_conta ON client_reports(conta);

-- NOTA: Após rodar este script, você poderá atualizar as novas lojas da Huawei 
-- definindo o valor 'HUAWEI' na coluna conta.
