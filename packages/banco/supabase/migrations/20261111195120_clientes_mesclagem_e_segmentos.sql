-- =============================================================================
-- Duplicados, mesclagem controlada e segmentos explicáveis (lote L5c: ORA-CRM-006, ORA-CRM-010)
--
--   * Duplicados: dois clientes ativos com o mesmo telefone ou com o mesmo nome e o mesmo nascimento
--     aparecem como candidatos para o dono (cliente.mesclar). O dono mescla ou marca "não são a mesma
--     pessoa" (com motivo), e o par some da lista.
--   * Mesclar: o cadastro que fica recebe o que faltava do outro (documento, telefone, e-mail, nascimento,
--     endereço, finalidades) e todas as compras, oportunidades, atividades e consentimentos. Nada se apaga:
--     o outro vira "mesclado", aponta para o que ficou, perde os identificadores (que passam para o que
--     ficou) e não muda mais. Documentos diferentes = pessoas diferentes (OR029). Tudo com motivo e
--     auditoria; as vendas guardam o nome digitado na hora (origem).
--   * Segmentos (RFM simples, explicável, sem dado novo): sem compra, novo, ocasional, recorrente, em risco
--     e inativo, com "alto valor" para o décimo de maior gasto líquido em 12 meses. A ficha mostra o
--     segmento e a explicação; o dono vê os totais por segmento e quantos aceitam ofertas por canal.
-- Códigos: OR029 documentos diferentes não se mesclam.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

do $$
begin
  perform set_config('ora.motivo', 'Mesclagem de cadastros duplicados (ORA-CRM-006): só o dono', true);
  insert into public.permissoes (codigo, descricao, modulo)
  values ('cliente.mesclar', 'Mesclar cadastros duplicados de cliente e marcar os que não são a mesma pessoa', 'crm');
  insert into public.papel_permissoes (papel, permissao) values ('dono', 'cliente.mesclar');
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Cadastro mesclado
-- -----------------------------------------------------------------------------
alter table public.clientes add column mesclado_em uuid references public.clientes (id);
alter table public.clientes drop constraint clientes_situacao_check;
alter table public.clientes add constraint clientes_situacao_check check (situacao in ('ativo', 'inativo', 'mesclado'));
alter table public.clientes add constraint clientes_mesclado_coerente check ((situacao = 'mesclado') = (mesclado_em is not null) and mesclado_em is distinct from id);
alter table public.clientes drop constraint clientes_check;
alter table public.clientes add constraint clientes_identificador check (situacao = 'mesclado' or documento_resumo is not null or telefone_resumo is not null);
create index clientes_mesclado_em on public.clientes (mesclado_em);

-- Cadastro mesclado não muda mais (a mesclagem é a última alteração dele).
create or replace function privado.cliente_mesclado_fixo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.situacao = 'mesclado' then
    raise exception 'Cadastro mesclado em outro: use o cliente que ficou' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function privado.cliente_mesclado_fixo() from public, anon, authenticated;
create trigger clientes_mesclado_fixo before update on public.clientes
  for each row execute function privado.cliente_mesclado_fixo();

-- Pares que o dono já disse que não são a mesma pessoa (saem da lista de duplicados).
create table public.cliente_nao_duplicados (
  organizacao_id uuid not null,
  cliente_a uuid not null,
  cliente_b uuid not null,
  motivo text not null check (length(trim(motivo)) between 3 and 200),
  decidido_por uuid not null references public.perfis_usuario (id),
  decidido_em timestamptz not null default now(),
  primary key (cliente_a, cliente_b),
  check (cliente_a < cliente_b),
  foreign key (cliente_a, organizacao_id) references public.clientes (id, organizacao_id),
  foreign key (cliente_b, organizacao_id) references public.clientes (id, organizacao_id)
);
create index cliente_nao_duplicados_b on public.cliente_nao_duplicados (cliente_b, organizacao_id);
create index cliente_nao_duplicados_a on public.cliente_nao_duplicados (cliente_a, organizacao_id);
create index cliente_nao_duplicados_decidido_por on public.cliente_nao_duplicados (decidido_por);
create trigger cliente_nao_duplicados_auditar after insert on public.cliente_nao_duplicados
  for each row execute function privado.auditar_mudanca();
alter table public.cliente_nao_duplicados enable row level security;
revoke all on public.cliente_nao_duplicados from anon, authenticated;
grant select on public.cliente_nao_duplicados to authenticated;
create policy cliente_nao_duplicados_ler on public.cliente_nao_duplicados for select to authenticated
  using (organizacao_id in (select privado.organizacoes_com_permissao('cliente.mesclar')));

-- -----------------------------------------------------------------------------
-- 2. Duplicados e mesclagem
-- -----------------------------------------------------------------------------
create or replace function public.clientes_duplicados()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_unidade uuid;
  v_organizacao uuid;
begin
  select c.unidade_id, c.organizacao_id into v_unidade, v_organizacao from privado.cliente_contexto('cliente.mesclar') c;
  return coalesce((
    select jsonb_agg(jsonb_build_object('motivo', x.motivo,
      'a', jsonb_build_object('id', a.id, 'numero', a.numero, 'nome', a.nome, 'documento', a.documento_mascara, 'telefone', a.telefone_mascara,
                              'compras', (select count(*) from public.vendas v where v.cliente_id = a.id and v.situacao = 'concluida'), 'criado_em', a.criado_em),
      'b', jsonb_build_object('id', b.id, 'numero', b.numero, 'nome', b.nome, 'documento', b.documento_mascara, 'telefone', b.telefone_mascara,
                              'compras', (select count(*) from public.vendas v where v.cliente_id = b.id and v.situacao = 'concluida'), 'criado_em', b.criado_em))
      order by a.numero, b.numero)
    from (
      -- Só pares que já batem por um índice (telefone) ou por nome igual: nada de comparar todos com todos.
      select p.a_id, p.b_id, string_agg(distinct p.motivo, ', ') as motivo
      from (
        select a.id as a_id, b.id as b_id, 'mesmo telefone' as motivo
        from public.clientes a
        join public.clientes b on b.organizacao_id = a.organizacao_id and b.telefone_resumo = a.telefone_resumo and a.id < b.id
        where a.organizacao_id = v_organizacao and a.telefone_resumo is not null and a.situacao = 'ativo' and b.situacao = 'ativo'
        union all
        select a.id, b.id, 'mesmo nome e nascimento'
        from public.clientes a
        join public.clientes b on b.organizacao_id = a.organizacao_id and lower(b.nome) = lower(a.nome) and a.id < b.id
        join privado.cliente_dados da on da.cliente_id = a.id
        join privado.cliente_dados db on db.cliente_id = b.id and db.nascimento = da.nascimento
        where a.organizacao_id = v_organizacao and a.situacao = 'ativo' and b.situacao = 'ativo' and da.nascimento is not null) p
      where not exists (select 1 from public.cliente_nao_duplicados n where n.cliente_a = p.a_id and n.cliente_b = p.b_id)
      group by p.a_id, p.b_id
      limit 200) x
    join public.clientes a on a.id = x.a_id join public.clientes b on b.id = x.b_id), '[]'::jsonb);
end;
$$;

create or replace function public.clientes_marcar_diferentes(p_a uuid, p_b uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_unidade uuid;
  v_organizacao uuid;
  v_menor uuid := least(p_a, p_b);
  v_maior uuid := greatest(p_a, p_b);
begin
  select c.unidade_id, c.organizacao_id into v_unidade, v_organizacao from privado.cliente_contexto('cliente.mesclar') c;
  if p_a is null or p_b is null or p_a = p_b
     or (select count(*) from public.clientes c where c.id in (p_a, p_b) and c.organizacao_id = v_organizacao) <> 2 then
    raise exception 'Clientes não encontrados' using errcode = 'P0002';
  end if;
  insert into public.cliente_nao_duplicados (organizacao_id, cliente_a, cliente_b, motivo, decidido_por)
  values (v_organizacao, v_menor, v_maior, v_motivo, (select auth.uid()))
  on conflict (cliente_a, cliente_b) do nothing;
  return found;
end;
$$;

-- Mescla p_absorver em p_manter (os dois ativos, da mesma rede). Devolve o que foi movido.
create or replace function public.clientes_mesclar(p_manter uuid, p_absorver uuid, p_motivo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_unidade uuid;
  v_organizacao uuid;
  v_fica public.clientes;
  v_sai public.clientes;
  v_dados_fica privado.cliente_dados;
  v_dados_sai privado.cliente_dados;
  v_documento text;
  v_telefone text;
  v_email text;
  v_nascimento date;
  v_endereco jsonb;
  v_campos text[] := '{}';
  v_vendas int;
  v_oportunidades int;
  v_atividades int;
  v_consentimentos int;
begin
  select c.unidade_id, c.organizacao_id into v_unidade, v_organizacao from privado.cliente_contexto('cliente.mesclar') c;
  if p_manter is null or p_absorver is null or p_manter = p_absorver then
    raise exception 'Escolha dois cadastros diferentes' using errcode = '22023';
  end if;
  -- Trava os dois em ordem de id (sem impasse com outra mesclagem dos mesmos).
  perform 1 from public.clientes c where c.id in (p_manter, p_absorver) and c.organizacao_id = v_organizacao order by c.id for update;
  select * into v_fica from public.clientes c where c.id = p_manter and c.organizacao_id = v_organizacao;
  select * into v_sai from public.clientes c where c.id = p_absorver and c.organizacao_id = v_organizacao;
  if v_fica.id is null or v_sai.id is null then
    raise exception 'Clientes não encontrados' using errcode = 'P0002';
  end if;
  if v_fica.situacao <> 'ativo' or v_sai.situacao <> 'ativo' then
    raise exception 'Só se mesclam cadastros ativos' using errcode = '22023';
  end if;
  select * into v_dados_fica from privado.cliente_dados d where d.cliente_id = v_fica.id;
  select * into v_dados_sai from privado.cliente_dados d where d.cliente_id = v_sai.id;
  if v_dados_fica.documento is not null and v_dados_sai.documento is not null and v_dados_fica.documento <> v_dados_sai.documento then
    raise exception 'Os documentos são diferentes: são pessoas diferentes' using errcode = 'OR029';
  end if;

  -- O que fica recebe o que faltava.
  v_documento := coalesce(v_dados_fica.documento, v_dados_sai.documento);
  v_telefone := coalesce(v_dados_fica.telefone, v_dados_sai.telefone);
  v_email := coalesce(v_dados_fica.email, v_dados_sai.email);
  v_nascimento := coalesce(v_dados_fica.nascimento, v_dados_sai.nascimento);
  v_endereco := coalesce(v_dados_fica.endereco, v_dados_sai.endereco);
  if v_documento is distinct from v_dados_fica.documento then v_campos := array_append(v_campos, 'documento'); end if;
  if v_telefone is distinct from v_dados_fica.telefone then v_campos := array_append(v_campos, 'telefone'); end if;
  if v_email is distinct from v_dados_fica.email then v_campos := array_append(v_campos, 'email'); end if;
  if v_nascimento is distinct from v_dados_fica.nascimento then v_campos := array_append(v_campos, 'nascimento'); end if;
  if v_endereco is distinct from v_dados_fica.endereco then v_campos := array_append(v_campos, 'endereco'); end if;

  perform set_config('ora.motivo', format('Mesclagem do cliente nº %s no nº %s: %s', v_sai.numero, v_fica.numero, v_motivo), true);
  -- Primeiro o que sai larga os identificadores (o índice único do documento), depois o que fica os recebe.
  update public.clientes c set situacao = 'mesclado', mesclado_em = v_fica.id, documento_resumo = null, documento_mascara = null,
    telefone_resumo = null, telefone_mascara = null, email_mascara = null, nascimento_informado = false, endereco_informado = false,
    atualizado_por = (select auth.uid()), atualizado_em = now()
  where c.id = v_sai.id;
  update privado.cliente_dados d set documento = null, telefone = null, email = null, nascimento = null, endereco = null where d.cliente_id = v_sai.id;
  update public.clientes c set
    documento_resumo = privado.cliente_resumo(v_organizacao, 'documento', v_documento), documento_mascara = privado.mascara_documento(v_documento),
    telefone_resumo = privado.cliente_resumo(v_organizacao, 'telefone', v_telefone), telefone_mascara = privado.mascara_telefone(v_telefone),
    email_mascara = privado.mascara_email(v_email), nascimento_informado = v_nascimento is not null, endereco_informado = v_endereco is not null,
    finalidades = array(select distinct x from unnest(v_fica.finalidades || v_sai.finalidades) x order by x),
    atualizado_por = (select auth.uid()), atualizado_em = now()
  where c.id = v_fica.id;
  update privado.cliente_dados d set documento = v_documento, telefone = v_telefone, email = v_email, nascimento = v_nascimento, endereco = v_endereco
  where d.cliente_id = v_fica.id;

  -- Tudo o que era do cadastro que saiu passa para o que ficou.
  update public.vendas v set cliente_id = v_fica.id where v.cliente_id = v_sai.id;
  get diagnostics v_vendas = row_count;
  update public.oportunidades o set cliente_id = v_fica.id where o.cliente_id = v_sai.id;
  get diagnostics v_oportunidades = row_count;
  update public.atividades a set cliente_id = v_fica.id where a.cliente_id = v_sai.id;
  get diagnostics v_atividades = row_count;
  update public.cliente_consentimentos k set cliente_id = v_fica.id where k.cliente_id = v_sai.id;
  get diagnostics v_consentimentos = row_count;

  insert into public.auditoria (usuario_id, unidade_id, organizacao_id, acao, alvo_tipo, alvo_id, depois, motivo, origem) values
    ((select auth.uid()), v_unidade, v_organizacao, 'cliente.mesclado', 'cliente', v_sai.id::text,
     jsonb_build_object('em', v_fica.id, 'numero_que_ficou', v_fica.numero), v_motivo, 'aplicacao'),
    ((select auth.uid()), v_unidade, v_organizacao, 'cliente.recebeu_mesclagem', 'cliente', v_fica.id::text,
     jsonb_build_object('de', v_sai.id, 'numero_que_saiu', v_sai.numero, 'campos', to_jsonb(v_campos), 'vendas', v_vendas,
                        'oportunidades', v_oportunidades, 'atividades', v_atividades, 'consentimentos', v_consentimentos), v_motivo, 'aplicacao');
  return jsonb_build_object('ficou', v_fica.id, 'saiu', v_sai.id, 'campos', to_jsonb(v_campos), 'vendas', v_vendas, 'oportunidades', v_oportunidades,
                            'atividades', v_atividades, 'consentimentos', v_consentimentos);
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Segmentos explicáveis (ORA-CRM-010)
-- -----------------------------------------------------------------------------
-- Compras concluídas por cliente (líquido de devoluções), em 12 meses e no total.
create or replace function privado.cliente_compras(p_organizacao uuid)
returns table (cliente_id uuid, compras_12m int, compras_total int, primeira timestamptz, ultima timestamptz, liquido_12m bigint, liquido_total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select v.cliente_id,
    (count(*) filter (where v.concluida_em > now() - interval '365 days'))::int,
    count(*)::int, min(v.concluida_em), max(v.concluida_em),
    coalesce(sum(v.total_centavos - v.devolvido_centavos) filter (where v.concluida_em > now() - interval '365 days'), 0)::bigint,
    coalesce(sum(v.total_centavos - v.devolvido_centavos), 0)::bigint
  from public.vendas v
  where v.organizacao_id = p_organizacao and v.situacao = 'concluida' and v.cliente_id is not null
  group by v.cliente_id;
$$;

-- Segmento de um cliente a partir das compras (a mesma regra para a ficha e para os totais).
create or replace function privado.cliente_segmento(p_compras_12m int, p_compras_total int, p_primeira timestamptz, p_ultima timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when coalesce(p_compras_total, 0) = 0 then 'sem_compra'
    when p_ultima < now() - interval '365 days' then 'inativo'
    when p_compras_total = 1 and p_primeira > now() - interval '90 days' then 'novo'
    when p_compras_12m >= 2 and p_ultima > now() - interval '180 days' then 'recorrente'
    when p_compras_total >= 2 then 'em_risco'
    else 'ocasional'
  end;
$$;

create or replace function privado.cliente_explicacao(p_compras_12m int, p_compras_total int, p_ultima timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case when coalesce(p_compras_total, 0) = 0 then 'nenhuma compra ligada ao cadastro'
    else format('%s compra(s) em 12 meses, %s no total; última há %s dia(s)', p_compras_12m, p_compras_total,
                greatest(0, extract(day from now() - p_ultima)::int)) end;
$$;
revoke all on function privado.cliente_compras(uuid), privado.cliente_segmento(int, int, timestamptz, timestamptz),
  privado.cliente_explicacao(int, int, timestamptz) from public, anon, authenticated;

-- Totais por segmento (dono): quantos clientes, quantos de alto valor e quantos aceitam ofertas por canal.
create or replace function public.clientes_segmentos()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_unidade uuid;
  v_organizacao uuid;
  v_corte bigint;
begin
  select c.unidade_id, c.organizacao_id into v_unidade, v_organizacao from privado.cliente_contexto('cliente.exportar') c;
  select percentile_disc(0.9) within group (order by x.liquido_12m) into v_corte
  from privado.cliente_compras(v_organizacao) x where x.liquido_12m > 0;
  return jsonb_build_object('corte_alto_valor', v_corte, 'segmentos', coalesce((
    select jsonb_agg(jsonb_build_object('segmento', s.segmento, 'clientes', s.clientes, 'alto_valor', s.alto_valor,
      'liquido_12m', s.liquido_12m, 'aceitam_ofertas', jsonb_build_object('whatsapp', s.whatsapp, 'sms', s.sms, 'email', s.email, 'ligacao', s.ligacao))
      order by array_position(array['recorrente', 'novo', 'ocasional', 'em_risco', 'inativo', 'sem_compra'], s.segmento))
    from (
      select privado.cliente_segmento(x.compras_12m, x.compras_total, x.primeira, x.ultima) as segmento, count(*)::int as clientes,
        (count(*) filter (where v_corte is not null and coalesce(x.liquido_12m, 0) >= v_corte and coalesce(x.liquido_12m, 0) > 0))::int as alto_valor,
        coalesce(sum(x.liquido_12m), 0)::bigint as liquido_12m,
        (count(*) filter (where privado.cliente_pode_contatar(c.id, 'whatsapp', 'ofertas')))::int as whatsapp,
        (count(*) filter (where privado.cliente_pode_contatar(c.id, 'sms', 'ofertas')))::int as sms,
        (count(*) filter (where privado.cliente_pode_contatar(c.id, 'email', 'ofertas')))::int as email,
        (count(*) filter (where privado.cliente_pode_contatar(c.id, 'ligacao', 'ofertas')))::int as ligacao
      from public.clientes c left join privado.cliente_compras(v_organizacao) x on x.cliente_id = c.id
      where c.organizacao_id = v_organizacao and c.situacao = 'ativo'
      group by 1) s), '[]'::jsonb));
end;
$$;

-- Ficha recriada a partir do texto aplicado em 20261111191909_clientes_compartilhados, com o cadastro
-- mesclado ('mesclado_em') e o segmento explicado ('segmento'), marcados "L5c".
create or replace function public.cliente_ficha(p_cliente uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade uuid;
  v_organizacao uuid;
  v_cliente public.clientes;
  v_compras record; -- L5c
begin
  select c.unidade_id, c.organizacao_id into v_unidade, v_organizacao from privado.cliente_contexto('cliente.buscar') c;
  select * into v_cliente from public.clientes c where c.id = p_cliente and c.organizacao_id = v_organizacao;
  if not found then
    raise exception 'Cliente não encontrado' using errcode = 'P0002';
  end if;
  perform privado.cliente_registrar_acesso('cliente.ficha', v_cliente.id, v_unidade, v_organizacao, '{}'::jsonb);
  select (count(*) filter (where v.concluida_em > now() - interval '365 days'))::int as compras_12m, count(*)::int as compras_total,
         min(v.concluida_em) as primeira, max(v.concluida_em) as ultima into v_compras -- L5c
  from public.vendas v where v.cliente_id = v_cliente.id and v.situacao = 'concluida';
  return jsonb_build_object(
    'id', v_cliente.id, 'numero', v_cliente.numero, 'nome', v_cliente.nome, 'tipo', v_cliente.tipo, 'situacao', v_cliente.situacao,
    'finalidades', to_jsonb(v_cliente.finalidades), 'documento', v_cliente.documento_mascara, 'telefone', v_cliente.telefone_mascara,
    'email', v_cliente.email_mascara, 'nascimento_informado', v_cliente.nascimento_informado, 'endereco_informado', v_cliente.endereco_informado,
    'origem', v_cliente.origem, 'criado_em', v_cliente.criado_em, 'atualizado_em', v_cliente.atualizado_em,
    'loja_de_origem', (select u.nome from public.unidades u where u.id = v_cliente.unidade_origem_id),
    'consentimentos', coalesce((
      select jsonb_agg(jsonb_build_object('canal', x.canal, 'finalidade', x.finalidade, 'situacao', x.situacao, 'fonte', x.fonte,
                                          'registrado_em', x.registrado_em) order by x.canal, x.finalidade)
      from (select distinct on (k.canal, k.finalidade) k.* from public.cliente_consentimentos k
            where k.cliente_id = v_cliente.id order by k.canal, k.finalidade, k.id desc) x), '[]'::jsonb),
    'compras', (select jsonb_build_object('total', count(*), 'ultima', max(v.concluida_em)) from public.vendas v
                where v.cliente_id = v_cliente.id and v.situacao = 'concluida'),
    -- L5c: para onde foi o cadastro mesclado e o segmento com a explicação (sem valores em reais).
    'mesclado_em', (select jsonb_build_object('id', m.id, 'numero', m.numero, 'nome', m.nome) from public.clientes m where m.id = v_cliente.mesclado_em),
    'segmento', jsonb_build_object(
      'codigo', privado.cliente_segmento(v_compras.compras_12m, v_compras.compras_total, v_compras.primeira, v_compras.ultima),
      'explicacao', privado.cliente_explicacao(v_compras.compras_12m, v_compras.compras_total, v_compras.ultima)));
end;
$$;

revoke all on function public.clientes_duplicados(), public.clientes_marcar_diferentes(uuid, uuid, text), public.clientes_mesclar(uuid, uuid, text),
  public.clientes_segmentos() from public, anon;
grant execute on function public.clientes_duplicados(), public.clientes_marcar_diferentes(uuid, uuid, text), public.clientes_mesclar(uuid, uuid, text),
  public.clientes_segmentos() to authenticated;
