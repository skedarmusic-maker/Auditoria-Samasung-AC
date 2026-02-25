-- RODE ESTE CODIGO NO SQL EDITOR DO SUPABASE PARA CRIAR A TABELA

create table if not exists client_reports (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  title text,
  report_data jsonb
);

-- Habilitar segurança (RLS)
alter table client_reports enable row level security;

-- Permitir LEITURA publica (para o modo cliente)
create policy "Allow public read access"
  on client_reports
  for select
  to anon
  using (true);

-- Permitir ESCRITA (para o modo admin salvar o relatorio)
-- Como estamos usando chave anonima e sem login, permitiremos insert publico por enquanto.
-- Idealmente, num futuro com Auth, restringiríamos isso.
create policy "Allow anon insert access"
  on client_reports
  for insert
  to anon
  with check (true);

-- Tabela de Consultores (Endereços para regra dos 60km)
create table if not exists consultores (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  endereco text,
  latitude numeric,
  longitude numeric,
  created_at timestamptz default now()
);

-- Habilitar RLS
alter table consultores enable row level security;

-- Permitir LEITURA publica (para o app usar na regra de viagem)
create policy "Allow public read access" on consultores for select to anon using (true);
-- Permitir INSERT publico (para o script de importação rodar)
create policy "Allow anon insert access" on consultores for insert to anon with check (true);
-- Permitir DELETE publico (para limpar antes de importar)
create policy "Allow anon delete access" on consultores for delete to anon using (true);
