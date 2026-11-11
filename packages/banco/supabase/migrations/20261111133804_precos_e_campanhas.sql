-- =============================================================================
-- Preços pela tela: mudança agendada e campanha com vigência (lote L3b: ORA-CAT-004, ORA-CAT-007)
--
-- O preço já tinha histórico (ADR-003): preço novo fecha o anterior, campanha tem início e fim e a
-- venda guarda o preço do momento. Agora quem tem preco.alterar (hoje só o dono) muda pela tela:
--   * preço da rede ou de uma loja, por canal (loja, online), valendo agora ou numa data futura;
--     no máximo uma mudança agendada por variação + loja + canal;
--   * campanha com início e fim, sem sobrepor outra campanha do mesmo alcance (OR021);
--   * cancelar o que ainda não começou (o preço anterior volta a valer) ou encerrar a campanha em
--     curso agora. O que já valeu não muda: o passado só se lê (gatilho precos_protegidos).
-- preco_vigente passa a ignorar o cancelado (que nunca valeu). Tudo com motivo e auditoria.
-- Códigos: OR021 campanha sobreposta; OR022 mudança de preço já agendada.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

alter table public.precos
  add column cancelado_em timestamptz,
  add column cancelado_por uuid references public.perfis_usuario (id),
  add column motivo_cancelamento text check (motivo_cancelamento is null or length(trim(motivo_cancelamento)) >= 3),
  add constraint preco_cancelado_completo check ((cancelado_em is null) = (cancelado_por is null) and (cancelado_em is null) = (motivo_cancelamento is null));
create index precos_cancelado_por on public.precos (cancelado_por);

-- Um preço aberto por variação + loja + canal, sem contar o cancelado.
drop index public.precos_um_aberto;
create unique index precos_um_aberto
  on public.precos (variante_id, coalesce(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid), canal)
  where fim is null and cancelado_em is null;

-- O passado não muda: preço não se apaga; só o fim (enquanto está no futuro) e o cancelamento (de
-- quem ainda não começou) podem mudar.
create or replace function privado.precos_protegidos()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Preço não se apaga: o histórico é guardado' using errcode = '42501';
  end if;
  if (new.id, new.organizacao_id, new.variante_id, new.unidade_id, new.canal, new.valor_centavos, new.inicio, new.origem, new.criado_por, new.motivo, new.criado_em)
     is distinct from
     (old.id, old.organizacao_id, old.variante_id, old.unidade_id, old.canal, old.valor_centavos, old.inicio, old.origem, old.criado_por, old.motivo, old.criado_em) then
    raise exception 'Preço gravado não muda: registre um preço novo' using errcode = '42501';
  end if;
  if new.fim is distinct from old.fim
     and ((old.fim is not null and old.fim <= now()) or (new.fim is not null and new.fim < now())) then
    raise exception 'O fim de um preço que já valeu não muda' using errcode = '42501';
  end if;
  if (new.cancelado_em, new.cancelado_por, new.motivo_cancelamento) is distinct from (old.cancelado_em, old.cancelado_por, old.motivo_cancelamento)
     and (old.cancelado_em is not null or old.inicio < now()) then
    raise exception 'Só se cancela preço que ainda não começou' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger precos_protegidos before update or delete on public.precos
  for each row execute function privado.precos_protegidos();
create trigger precos_sem_truncate before truncate on public.precos
  for each statement execute function privado.so_insercao();
create trigger precos_auditar after insert or update on public.precos
  for each row execute function privado.auditar_mudanca();

-- Preço vigente: campanha > preço da loja > preço geral, sem o cancelado (que nunca valeu). Com
-- p_momento no passado, reconstrói o preço que valia naquela hora.
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
    and p.cancelado_em is null
    and p_unidade in (select privado.unidades_visiveis())
  order by (p.origem = 'campanha') desc, (p.unidade_id is null), p.inicio desc
  limit 1;
$$;

-- Quem altera preço desta variação: preco.alterar na rede (preço geral) ou na loja (exceção).
create or replace function privado.pode_alterar_preco(p_organizacao uuid, p_unidade uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_unidade is null then p_organizacao in (select privado.organizacoes_com_permissao('preco.alterar'))
    else exists (select 1 from public.unidades u where u.id = p_unidade and u.organizacao_id = p_organizacao and u.status = 'ativa'
                   and u.tipo in ('loja_fisica', 'online'))
         and p_unidade in (select privado.unidades_com_permissao('preco.alterar'))
  end;
$$;

-- Mesma trava para tudo que mexe no preço de uma variação + loja + canal.
create or replace function privado.travar_preco(p_organizacao uuid, p_variante uuid, p_unidade uuid, p_canal text)
returns void
language sql
volatile
set search_path = ''
as $$
  select pg_advisory_xact_lock(privado.trava_da_chave('precos', p_organizacao,
    p_variante::text || ':' || coalesce(p_unidade::text, 'rede') || ':' || p_canal));
$$;

-- Preço novo (geral da rede ou de uma loja), valendo agora ou numa data futura.
create or replace function public.preco_definir(
  p_variante uuid, p_unidade uuid, p_canal text, p_valor bigint, p_inicio timestamptz, p_motivo text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_organizacao uuid;
  v_inicio timestamptz;
  v_aberto public.precos;
  v_tem_aberto boolean;
  v_agendado public.precos;
  v_id uuid;
begin
  select v.organizacao_id into v_organizacao from public.variantes v where v.id = p_variante and v.ativa;
  if v_organizacao is null or not privado.pode_alterar_preco(v_organizacao, p_unidade) then
    raise exception 'Variação não encontrada ou sem permissão para alterar este preço' using errcode = 'P0002';
  end if;
  if p_canal is null or p_canal not in ('loja', 'online') then
    raise exception 'Canal inválido' using errcode = '22023';
  end if;
  if p_valor is null or p_valor < 0 or p_valor > 100000000 then
    raise exception 'Preço inválido (de R$ 0,00 a R$ 1.000.000,00)' using errcode = '22023';
  end if;
  if p_inicio is not null and p_inicio < now() - interval '5 minutes' then
    raise exception 'O preço novo vale de agora em diante: a vigência não começa no passado' using errcode = '22023';
  end if;
  v_inicio := greatest(coalesce(p_inicio, now()), now());
  perform privado.travar_preco(v_organizacao, p_variante, p_unidade, p_canal);

  select * into v_agendado from public.precos p
  where p.variante_id = p_variante and p.unidade_id is not distinct from p_unidade and p.canal = p_canal
    and p.origem <> 'campanha' and p.cancelado_em is null and p.inicio > now()
  order by p.inicio desc limit 1;
  if found then
    if v_agendado.valor_centavos = p_valor and v_agendado.inicio = v_inicio then
      return jsonb_build_object('id', v_agendado.id, 'repetida', true);
    end if;
    raise exception 'Já há mudança de preço agendada para %: cancele antes de agendar outra',
      to_char(v_agendado.inicio at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') using errcode = 'OR022';
  end if;

  select * into v_aberto from public.precos p
  where p.variante_id = p_variante and p.unidade_id is not distinct from p_unidade and p.canal = p_canal
    and p.origem <> 'campanha' and p.cancelado_em is null and p.fim is null
  for update;
  -- Guardado agora: o "perform" abaixo muda o FOUND.
  v_tem_aberto := found;
  if v_tem_aberto and v_aberto.valor_centavos = p_valor then
    return jsonb_build_object('id', v_aberto.id, 'repetida', true);
  end if;

  perform set_config('ora.motivo', v_motivo, true);
  if v_tem_aberto then
    if v_aberto.inicio >= v_inicio then
      raise exception 'Outro preço começou neste mesmo instante: tente de novo' using errcode = '40001';
    end if;
    update public.precos p set fim = v_inicio where p.id = v_aberto.id;
  end if;
  insert into public.precos (organizacao_id, variante_id, unidade_id, canal, valor_centavos, inicio, origem, criado_por, motivo)
  values (v_organizacao, p_variante, p_unidade, p_canal, p_valor, v_inicio, 'manual', (select auth.uid()), v_motivo)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'repetida', false);
end;
$$;

-- Campanha: preço com início e fim, que vale acima do preço da loja e do geral enquanto durar.
create or replace function public.preco_campanha(
  p_variante uuid, p_unidade uuid, p_canal text, p_valor bigint, p_inicio timestamptz, p_fim timestamptz, p_motivo text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_organizacao uuid;
  v_inicio timestamptz;
  v_existente public.precos;
  v_id uuid;
begin
  select v.organizacao_id into v_organizacao from public.variantes v where v.id = p_variante and v.ativa;
  if v_organizacao is null or not privado.pode_alterar_preco(v_organizacao, p_unidade) then
    raise exception 'Variação não encontrada ou sem permissão para alterar este preço' using errcode = 'P0002';
  end if;
  if p_canal is null or p_canal not in ('loja', 'online') then
    raise exception 'Canal inválido' using errcode = '22023';
  end if;
  if p_valor is null or p_valor < 0 or p_valor > 100000000 then
    raise exception 'Preço inválido (de R$ 0,00 a R$ 1.000.000,00)' using errcode = '22023';
  end if;
  if p_inicio is not null and p_inicio < now() - interval '5 minutes' then
    raise exception 'A campanha começa agora ou no futuro: a vigência não começa no passado' using errcode = '22023';
  end if;
  v_inicio := greatest(coalesce(p_inicio, now()), now());
  if p_fim is null or p_fim <= v_inicio then
    raise exception 'A campanha precisa de fim depois do início' using errcode = '22023';
  end if;
  if p_fim > v_inicio + interval '366 days' then
    raise exception 'A campanha dura no máximo um ano' using errcode = '22023';
  end if;
  perform privado.travar_preco(v_organizacao, p_variante, p_unidade, p_canal);

  select * into v_existente from public.precos p
  where p.variante_id = p_variante and p.unidade_id is not distinct from p_unidade and p.canal = p_canal
    and p.origem = 'campanha' and p.cancelado_em is null and p.inicio < p_fim and p.fim > v_inicio
  order by p.inicio limit 1;
  if found then
    if v_existente.valor_centavos = p_valor and v_existente.fim = p_fim and (v_existente.inicio = v_inicio or p_inicio is null) then
      return jsonb_build_object('id', v_existente.id, 'repetida', true);
    end if;
    raise exception 'Já existe campanha neste período (de % a %): cancele ou encerre antes',
      to_char(v_existente.inicio at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
      to_char(v_existente.fim at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') using errcode = 'OR021';
  end if;

  perform set_config('ora.motivo', v_motivo, true);
  insert into public.precos (organizacao_id, variante_id, unidade_id, canal, valor_centavos, inicio, fim, origem, criado_por, motivo)
  values (v_organizacao, p_variante, p_unidade, p_canal, p_valor, v_inicio, p_fim, 'campanha', (select auth.uid()), v_motivo)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'repetida', false);
end;
$$;

-- Cancelar o que ainda não começou (o preço anterior volta a valer) ou encerrar agora a campanha em curso.
create or replace function public.preco_cancelar(p_preco uuid, p_motivo text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_preco public.precos;
begin
  select * into v_preco from public.precos p where p.id = p_preco;
  if not found or not privado.pode_alterar_preco(v_preco.organizacao_id, v_preco.unidade_id) then
    raise exception 'Preço não encontrado para você' using errcode = 'P0002';
  end if;
  perform privado.travar_preco(v_preco.organizacao_id, v_preco.variante_id, v_preco.unidade_id, v_preco.canal);
  select * into v_preco from public.precos p where p.id = p_preco for update;
  if v_preco.cancelado_em is not null then
    return 'ja_cancelado';
  end if;
  perform set_config('ora.motivo', v_motivo, true);
  -- Começar exatamente agora ainda é "não começou": nenhuma venda anterior usou este preço.
  if v_preco.inicio >= now() then
    update public.precos p set cancelado_em = now(), cancelado_por = (select auth.uid()), motivo_cancelamento = v_motivo where p.id = p_preco;
    if v_preco.origem <> 'campanha' then
      -- O preço que esta mudança fecharia volta a ficar aberto.
      update public.precos p set fim = null
      where p.variante_id = v_preco.variante_id and p.unidade_id is not distinct from v_preco.unidade_id and p.canal = v_preco.canal
        and p.origem <> 'campanha' and p.cancelado_em is null and p.fim = v_preco.inicio;
    end if;
    return 'cancelado';
  end if;
  if v_preco.origem = 'campanha' and v_preco.fim > now() then
    update public.precos p set fim = now() where p.id = p_preco;
    return 'encerrado';
  end if;
  raise exception 'Este preço já valeu: para mudar, defina um preço novo' using errcode = '22023';
end;
$$;

-- Preço que vale agora em cada loja ativa visível, com a origem (campanha, loja ou rede).
create or replace function public.precos_por_loja(p_variante uuid, p_canal text default 'loja')
returns table (unidade_id uuid, unidade text, valor_centavos bigint, origem text, de_loja boolean, preco_id uuid, fim timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.nome, p.valor_centavos, p.origem, p.unidade_id is not null, p.id, p.fim
  from public.unidades u
  join public.variantes v on v.id = p_variante and v.organizacao_id = u.organizacao_id
  left join lateral (
    select x.* from public.precos x
    where x.variante_id = p_variante and x.canal = p_canal and (x.unidade_id is null or x.unidade_id = u.id)
      and x.inicio <= now() and (x.fim is null or x.fim > now()) and x.cancelado_em is null
    order by (x.origem = 'campanha') desc, (x.unidade_id is null), x.inicio desc
    limit 1
  ) p on true
  where u.id in (select privado.unidades_visiveis()) and u.tipo in ('loja_fisica', 'online')
  order by u.nome;
$$;

revoke all on function privado.precos_protegidos(), privado.pode_alterar_preco(uuid, uuid), privado.travar_preco(uuid, uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.preco_definir(uuid, uuid, text, bigint, timestamptz, text),
  public.preco_campanha(uuid, uuid, text, bigint, timestamptz, timestamptz, text), public.preco_cancelar(uuid, text),
  public.precos_por_loja(uuid, text) from public, anon;
grant execute on function public.preco_definir(uuid, uuid, text, bigint, timestamptz, text),
  public.preco_campanha(uuid, uuid, text, bigint, timestamptz, timestamptz, text), public.preco_cancelar(uuid, text),
  public.precos_por_loja(uuid, text) to authenticated;
