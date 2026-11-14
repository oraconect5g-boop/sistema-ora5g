-- =============================================================================
-- Códigos de outros canais por variação (lote CAT-009: ORA-CAT-009)
--
-- Cada variação do catálogo pode guardar os códigos que tem em outros canais: o código do produto na Rein
-- (para quem vem de lá achar pelo número que já conhece), o do site e o do anúncio num marketplace
-- (DEC-U13: Mercado Livre, Shopee e TikTok Shop). O código de fora só aponta para a variação: o ID
-- interno continua sendo a chave de tudo (venda, estoque, preço). Nada aqui conversa com os canais.
-- Regras:
--   * quem tem catalogo.gerir (dono e administrador) liga e desliga, sempre com motivo; ligar de novo o
--     mesmo código na mesma variação devolve o mesmo vínculo;
--   * um código ativo de um canal aponta para uma só variação (sem diferença de maiúscula e minúscula);
--     a mesma variação pode ter vários códigos no mesmo canal (vários anúncios);
--   * desligar só marca, uma vez, com motivo; nada se apaga, e ligar de novo depois cria outro vínculo
--     (o histórico fica);
--   * catalogo_variante_por_codigo(canal, código): a variação do código ativo, para quem lê o catálogo
--     (base da importação de pedidos dos canais, quando houver).
-- Os canais são uma lista fechada: canal novo é migration.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create table public.variante_codigos_externos (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  variante_id uuid not null,
  canal text not null check (canal in ('rein', 'site', 'mercado_livre', 'shopee', 'tiktok_shop')),
  codigo text not null check (length(codigo) between 1 and 80 and codigo = btrim(codigo) and codigo !~ '[[:cntrl:][:space:]]'),
  sku_no_canal text check (sku_no_canal is null or (length(sku_no_canal) between 1 and 80 and sku_no_canal = btrim(sku_no_canal)
                                                     and sku_no_canal !~ '[[:cntrl:]]')),
  ligado_por uuid not null references public.perfis_usuario (id),
  ligado_em timestamptz not null default now(),
  desligado_em timestamptz,
  desligado_por uuid references public.perfis_usuario (id),
  motivo_desligamento text check (motivo_desligamento is null or length(motivo_desligamento) between 3 and 200),
  foreign key (variante_id, organizacao_id) references public.variantes (id, organizacao_id),
  constraint variante_codigo_desligamento check (
    (desligado_em is null) = (desligado_por is null) and (desligado_em is null) = (motivo_desligamento is null))
);
comment on table public.variante_codigos_externos is
  'Códigos da variação em outros canais (CAT-009): Rein, site e marketplaces. Só apontam para a variação; desligar só marca; nada se apaga.';
create unique index variante_codigos_um_por_canal on public.variante_codigos_externos (organizacao_id, canal, lower(codigo))
  where desligado_em is null;
create index variante_codigos_variante on public.variante_codigos_externos (variante_id, organizacao_id);
create index variante_codigos_ligado_por on public.variante_codigos_externos (ligado_por);
create index variante_codigos_desligado_por on public.variante_codigos_externos (desligado_por) where desligado_por is not null;
create trigger variante_codigos_auditar after insert or update on public.variante_codigos_externos
  for each row execute function privado.auditar_mudanca();

-- Só o desligamento muda, uma vez; o resto é fixo. Nada se apaga.
create or replace function privado.variante_codigo_so_desligamento()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.desligado_em is not null or new.desligado_em is null
     or (to_jsonb(old) - array['desligado_em', 'desligado_por', 'motivo_desligamento'])
        is distinct from (to_jsonb(new) - array['desligado_em', 'desligado_por', 'motivo_desligamento']) then
    raise exception 'O código de outro canal não muda: só o desligamento, uma vez' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger variante_codigos_so_desligamento before update on public.variante_codigos_externos
  for each row execute function privado.variante_codigo_so_desligamento();
create trigger variante_codigos_sem_apagar before delete on public.variante_codigos_externos
  for each row execute function privado.so_insercao();
create trigger variante_codigos_sem_truncate before truncate on public.variante_codigos_externos
  for each statement execute function privado.so_insercao();

-- Lê quem lê o catálogo da rede (como as variações).
alter table public.variante_codigos_externos enable row level security;
revoke all on public.variante_codigos_externos from anon, authenticated;
grant select on public.variante_codigos_externos to authenticated;
create policy variante_codigos_ler on public.variante_codigos_externos for select to authenticated
  using (organizacao_id in (select v.organizacao_id from privado.vinculos_vigentes() v));

-- -----------------------------------------------------------------------------
-- Ligar e desligar (quem gere o catálogo)
-- -----------------------------------------------------------------------------
create or replace function public.catalogo_ligar_codigo(p_variante uuid, p_canal text, p_codigo text, p_sku_no_canal text, p_motivo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_variante public.variantes;
  v_codigo text := btrim(coalesce(p_codigo, ''));
  v_sku text := nullif(regexp_replace(btrim(coalesce(p_sku_no_canal, '')), '\s+', ' ', 'g'), '');
  v_existente public.variante_codigos_externos;
  v_novo uuid;
begin
  select * into v_variante from public.variantes v where v.id = p_variante;
  if not found or not privado.gere_catalogo(v_variante.organizacao_id) then
    raise exception 'Variação não encontrada para você' using errcode = 'P0002';
  end if;
  if p_canal is null or p_canal not in ('rein', 'site', 'mercado_livre', 'shopee', 'tiktok_shop') then
    raise exception 'Canal desconhecido' using errcode = '22023';
  end if;
  if length(v_codigo) not between 1 and 80 or v_codigo ~ '[[:cntrl:][:space:]]' then
    raise exception 'Código do canal inválido: de 1 a 80 letras e números, sem espaço' using errcode = '22023';
  end if;
  if v_sku is not null and (length(v_sku) > 80 or v_sku ~ '[[:cntrl:]]') then
    raise exception 'SKU no canal longo demais (até 80)' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(privado.trava_da_chave('variante_codigos', v_variante.organizacao_id, p_canal || ':' || lower(v_codigo)));
  select * into v_existente from public.variante_codigos_externos c
  where c.organizacao_id = v_variante.organizacao_id and c.canal = p_canal and lower(c.codigo) = lower(v_codigo) and c.desligado_em is null;
  if found then
    if v_existente.variante_id = v_variante.id and v_existente.codigo = v_codigo and v_existente.sku_no_canal is not distinct from v_sku then
      return jsonb_build_object('id', v_existente.id, 'repetido', true);
    end if;
    if v_existente.variante_id = v_variante.id then
      raise exception 'Este código já está ligado a esta variação de outro jeito: desligue e ligue de novo' using errcode = '23505';
    end if;
    raise exception 'Este código do canal já está em outra variação' using errcode = '23505';
  end if;
  perform set_config('ora.motivo', v_motivo, true);
  insert into public.variante_codigos_externos (organizacao_id, variante_id, canal, codigo, sku_no_canal, ligado_por)
  values (v_variante.organizacao_id, v_variante.id, p_canal, v_codigo, v_sku, (select auth.uid()))
  returning id into v_novo;
  return jsonb_build_object('id', v_novo, 'repetido', false);
end;
$$;

create or replace function public.catalogo_desligar_codigo(p_vinculo uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_vinculo public.variante_codigos_externos;
  v_motivo text;
begin
  select * into v_vinculo from public.variante_codigos_externos c where c.id = p_vinculo for update;
  if not found or not privado.gere_catalogo(v_vinculo.organizacao_id) then
    raise exception 'Código não encontrado para você' using errcode = 'P0002';
  end if;
  if v_vinculo.desligado_em is not null then
    return false;
  end if;
  v_motivo := privado.exigir_motivo(p_motivo);
  perform set_config('ora.motivo', v_motivo, true);
  update public.variante_codigos_externos c set desligado_em = now(), desligado_por = (select auth.uid()), motivo_desligamento = v_motivo
  where c.id = v_vinculo.id;
  return true;
end;
$$;

-- A variação do código ativo, para quem lê o catálogo (com as permissões de quem chama: a política de leitura vale).
create or replace function public.catalogo_variante_por_codigo(p_canal text, p_codigo text)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select c.variante_id from public.variante_codigos_externos c
  where c.canal = p_canal and lower(c.codigo) = lower(btrim(coalesce(p_codigo, ''))) and c.desligado_em is null
  order by c.ligado_em, c.id
  limit 1;
$$;

revoke all on function privado.variante_codigo_so_desligamento() from public, anon, authenticated;
revoke all on function public.catalogo_ligar_codigo(uuid, text, text, text, text), public.catalogo_desligar_codigo(uuid, text),
  public.catalogo_variante_por_codigo(text, text) from public, anon;
grant execute on function public.catalogo_ligar_codigo(uuid, text, text, text, text), public.catalogo_desligar_codigo(uuid, text),
  public.catalogo_variante_por_codigo(text, text) to authenticated;
