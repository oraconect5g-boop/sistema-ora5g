-- =============================================================================
-- Conciliação fiscal das vendas com as notas (lote L10b: ORA-FISC-008 em parte)
--
-- A fila fiscal (ADR-006) já guarda o pedido de nota de cada venda, a nota registrada pela chave de acesso (com o dígito
-- e o CNPJ da loja conferidos), o PDF, o XML e o protocolo (L10a) e a nota de devolução. Aqui, a conferência do conjunto.
--
-- public.notas_conciliacao(inicio, fim, loja): uma leitura só, para quem aprova nota (nota.aprovar: dono e gerente), das
-- lojas onde a pessoa tem essa permissão (ou de uma delas). O período (de um dia a um ano) vale no fuso de São Paulo e
-- se conta pela venda concluída (a nota de devolução, pela devolução). Só leitura.
--   * por loja e no total: as vendas concluídas do período (as canceladas não entram) em quatro grupos que não se
--     cruzam (com a nota emitida, com o pedido em andamento, devolvida inteira sem nota e sem pedido), com o valor; dos
--     pedidos em andamento, os que passaram do prazo de alerta da fila (só se houver prazo registrado: fiscal_politicas);
--     das notas de venda emitidas, as registradas depois do prazo; das notas emitidas (de venda e de devolução), as que
--     estão sem o PDF, sem o XML ou sem o protocolo; as notas de devolução (emitidas, pendentes e canceladas); e as
--     divergências (todas e as ainda não conferidas);
--   * as listas do que resolver (até 50 de cada, as mais antigas primeiro): vendas sem pedido, pedidos em andamento,
--     notas de devolução pendentes e notas emitidas sem documento;
--   * as divergências (até 100, as não conferidas primeiro), o que não fecha sem precisar de regra do contador:
--       - chave_fora_do_mes: o ano e o mês de emissão gravados na chave de acesso são de antes da venda (ou da
--         devolução) ou de depois do registro da emissão: a nota certa não é de antes da venda nem do futuro;
--       - numero_repetido: o mesmo número de nota (CNPJ, modelo, série e número da chave) registrado em outro pedido das
--         lojas que a pessoa vê;
--       - devolucao_sem_nota: o pedido da nota de devolução foi cancelado (a devolução de venda com nota emitida ficou
--         sem a nota de devolução);
--   * o tempo da venda ao registro da emissão das notas de venda (média e maior, em minutos).
--
-- public.notas_conferir_divergencia(pedido, tipo, observacao): quem aprova nota na loja do pedido registra que conferiu a
-- divergência (o que viu e o que foi feito, de 10 a 500 letras); uma vez por pedido e tipo; a divergência tem de existir
-- naquele momento. A conferida continua na lista, com quem conferiu, e deixa de contar como aberta.
--
-- O valor da nota contra o da venda e os tributos ficam de fora: dependem da matriz fiscal do contador (o que entra em
-- cada documento; conserto, recarga e chip podem ter documento próprio: ORA-FISC-003 e ORA-FISC-007).
-- Reversão: supabase/reversao/<mesmo nome>.sql (as conferências registradas se perdem: só em banco sem dados reais).
-- =============================================================================

create table public.notas_divergencias_conferidas (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  unidade_id uuid not null,
  pedido_id uuid not null references public.notas_pedidos (id),
  tipo text not null check (tipo in ('chave_fora_do_mes', 'numero_repetido', 'devolucao_sem_nota')),
  observacao text not null check (length(trim(observacao)) between 10 and 500),
  conferida_por uuid not null references public.perfis_usuario (id),
  conferida_em timestamptz not null default now(),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id),
  unique (pedido_id, tipo)
);
comment on table public.notas_divergencias_conferidas is
  'Divergências da conciliação fiscal conferidas por quem aprova nota (L10b, ORA-FISC-008): só inserção, com auditoria.';
create index notas_divergencias_conferidas_unidade on public.notas_divergencias_conferidas (unidade_id, organizacao_id);
create index notas_divergencias_conferidas_conferida_por on public.notas_divergencias_conferidas (conferida_por);
create trigger notas_divergencias_conferidas_auditar after insert or update or delete on public.notas_divergencias_conferidas
  for each row execute function privado.auditar_mudanca();
create trigger notas_divergencias_conferidas_sem_alteracao before update or delete on public.notas_divergencias_conferidas
  for each row execute function privado.so_insercao();
create trigger notas_divergencias_conferidas_sem_truncate before truncate on public.notas_divergencias_conferidas
  for each statement execute function privado.so_insercao();

alter table public.notas_divergencias_conferidas enable row level security;
revoke all on public.notas_divergencias_conferidas from anon, authenticated;
grant select on public.notas_divergencias_conferidas to authenticated;
create policy notas_divergencias_conferidas_ler on public.notas_divergencias_conferidas for select to authenticated
  using (pedido_id in (select p.id from public.notas_pedidos p));

-- O número de cada nota emitida, para a busca do número repetido não percorrer todas as notas da rede.
create index notas_pedidos_numero_emitida on public.notas_pedidos (numero_documento) where situacao = 'emitida';

-- -----------------------------------------------------------------------------
-- A leitura da conciliação
-- -----------------------------------------------------------------------------
create or replace function public.notas_conciliacao(p_inicio date, p_fim date, p_unidade uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_permitidas uuid[] := array(select u from privado.unidades_com_permissao('nota.aprovar') u);
  v_lojas uuid[];
  v_de timestamptz;
  v_ate timestamptz;
  resultado jsonb;
begin
  if p_inicio is null or p_fim is null or p_fim < p_inicio or p_fim - p_inicio > 366 then
    raise exception 'Período inválido: de um dia a um ano' using errcode = '22023';
  end if;
  if coalesce(array_length(v_permitidas, 1), 0) = 0 then
    raise exception 'Sem permissão para a conciliação das notas' using errcode = '42501';
  end if;
  if p_unidade is not null and not (p_unidade = any (v_permitidas)) then
    raise exception 'Sem permissão para a conciliação desta loja' using errcode = '42501';
  end if;
  v_lojas := case when p_unidade is null then v_permitidas else array[p_unidade] end;
  v_de := p_inicio::timestamp at time zone 'America/Sao_Paulo';
  v_ate := (p_fim + 1)::timestamp at time zone 'America/Sao_Paulo';

  with
  -- Cada loja com o prazo de alerta da fila da rede dela (nulo: sem prazo registrado, nada passa do prazo).
  lojas as (
    select u.id, u.nome, f.alerta_minutos as alerta
    from public.unidades u left join public.fiscal_politicas f on f.organizacao_id = u.organizacao_id
    where u.id = any (v_lojas)
  ),
  vendas_do_periodo as (
    select v.id, v.numero, v.unidade_id, v.vendedor_id, coalesce(v.total_centavos, 0) as total, v.devolvido_centavos as devolvido,
           v.concluida_em
    from public.vendas v
    where v.unidade_id = any (v_lojas) and v.situacao = 'concluida' and v.concluida_em >= v_de and v.concluida_em < v_ate
  ),
  -- Cada venda num grupo só. O pedido vivo da nota de venda é no máximo um (índice notas_um_pedido_vivo_por_venda).
  -- minutos: da venda ao registro da emissão (com nota) ou até agora (as outras).
  vendas_classificadas as (
    select z.id, z.numero, z.unidade_id, z.vendedor_id, z.total, z.concluida_em, l.alerta, p.id as pedido, p.situacao as pedido_situacao,
      case when p.situacao = 'emitida' then 'com_nota'
           when p.id is not null then 'em_andamento'
           when z.devolvido > 0 and z.devolvido >= z.total then 'devolvida_sem_nota'
           else 'sem_pedido' end as grupo,
      greatest(0, floor(extract(epoch from (coalesce(p.emitida_em, now()) - z.concluida_em)) / 60))::int as minutos
    from vendas_do_periodo z
    join lojas l on l.id = z.unidade_id
    left join public.notas_pedidos p on p.venda_id = z.id and p.tipo = 'venda' and p.situacao <> 'cancelada'
  ),
  -- Os pedidos de nota do período (de venda, pela venda; de devolução, pela devolução), de qualquer situação.
  pedidos_do_periodo as (
    select p.id, p.unidade_id, p.venda_id, p.tipo, p.situacao, p.venda_concluida_em, p.emitida_em, p.chave_acesso, p.modelo,
      p.serie, p.numero_documento, p.protocolo, p.motivo_cancelamento, p.atualizado_em,
      exists (select 1 from public.notas_documentos d where d.pedido_id = p.id and d.tipo = 'pdf' and d.substituido_em is null) as tem_pdf,
      exists (select 1 from public.notas_documentos d where d.pedido_id = p.id and d.tipo = 'xml' and d.substituido_em is null) as tem_xml
    from public.notas_pedidos p
    where p.unidade_id = any (v_lojas) and p.venda_concluida_em >= v_de and p.venda_concluida_em < v_ate
  ),
  -- Para achar o número repetido: as notas emitidas das lojas que a pessoa vê com o mesmo número de alguma nota do
  -- período (pelo índice notas_pedidos_numero_emitida), contadas por CNPJ, modelo, série e número.
  repetidos as (
    select o.id, substr(o.chave_acesso, 7, 14) as cnpj, o.modelo, o.serie, o.numero_documento, v.numero as venda_numero,
      count(*) over (partition by substr(o.chave_acesso, 7, 14), o.modelo, o.serie, o.numero_documento) as quantos
    from public.notas_pedidos o join public.vendas v on v.id = o.venda_id
    where o.situacao = 'emitida' and o.unidade_id = any (v_permitidas)
      and o.numero_documento in (select p.numero_documento from pedidos_do_periodo p where p.situacao = 'emitida')
  ),
  divergentes as (
    select p.id as pedido, p.unidade_id, p.venda_id, p.tipo as pedido_tipo, 'chave_fora_do_mes'::text as tipo, p.emitida_em as quando,
      p.modelo, p.serie, p.numero_documento,
      '20' || substr(p.chave_acesso, 3, 2) || '-' || substr(p.chave_acesso, 5, 2) as mes_da_chave,
      to_char(p.venda_concluida_em at time zone 'America/Sao_Paulo', 'YYYY-MM') as mes_da_venda,
      null::bigint as outra_venda, null::text as motivo
    from pedidos_do_periodo p
    where p.situacao = 'emitida'
      and ('20' || substr(p.chave_acesso, 3, 2) || '-' || substr(p.chave_acesso, 5, 2) < to_char(p.venda_concluida_em at time zone 'America/Sao_Paulo', 'YYYY-MM')
        or '20' || substr(p.chave_acesso, 3, 2) || '-' || substr(p.chave_acesso, 5, 2) > to_char(p.emitida_em at time zone 'America/Sao_Paulo', 'YYYY-MM'))
    union all
    select p.id, p.unidade_id, p.venda_id, p.tipo, 'numero_repetido', p.emitida_em, p.modelo, p.serie, p.numero_documento, null, null,
      (select min(o.venda_numero) from repetidos o
       where o.id <> r.id and o.cnpj = r.cnpj and o.modelo = r.modelo and o.serie = r.serie and o.numero_documento = r.numero_documento),
      null
    from pedidos_do_periodo p join repetidos r on r.id = p.id
    where r.quantos > 1
    union all
    select p.id, p.unidade_id, p.venda_id, p.tipo, 'devolucao_sem_nota', p.atualizado_em, null, null, null, null, null, null, p.motivo_cancelamento
    from pedidos_do_periodo p
    where p.tipo = 'devolucao' and p.situacao = 'cancelada'
  ),
  divergencias as (
    select d.*, c.conferida_em, c.observacao as observacao_da_conferencia, pu.nome as conferida_por
    from divergentes d
    left join public.notas_divergencias_conferidas c on c.pedido_id = d.pedido and c.tipo = d.tipo
    left join public.perfis_usuario pu on pu.id = c.conferida_por
  ),
  agregado_vendas as (
    select c.unidade_id, count(*) as vendas, sum(c.total) as valor_vendas,
      count(*) filter (where c.grupo = 'com_nota') as com_nota, coalesce(sum(c.total) filter (where c.grupo = 'com_nota'), 0) as valor_com_nota,
      count(*) filter (where c.grupo = 'em_andamento') as em_andamento,
      coalesce(sum(c.total) filter (where c.grupo = 'em_andamento'), 0) as valor_em_andamento,
      count(*) filter (where c.grupo = 'sem_pedido') as sem_pedido, coalesce(sum(c.total) filter (where c.grupo = 'sem_pedido'), 0) as valor_sem_pedido,
      count(*) filter (where c.grupo = 'devolvida_sem_nota') as devolvidas_sem_nota,
      coalesce(sum(c.total) filter (where c.grupo = 'devolvida_sem_nota'), 0) as valor_devolvidas_sem_nota,
      count(*) filter (where c.grupo = 'em_andamento' and c.alerta is not null and c.minutos > c.alerta) as atrasadas,
      count(*) filter (where c.grupo = 'com_nota' and c.alerta is not null and c.minutos > c.alerta) as fora_do_prazo
    from vendas_classificadas c group by c.unidade_id
  ),
  agregado_notas as (
    select p.unidade_id,
      count(*) filter (where p.situacao = 'emitida') as notas_emitidas,
      count(*) filter (where p.situacao = 'emitida' and not p.tem_pdf) as sem_pdf,
      count(*) filter (where p.situacao = 'emitida' and not p.tem_xml) as sem_xml,
      count(*) filter (where p.situacao = 'emitida' and p.protocolo is null) as sem_protocolo,
      count(*) filter (where p.tipo = 'devolucao') as devolucoes,
      count(*) filter (where p.tipo = 'devolucao' and p.situacao = 'emitida') as devolucoes_emitidas,
      count(*) filter (where p.tipo = 'devolucao' and p.situacao in ('aguardando_aprovacao', 'correcao_solicitada', 'aprovada')) as devolucoes_pendentes,
      count(*) filter (where p.tipo = 'devolucao' and p.situacao = 'cancelada') as devolucoes_canceladas
    from pedidos_do_periodo p group by p.unidade_id
  ),
  agregado_divergencias as (
    select d.unidade_id, count(*) as divergencias, count(*) filter (where d.conferida_em is null) as divergencias_abertas
    from divergencias d group by d.unidade_id
  ),
  -- As lojas com venda ou pedido de nota no período.
  por_loja as (
    select l.id as unidade, l.nome,
      coalesce(a.vendas, 0) as vendas, coalesce(a.valor_vendas, 0) as valor_vendas,
      coalesce(a.com_nota, 0) as com_nota, coalesce(a.valor_com_nota, 0) as valor_com_nota,
      coalesce(a.em_andamento, 0) as em_andamento, coalesce(a.valor_em_andamento, 0) as valor_em_andamento,
      coalesce(a.sem_pedido, 0) as sem_pedido, coalesce(a.valor_sem_pedido, 0) as valor_sem_pedido,
      coalesce(a.devolvidas_sem_nota, 0) as devolvidas_sem_nota, coalesce(a.valor_devolvidas_sem_nota, 0) as valor_devolvidas_sem_nota,
      coalesce(a.atrasadas, 0) as atrasadas, coalesce(a.fora_do_prazo, 0) as fora_do_prazo,
      coalesce(n.notas_emitidas, 0) as notas_emitidas, coalesce(n.sem_pdf, 0) as sem_pdf, coalesce(n.sem_xml, 0) as sem_xml,
      coalesce(n.sem_protocolo, 0) as sem_protocolo, coalesce(n.devolucoes, 0) as devolucoes,
      coalesce(n.devolucoes_emitidas, 0) as devolucoes_emitidas, coalesce(n.devolucoes_pendentes, 0) as devolucoes_pendentes,
      coalesce(n.devolucoes_canceladas, 0) as devolucoes_canceladas,
      coalesce(d.divergencias, 0) as divergencias, coalesce(d.divergencias_abertas, 0) as divergencias_abertas,
      l.alerta as alerta_minutos
    from lojas l
    left join agregado_vendas a on a.unidade_id = l.id
    left join agregado_notas n on n.unidade_id = l.id
    left join agregado_divergencias d on d.unidade_id = l.id
    where a.unidade_id is not null or n.unidade_id is not null
  ),
  lista_sem_pedido as (
    select c.id as venda, c.numero, l.nome as loja, coalesce(pu.nome, '—') as vendedor, c.concluida_em as quando, c.total as valor, c.minutos
    from vendas_classificadas c join lojas l on l.id = c.unidade_id left join public.perfis_usuario pu on pu.id = c.vendedor_id
    where c.grupo = 'sem_pedido'
    order by c.concluida_em, c.numero
    limit 50
  ),
  lista_em_andamento as (
    select c.pedido, c.id as venda, c.numero, l.nome as loja, c.pedido_situacao as situacao, c.concluida_em as quando, c.total as valor,
      c.minutos, (c.alerta is not null and c.minutos > c.alerta) as atrasada
    from vendas_classificadas c join lojas l on l.id = c.unidade_id
    where c.grupo = 'em_andamento'
    order by c.concluida_em, c.numero
    limit 50
  ),
  lista_devolucoes as (
    select p.id as pedido, p.venda_id as venda, v.numero, l.nome as loja, p.situacao, p.venda_concluida_em as quando,
      greatest(0, floor(extract(epoch from (now() - p.venda_concluida_em)) / 60))::int as minutos
    from pedidos_do_periodo p join lojas l on l.id = p.unidade_id join public.vendas v on v.id = p.venda_id
    where p.tipo = 'devolucao' and p.situacao in ('aguardando_aprovacao', 'correcao_solicitada', 'aprovada')
    order by p.venda_concluida_em, v.numero
    limit 50
  ),
  lista_sem_documento as (
    select p.id as pedido, p.venda_id as venda, v.numero, l.nome as loja, p.tipo, p.emitida_em as quando, p.modelo, p.serie, p.numero_documento,
      to_jsonb(array_remove(array[case when not p.tem_pdf then 'pdf' end, case when not p.tem_xml then 'xml' end,
                                  case when p.protocolo is null then 'protocolo' end], null)) as falta
    from pedidos_do_periodo p join lojas l on l.id = p.unidade_id join public.vendas v on v.id = p.venda_id
    where p.situacao = 'emitida' and (not p.tem_pdf or not p.tem_xml or p.protocolo is null)
    order by p.emitida_em, v.numero
    limit 50
  ),
  lista_divergencias as (
    select d.tipo, d.pedido, d.pedido_tipo, d.venda_id as venda, v.numero, l.nome as loja, d.quando, d.modelo, d.serie, d.numero_documento,
      d.mes_da_chave, d.mes_da_venda, d.outra_venda, d.motivo, d.conferida_em, d.conferida_por, d.observacao_da_conferencia
    from divergencias d join lojas l on l.id = d.unidade_id join public.vendas v on v.id = d.venda_id
    order by d.conferida_em is not null, d.quando desc nulls last, v.numero desc, d.tipo
    limit 100
  ),
  tempo as (
    select count(*) as emitidas, round(avg(c.minutos))::int as media_minutos, max(c.minutos) as maior_minutos
    from vendas_classificadas c where c.grupo = 'com_nota'
  )
  select jsonb_build_object(
    'inicio', p_inicio, 'fim', p_fim, 'unidade', p_unidade,
    'lojas', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'nome', u.nome) order by u.nome), '[]'::jsonb)
              from public.unidades u where u.id = any (v_permitidas) and u.tipo in ('loja_fisica', 'online')),
    'resumo', (select jsonb_build_object(
        'vendas', coalesce(sum(r.vendas), 0), 'valor_vendas', coalesce(sum(r.valor_vendas), 0),
        'com_nota', coalesce(sum(r.com_nota), 0), 'valor_com_nota', coalesce(sum(r.valor_com_nota), 0),
        'em_andamento', coalesce(sum(r.em_andamento), 0), 'valor_em_andamento', coalesce(sum(r.valor_em_andamento), 0),
        'sem_pedido', coalesce(sum(r.sem_pedido), 0), 'valor_sem_pedido', coalesce(sum(r.valor_sem_pedido), 0),
        'devolvidas_sem_nota', coalesce(sum(r.devolvidas_sem_nota), 0), 'valor_devolvidas_sem_nota', coalesce(sum(r.valor_devolvidas_sem_nota), 0),
        'atrasadas', coalesce(sum(r.atrasadas), 0), 'fora_do_prazo', coalesce(sum(r.fora_do_prazo), 0),
        'notas_emitidas', coalesce(sum(r.notas_emitidas), 0), 'sem_pdf', coalesce(sum(r.sem_pdf), 0), 'sem_xml', coalesce(sum(r.sem_xml), 0),
        'sem_protocolo', coalesce(sum(r.sem_protocolo), 0), 'devolucoes', coalesce(sum(r.devolucoes), 0),
        'devolucoes_emitidas', coalesce(sum(r.devolucoes_emitidas), 0), 'devolucoes_pendentes', coalesce(sum(r.devolucoes_pendentes), 0),
        'devolucoes_canceladas', coalesce(sum(r.devolucoes_canceladas), 0),
        'divergencias', coalesce(sum(r.divergencias), 0), 'divergencias_abertas', coalesce(sum(r.divergencias_abertas), 0)) from por_loja r),
    'por_loja', (select coalesce(jsonb_agg(to_jsonb(r) order by r.nome), '[]'::jsonb) from por_loja r),
    'tempo', (select to_jsonb(t) from tempo t),
    'sem_pedido', (select coalesce(jsonb_agg(to_jsonb(s) order by s.quando, s.numero), '[]'::jsonb) from lista_sem_pedido s),
    'em_andamento', (select coalesce(jsonb_agg(to_jsonb(s) order by s.quando, s.numero), '[]'::jsonb) from lista_em_andamento s),
    'devolucoes_pendentes', (select coalesce(jsonb_agg(to_jsonb(s) order by s.quando, s.numero), '[]'::jsonb) from lista_devolucoes s),
    'sem_documento', (select coalesce(jsonb_agg(to_jsonb(s) order by s.quando, s.numero), '[]'::jsonb) from lista_sem_documento s),
    'divergencias', (select coalesce(jsonb_agg(to_jsonb(s) order by s.conferida_em is not null, s.quando desc nulls last, s.numero desc, s.tipo), '[]'::jsonb)
                     from lista_divergencias s)
  ) into resultado;
  return resultado;
end;
$$;

-- -----------------------------------------------------------------------------
-- A conferência de uma divergência
-- -----------------------------------------------------------------------------
create or replace function public.notas_conferir_divergencia(p_pedido uuid, p_tipo text, p_observacao text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  pedido public.notas_pedidos;
  usuario uuid := (select auth.uid());
  mes_da_chave text;
  existe boolean;
  registrada uuid;
begin
  select * into pedido from public.notas_pedidos p where p.id = p_pedido;
  if not found or usuario is null or not coalesce((select public.tem_permissao('nota.aprovar', pedido.unidade_id)), false) then
    raise exception 'Pedido de nota não encontrado' using errcode = 'P0002';
  end if;
  if p_tipo is null or p_tipo not in ('chave_fora_do_mes', 'numero_repetido', 'devolucao_sem_nota') then
    raise exception 'Tipo de divergência inválido' using errcode = '22023';
  end if;
  if p_observacao is null or length(trim(p_observacao)) not between 10 and 500 then
    raise exception 'Escreva o que foi conferido e o que foi feito (de 10 a 500 letras)' using errcode = '22023';
  end if;
  -- A divergência tem de existir agora (a mesma conta da conciliação; o número repetido, em toda a rede).
  mes_da_chave := '20' || substr(pedido.chave_acesso, 3, 2) || '-' || substr(pedido.chave_acesso, 5, 2);
  existe := case p_tipo
    when 'chave_fora_do_mes' then pedido.situacao = 'emitida'
      and (mes_da_chave < to_char(pedido.venda_concluida_em at time zone 'America/Sao_Paulo', 'YYYY-MM')
           or mes_da_chave > to_char(pedido.emitida_em at time zone 'America/Sao_Paulo', 'YYYY-MM'))
    when 'numero_repetido' then pedido.situacao = 'emitida' and exists (
      select 1 from public.notas_pedidos o
      where o.id <> pedido.id and o.organizacao_id = pedido.organizacao_id and o.situacao = 'emitida'
        and substr(o.chave_acesso, 7, 14) = substr(pedido.chave_acesso, 7, 14) and o.modelo = pedido.modelo
        and o.serie = pedido.serie and o.numero_documento = pedido.numero_documento)
    else pedido.tipo = 'devolucao' and pedido.situacao = 'cancelada'
  end;
  if not coalesce(existe, false) then
    raise exception 'Esta divergência não existe neste pedido (ou já mudou): recarregue a conciliação' using errcode = '22023';
  end if;
  perform set_config('ora.motivo', trim(p_observacao), true);
  insert into public.notas_divergencias_conferidas (organizacao_id, unidade_id, pedido_id, tipo, observacao, conferida_por)
  values (pedido.organizacao_id, pedido.unidade_id, pedido.id, p_tipo, trim(p_observacao), usuario)
  on conflict (pedido_id, tipo) do nothing
  returning id into registrada;
  return registrada is not null;
end;
$$;

revoke all on function public.notas_conciliacao(date, date, uuid), public.notas_conferir_divergencia(uuid, text, text) from public, anon;
grant execute on function public.notas_conciliacao(date, date, uuid), public.notas_conferir_divergencia(uuid, text, text) to authenticated;
