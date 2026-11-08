-- =============================================================================
-- ORA-CAT-011 (#26) — Fotos obrigatórias dos produtos
-- Decisão do proprietário de 08/11/2026; contrato em docs/alinhamento/FOTOS_DOS_PRODUTOS_2026-11-08.md.
--
--   * Arquivos no Storage, bucket PRIVADO "produtos" (JPEG, PNG ou WebP, até 5 MB); leitura só
--     por URL assinada criada no servidor para quem é da organização.
--   * Caminho = identidade estável da foto: <organização>/<produto>/<variante ou "produto">/<id>.<ext>.
--     A URL assinada vence; o caminho não.
--   * Enviar foto exige catalogo.fotos (dono e gerente); o vendedor só vê. Conferido no Storage
--     (política de RLS) e de novo no banco ao registrar.
--   * Trocar a foto não apaga a anterior: ela fica marcada como substituída (histórico e volta).
--   * Produto físico exige foto real; recarga, ativação, portabilidade e serviço aceitam
--     ilustração, marcada como tal. Placeholder não conta: sem registro, é pendência.
--   * Variante com cor própria (produto com 2 ou mais cores) precisa da própria foto.
-- Reversão: supabase/reversao/<mesmo nome>.sql (só em banco sem dados reais).
-- =============================================================================

do $$
begin
  perform set_config('ora.motivo', 'Fotos dos produtos (ORA-CAT-011): enviar foto é de quem gere o catálogo', true);
  insert into public.permissoes (codigo, descricao, modulo)
  values ('catalogo.fotos', 'Enviar e trocar fotos dos produtos', 'catalogo');
  insert into public.papel_permissoes (papel, permissao)
  values ('dono', 'catalogo.fotos'), ('gerente', 'catalogo.fotos');
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('produtos', 'produtos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Organizações cujo catálogo a pessoa vê (qualquer vínculo vigente) e onde pode enviar foto.
create or replace function privado.organizacoes_do_catalogo()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct v.organizacao_id from privado.vinculos_vigentes() v;
$$;

create or replace function privado.organizacoes_que_enviam_fotos()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct u.organizacao_id from public.unidades u
  where u.id in (select privado.unidades_com_permissao('catalogo.fotos'));
$$;

create policy produtos_fotos_ler on storage.objects for select to authenticated
  using (bucket_id = 'produtos'
         and (storage.foldername(name))[1] in (select o::text from privado.organizacoes_do_catalogo() as o));
create policy produtos_fotos_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'produtos'
              and array_length(storage.foldername(name), 1) = 3
              and (storage.foldername(name))[1] in (select o::text from privado.organizacoes_que_enviam_fotos() as o));

create table public.fotos_produto (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  produto_id uuid not null,
  variante_id uuid,
  caminho text not null unique,
  largura int not null check (largura between 200 and 8000),
  altura int not null check (altura between 200 and 8000),
  bytes int not null check (bytes between 1 and 5242880),
  tipo text not null check (tipo in ('image/jpeg', 'image/png', 'image/webp')),
  ilustracao boolean not null default false,
  substituida_em timestamptz,
  criado_por uuid references public.perfis_usuario (id),
  criado_em timestamptz not null default now(),
  foreign key (produto_id, organizacao_id) references public.produtos (id, organizacao_id),
  foreign key (variante_id, organizacao_id) references public.variantes (id, organizacao_id)
);
-- Uma foto em uso por produto (variante vazia) e por variante.
create unique index fotos_uma_em_uso on public.fotos_produto
  (produto_id, coalesce(variante_id, '00000000-0000-0000-0000-000000000000'::uuid)) where substituida_em is null;
create index fotos_organizacao on public.fotos_produto (organizacao_id, produto_id);
create index fotos_variante on public.fotos_produto (variante_id, organizacao_id);
create index fotos_criado_por on public.fotos_produto (criado_por);

create trigger fotos_produto_auditar after insert or update on public.fotos_produto
  for each row execute function privado.auditar_mudanca();

alter table public.fotos_produto enable row level security;
revoke all on public.fotos_produto from anon, authenticated;
grant select on public.fotos_produto to authenticated;
create policy fotos_ler on public.fotos_produto for select to authenticated
  using (organizacao_id in (select privado.organizacoes_do_catalogo()));

-- O arquivo já está no Storage (enviado pelo celular); aqui ele vira a foto em uso do produto ou
-- da variante. Tamanho e tipo vêm do Storage, não de quem chama. A foto anterior fica no histórico.
create or replace function public.registrar_foto(
  p_produto uuid, p_variante uuid, p_caminho text, p_largura int, p_altura int, p_ilustracao boolean default false
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ator uuid := (select auth.uid());
  produto public.produtos;
  partes text[];
  meta jsonb;
  nova uuid;
begin
  select * into produto from public.produtos p where p.id = p_produto;
  if not found or ator is null or produto.organizacao_id not in (select privado.organizacoes_que_enviam_fotos()) then
    raise exception 'Sem permissão para enviar foto deste produto' using errcode = '42501';
  end if;
  if p_variante is not null and not exists (
       select 1 from public.variantes v where v.id = p_variante and v.produto_id = p_produto) then
    raise exception 'A variante não é deste produto' using errcode = '22023';
  end if;
  partes := string_to_array(coalesce(p_caminho, ''), '/');
  if p_caminho !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/(produto|[0-9a-f-]{36})/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
     or partes[1] <> produto.organizacao_id::text or partes[2] <> p_produto::text
     or partes[3] <> coalesce(p_variante::text, 'produto') then
    raise exception 'Caminho da foto fora do padrão deste produto' using errcode = '22023';
  end if;
  select o.metadata into meta from storage.objects o where o.bucket_id = 'produtos' and o.name = p_caminho;
  if meta is null then
    raise exception 'O arquivo não chegou ao Storage' using errcode = 'P0002';
  end if;
  if coalesce(p_ilustracao, false) and produto.tipo in ('aparelho', 'acessorio', 'chip') then
    raise exception 'Produto físico precisa de foto real, não de ilustração' using errcode = '22023';
  end if;
  perform set_config('ora.motivo', 'Foto do produto enviada', true);
  update public.fotos_produto f set substituida_em = now()
  where f.produto_id = p_produto and f.variante_id is not distinct from p_variante and f.substituida_em is null;
  insert into public.fotos_produto (organizacao_id, produto_id, variante_id, caminho, largura, altura, bytes, tipo, ilustracao, criado_por)
  values (produto.organizacao_id, p_produto, p_variante, p_caminho, p_largura, p_altura,
          (meta ->> 'size')::int, meta ->> 'mimetype', coalesce(p_ilustracao, false), ator)
  returning id into nova;
  return nova;
end;
$$;

-- O que falta foto: produto ativo sem foto em uso; e, em produto com 2 ou mais cores, cada
-- variante ativa com cor e sem foto própria. Ilustração conta só para itens não físicos.
create or replace function public.pendencias_de_foto()
returns table (produto_id uuid, variante_id uuid, sku text, nome text, motivo text)
language sql
stable
security definer
set search_path = ''
as $$
  with visiveis as (
    select p.* from public.produtos p
    where p.ativo and p.organizacao_id in (select privado.organizacoes_do_catalogo())
  ), cores as (
    select v.produto_id, count(distinct lower(v.cor)) as quantas
    from public.variantes v where v.ativa and v.cor is not null group by v.produto_id
  )
  select p.id, null::uuid, (select min(v.sku) from public.variantes v where v.produto_id = p.id), p.nome, 'produto sem foto'
  from visiveis p
  where not exists (select 1 from public.fotos_produto f where f.produto_id = p.id and f.variante_id is null and f.substituida_em is null)
  union all
  select p.id, v.id, v.sku, v.nome, 'cor sem foto própria'
  from visiveis p
  join cores c on c.produto_id = p.id and c.quantas >= 2
  join public.variantes v on v.produto_id = p.id and v.ativa and v.cor is not null
  where not exists (select 1 from public.fotos_produto f where f.variante_id = v.id and f.substituida_em is null)
  order by 4, 3;
$$;

revoke all on function privado.organizacoes_do_catalogo(), privado.organizacoes_que_enviam_fotos() from public, anon;
grant execute on function privado.organizacoes_do_catalogo(), privado.organizacoes_que_enviam_fotos() to authenticated;
revoke all on function public.registrar_foto(uuid, uuid, text, int, int, boolean), public.pendencias_de_foto() from public, anon;
grant execute on function public.registrar_foto(uuid, uuid, text, int, int, boolean), public.pendencias_de_foto() to authenticated;
