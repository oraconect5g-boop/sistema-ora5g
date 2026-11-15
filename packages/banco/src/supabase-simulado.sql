-- Simula, para os testes, o que o Supabase já traz pronto: papéis da API,
-- esquema auth com auth.uid()/auth.jwt() e os privilégios padrão do esquema
-- public (que a migration precisa revogar). NÃO é aplicado no Supabase real.
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text, banned_until timestamptz);
-- Sessões do Auth: o login cria a linha; sair ou revogar apaga. Só as colunas que o banco lê.
create table auth.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  not_after timestamptz
);
-- Fatores do segundo fator (MFA) do Auth (ORG-007a): só as colunas que o banco lê, com os tipos do Supabase. No
-- Supabase real a API do Auth grava aqui (cadastrar, conferir, tirar); o banco do sistema só lê.
create type auth.factor_type as enum ('totp', 'webauthn', 'phone', 'recovery_code');
create type auth.factor_status as enum ('unverified', 'verified');
create table auth.mfa_factors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  friendly_name text,
  factor_type auth.factor_type not null,
  status auth.factor_status not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function auth.jwt() returns jsonb
language sql stable
as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;

create function auth.uid() returns uuid
language sql stable
as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- Storage (só o que as migrations usam): buckets, objetos com RLS e storage.foldername().
-- No Supabase real o envio do arquivo passa pela API do Storage, que grava em storage.objects
-- como o usuário logado; a política de RLS decide quem pode.
create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (
  id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz not null default now()
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text not null,
  owner uuid, metadata jsonb, created_at timestamptz not null default now(), unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
create function storage.foldername(name text) returns text[] language sql immutable
as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
