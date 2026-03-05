-- Desabilitar RLS temporariamente para rodar o import de locais
ALTER TABLE locais DISABLE ROW LEVEL SECURITY;

-- (Opcional) Se quiser manter RLS ligado mas liberar inserção e deleção publica:
-- create policy "Allow anon insert access" on locais for insert to anon with check (true);
-- create policy "Allow anon delete access" on locais for delete to anon using (true);
