-- Reversão de 20261111133804_precos_e_campanhas (só em banco sem dados reais).
-- Os preços gravados pelas funções continuam (são dados); saem as funções, os gatilhos e o cancelamento.
drop function if exists public.precos_por_loja(uuid, text);
drop function if exists public.preco_cancelar(uuid, text);
drop function if exists public.preco_campanha(uuid, uuid, text, bigint, timestamptz, timestamptz, text);
drop function if exists public.preco_definir(uuid, uuid, text, bigint, timestamptz, text);
drop function if exists privado.travar_preco(uuid, uuid, uuid, text);
drop function if exists privado.pode_alterar_preco(uuid, uuid);
drop trigger if exists precos_auditar on public.precos;
drop trigger if exists precos_sem_truncate on public.precos;
drop trigger if exists precos_protegidos on public.precos;
drop function if exists privado.precos_protegidos();

-- Preço vigente: campanha > preço da loja > preço geral. Com p_momento no passado, reconstrói
-- o preço que valia naquela hora.
create or replace function public.preco_vigente(
  p_variante uuid, p_unidade uuid, p_canal text default 'loja', p_momento timestamptz default now()
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select p.valor_centavos
  from public.precos p
  join public.unidades u on u.id = p_unidade and u.organizacao_id = p.organizacao_id
  where p.variante_id = p_variante
    and p.canal = p_canal
    and (p.unidade_id is null or p.unidade_id = p_unidade)
    and p.inicio <= p_momento and (p.fim is null or p.fim > p_momento)
    and p_unidade in (select privado.unidades_visiveis())
  order by (p.origem = 'campanha') desc, (p.unidade_id is null), p.inicio desc
  limit 1;
$$;

drop index if exists public.precos_um_aberto;
create unique index precos_um_aberto
  on public.precos (variante_id, coalesce(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid), canal)
  where fim is null;
drop index if exists public.precos_cancelado_por;
alter table public.precos
  drop constraint if exists preco_cancelado_completo,
  drop column if exists motivo_cancelamento,
  drop column if exists cancelado_por,
  drop column if exists cancelado_em;
