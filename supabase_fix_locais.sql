-- PROJETO: AUDITORIA SAMSUNG / APPS ANTIGRAVITY
-- OBJETIVO: Garantir estrutura da tabela locais e permitir upload via script (chave anonima)

-- 1. Garantir que a tabela existe com a estrutura correta (Latitude/Longitude como TEXT para aceitar validação posterior)
create table if not exists locais (
  codigo_pdv text primary key,
  nome_pdv text,
  endereco text,
  cidade text,
  uf text,
  latitude text,
  longitude text
);

-- 2. Habilitar RLS (Segurança)
alter table locais enable row level security;

-- 3. Limpar políticas antigas para evitar conflitos ou duplicações
drop policy if exists "Allow public insert to locais" on locais;
drop policy if exists "Allow public read access to locais" on locais;
drop policy if exists "Enable read access for all users" on locais;
drop policy if exists "Enable insert for all users" on locais;
drop policy if exists "Allow public update to locais" on locais;

-- 4. Criar política de LEITURA pública (Necessário para o App funcionar)
create policy "Allow public read access to locais"
  on locais
  for select
  to anon
  using (true);

-- 5. Criar política de ESCRITA pública (Necessário para o script de importação funcionar)
-- ATENÇÃO: Em produção, isso deve ser removido ou restrito após a importação.
create policy "Allow public insert to locais"
  on locais
  for insert
  to anon
  with check (true);

-- 6. Permitir UPDATE (Caso precisemos corrigir dados via script depois)
create policy "Allow public update to locais"
  on locais
  for update
  to anon
  using (true);
