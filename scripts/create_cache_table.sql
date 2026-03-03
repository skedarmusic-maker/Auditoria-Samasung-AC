create table if not exists csv_uploads_cache (
  id text primary key,
  filename text,
  parsed_data jsonb,
  updated_at timestamptz default now()
);

-- Enable RLS
alter table csv_uploads_cache enable row level security;

-- Allow read for anon
create policy "Allow public read access"
  on csv_uploads_cache
  for select
  to anon
  using (true);

-- Allow upsert for anon
create policy "Allow anon insert access"
  on csv_uploads_cache
  for insert
  to anon
  with check (true);

create policy "Allow anon update access"
  on csv_uploads_cache
  for update
  to anon
  using (true);
