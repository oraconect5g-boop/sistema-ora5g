-- =============================================================================
-- Lote QUAL-a (plano do proprietário de 16/11, Onda 2: ORA-QUAL-006, "aviso fora da tela quando uma fila passa do
-- limite ou uma rotina do banco falha ou atrasa"). Usa o canal do aviso no celular do PWA-b (ADR-014). Decisão: ADR-015.
--
--   * privado.avisos aceita o tipo "alerta": de uma loja (a fila acima do limite, para quem decide nela) ou da rede (a
--     rotina do banco com problema, para quem vê a auditoria da rede inteira: o dono e o administrador). O alerta não tem
--     quem pediu (solicitante nulo); cada tipo tem a sua regra de loja, permissão e quem pediu;
--   * privado.limites_dos_alertas: o limite de cada fila, em minutos (o padrão: desconto 30, nota 240 e saída de caixa
--     30). Reversível: mudar o limite é um update, sem migration;
--   * privado.quem_recebe_aviso_da_rede(organização, permissão): quem tem a permissão pelo vínculo da rede inteira;
--   * privado.alertas_das_filas(): para cada loja, os pedidos que esperam além do limite (desconto pendente, nota
--     aguardando aprovação e saída de caixa pendente) viram um alerta por fila, loja e dia, com quantos esperam; e cada
--     rotina do banco com falha ou atrasada vira um alerta por rotina, organização e dia. Repetir no mesmo dia não manda
--     de novo;
--   * a rotina "alertas_das_filas" (ROT-a, ADR-011), a cada 10 minutos pelo agendador do banco (pg_cron): privado.rodar_rotina
--     ganha a chamada; nada mais muda nela;
--   * public.avisos_a_enviar (a do PWA-b): o alerta da rede vai para quem recebe na rede, e o alerta sem quem pediu vai
--     para todos de quem decide; nada mais muda nela.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

-- 1) A fila dos avisos aceita o alerta.
alter table privado.avisos alter column solicitante_id drop not null;
alter table privado.avisos drop constraint avisos_tipo_check;
alter table privado.avisos add constraint avisos_tipo_check check (tipo in ('desconto', 'nota', 'saida_caixa', 'teste', 'alerta'));
alter table privado.avisos drop constraint avisos_permissao_check;
alter table privado.avisos add constraint avisos_permissao_check
  check (permissao is null or permissao in ('desconto.aprovar', 'nota.aprovar', 'caixa.conferir', 'auditoria.ver'));
alter table privado.avisos drop constraint aviso_teste_sem_loja;
alter table privado.avisos add constraint aviso_de_cada_tipo check (
  case tipo
    when 'teste' then unidade_id is null and permissao is null and solicitante_id is not null
    when 'alerta' then permissao is not null and solicitante_id is null
    else unidade_id is not null and permissao is not null and solicitante_id is not null
  end);

-- 2) O limite de cada fila.
create table privado.limites_dos_alertas (
  fila text primary key check (fila in ('desconto', 'nota', 'saida_caixa')),
  minutos int not null check (minutos between 5 and 10080),
  atualizado_em timestamptz not null default now()
);
alter table privado.limites_dos_alertas enable row level security;
comment on table privado.limites_dos_alertas is
  'QUAL-a: depois de quantos minutos um pedido que espera vira alerta no celular. Acesso só por privado.alertas_das_filas (RLS ligado, sem política).';
revoke all on privado.limites_dos_alertas from public, anon, authenticated;
insert into privado.limites_dos_alertas (fila, minutos) values ('desconto', 30), ('nota', 240), ('saida_caixa', 30);

-- 3) Quem recebe um aviso da rede (sem loja): a pessoa ativa, com vínculo vigente da rede inteira que dá a permissão.
create or replace function privado.quem_recebe_aviso_da_rede(p_organizacao uuid, p_permissao text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct v.usuario_id
  from public.vinculos v
  join public.papeis pa on pa.codigo = v.papel and pa.ativo
  join public.papel_permissoes pp on pp.papel = v.papel and pp.permissao = p_permissao
  join public.organizacoes o on o.id = v.organizacao_id and o.status = 'ativa'
  join public.perfis_usuario pu on pu.id = v.usuario_id and pu.status = 'ativo'
  where v.organizacao_id = p_organizacao and v.escopo = 'organizacao'
    and v.inicio <= now() and (v.fim is null or v.fim > now());
$$;
revoke all on function privado.quem_recebe_aviso_da_rede(uuid, text) from public, anon, authenticated;

-- 4) Os alertas: a fila acima do limite em cada loja e a rotina do banco com problema. Um por fila, loja e dia; um por
--    rotina, organização e dia. Devolve quantos alertas novos entraram na fila.
create or replace function privado.alertas_das_filas()
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  hoje text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
  r record;
  quantos int;
  total int := 0;
  tempo text;
begin
  for r in
    with limite as (select l.fila, l.minutos from privado.limites_dos_alertas l),
    esperando as (
      select 'desconto' as fila, d.organizacao_id, d.unidade_id, count(*) as quantos
      from public.aprovacoes_desconto d join limite l on l.fila = 'desconto'
      where d.situacao = 'pendente' and d.solicitado_em < now() - make_interval(mins => l.minutos)
      group by d.organizacao_id, d.unidade_id
      union all
      select 'nota', n.organizacao_id, n.unidade_id, count(*)
      from public.notas_pedidos n join limite l on l.fila = 'nota'
      where n.situacao = 'aguardando_aprovacao' and n.criado_em < now() - make_interval(mins => l.minutos)
      group by n.organizacao_id, n.unidade_id
      union all
      select 'saida_caixa', s.organizacao_id, s.unidade_id, count(*)
      from public.caixa_saidas s join limite l on l.fila = 'saida_caixa'
      where s.situacao = 'pendente' and s.pedida_em < now() - make_interval(mins => l.minutos)
      group by s.organizacao_id, s.unidade_id
    )
    select e.fila, e.organizacao_id, e.unidade_id, e.quantos, u.nome as loja, l.minutos
    from esperando e
    join public.unidades u on u.id = e.unidade_id and u.status = 'ativa'
    join limite l on l.fila = e.fila
    order by e.fila, u.nome
  loop
    tempo := case when r.minutos % 60 = 0 then (r.minutos / 60) || ' h' else r.minutos || ' min' end;
    insert into privado.avisos (organizacao_id, unidade_id, tipo, alvo_id, solicitante_id, permissao, titulo, corpo, endereco)
    values (r.organizacao_id, r.unidade_id, 'alerta', md5('fila:' || r.fila || ':' || r.unidade_id || ':' || hoje)::uuid, null,
      case r.fila when 'desconto' then 'desconto.aprovar' when 'nota' then 'nota.aprovar' else 'caixa.conferir' end,
      case r.fila when 'desconto' then 'Descontos esperando aprovação' when 'nota' then 'Notas esperando aprovação'
        else 'Saídas de caixa esperando' end,
      left(format('%s: %s esperando há mais de %s', r.loja,
        case r.fila
          when 'desconto' then r.quantos || case when r.quantos = 1 then ' pedido de desconto' else ' pedidos de desconto' end
          when 'nota' then r.quantos || case when r.quantos = 1 then ' pedido de nota' else ' pedidos de nota' end
          else r.quantos || case when r.quantos = 1 then ' saída de caixa' else ' saídas de caixa' end end,
        tempo), 160),
      case r.fila when 'desconto' then '/aprovacoes' when 'nota' then '/notas' else '/caixa' end)
    on conflict (tipo, alvo_id) do nothing;
    get diagnostics quantos = row_count;
    total := total + quantos;
  end loop;

  -- A rotina do banco com problema: a última rodada falhou, ou nenhuma rodada certa no prazo. Vai para cada rede ativa.
  for r in
    with ultima as (
      select distinct on (e.rotina) e.rotina, e.situacao
      from privado.rotinas_execucoes e
      where e.situacao in ('ok', 'falha')
      order by e.rotina, e.iniciada_em desc, e.id desc
    ), certa as (
      select e.rotina, max(e.terminada_em) as quando from privado.rotinas_execucoes e where e.situacao = 'ok' group by e.rotina
    )
    select ro.nome, ro.descricao, (u.situacao = 'falha') as com_falha, c.quando as ultima_certa, o.id as organizacao_id
    from privado.rotinas ro
    left join ultima u on u.rotina = ro.nome
    left join certa c on c.rotina = ro.nome
    cross join public.organizacoes o
    where o.status = 'ativa' and ro.nome <> 'alertas_das_filas'
      and (u.situacao = 'falha' or coalesce(c.quando, ro.criada_em) < now() - ro.atrasada_apos)
  loop
    insert into privado.avisos (organizacao_id, unidade_id, tipo, alvo_id, solicitante_id, permissao, titulo, corpo, endereco)
    values (r.organizacao_id, null, 'alerta', md5('rotina:' || r.nome || ':' || r.organizacao_id || ':' || hoje)::uuid, null,
      'auditoria.ver',
      case when r.com_falha then 'Rotina do banco com falha' else 'Rotina do banco atrasada' end,
      left(format('%s: %s', r.descricao, case when r.ultima_certa is null then 'ainda sem rodada certa'
        else 'última rodada certa em ' || to_char(r.ultima_certa at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') end), 160),
      '/operacao')
    on conflict (tipo, alvo_id) do nothing;
    get diagnostics quantos = row_count;
    total := total + quantos;
  end loop;
  return total;
end;
$$;
revoke all on function privado.alertas_das_filas() from public, anon, authenticated;

-- 5) A rotina "alertas_das_filas" no catálogo e na execução (privado.rodar_rotina, a do ROT-a, com a chamada nova).
insert into privado.rotinas (nome, descricao, frequencia, atrasada_apos) values
  ('alertas_das_filas', 'Alertas de fila acima do limite e de rotina com problema', 'a cada 10 minutos', interval '40 minutes');

create or replace function privado.rodar_rotina(p_rotina text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_inicio timestamptz := clock_timestamp();
  v_quantidade int;
  v_erro text;
begin
  if p_rotina is null or not exists (select 1 from privado.rotinas r where r.nome = p_rotina) then
    raise exception 'Rotina desconhecida' using errcode = '22023';
  end if;
  -- Uma rodada por vez de cada rotina; a que chega enquanto outra roda fica registrada como pulada.
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('ora5g.rotina.' || p_rotina, 0)) then
    insert into privado.rotinas_execucoes (rotina, iniciada_em, terminada_em, situacao)
    values (p_rotina, v_inicio, clock_timestamp(), 'pulada');
    return 'pulada';
  end if;
  begin
    case p_rotina
      when 'reservas_vencidas' then v_quantidade := privado.expirar_reservas();
      when 'limpeza_dos_registros' then v_quantidade := privado.limpar_registros_das_rotinas();
      when 'alertas_das_filas' then v_quantidade := privado.alertas_das_filas();
      else raise exception 'Rotina sem execução' using errcode = '22023';
    end case;
  exception when others or query_canceled then
    -- O que a rotina fez nesta rodada é desfeito; fica o registro da falha, só com o código. O tempo esgotado
    -- (query_canceled, que o "others" não pega) também fica registrado.
    get stacked diagnostics v_erro = returned_sqlstate;
    v_quantidade := null;
  end;
  insert into privado.rotinas_execucoes (rotina, iniciada_em, terminada_em, situacao, quantidade, erro)
  values (p_rotina, v_inicio, clock_timestamp(), case when v_erro is null then 'ok' else 'falha' end, v_quantidade, v_erro);
  return case when v_erro is null then 'ok' else 'falha' end;
end;
$$;

revoke all on function privado.rodar_rotina(text) from public, anon, authenticated;

-- 6) O envio (public.avisos_a_enviar, a do PWA-b): o alerta da rede e o alerta sem quem pediu.
create or replace function public.avisos_a_enviar(p_segredo text, p_limite int default 20)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a privado.avisos;
  ainda_espera boolean;
  inscricoes jsonb;
  lote jsonb := '[]'::jsonb;
begin
  if not privado.segredo_confere('avisos_no_celular', p_segredo) then
    raise exception 'Segredo dos avisos não confere' using errcode = '42501';
  end if;
  for a in
    with escolhidos as (
      select x.id from privado.avisos x
      where (x.situacao = 'pendente' or (x.situacao = 'enviando' and x.reservado_ate < now()))
        and x.tentativas < 5 and x.criado_em > now() - interval '1 day'
      order by x.criado_em, x.id
      limit least(greatest(coalesce(p_limite, 20), 1), 100)
      for update skip locked
    )
    update privado.avisos x set situacao = 'enviando', reservado_ate = now() + interval '2 minutes', tentativas = x.tentativas + 1
    from escolhidos e where x.id = e.id
    returning x.*
  loop
    -- O pedido já decidido não vira aviso.
    ainda_espera := case a.tipo
      when 'desconto' then exists (select 1 from public.aprovacoes_desconto d where d.id = a.alvo_id and d.situacao = 'pendente')
      when 'nota' then exists (select 1 from public.notas_pedidos n where n.id = a.alvo_id and n.situacao = 'aguardando_aprovacao')
      when 'saida_caixa' then exists (select 1 from public.caixa_saidas s where s.id = a.alvo_id and s.situacao = 'pendente')
      else true end;
    if not ainda_espera then
      update privado.avisos x set situacao = 'dispensado', reservado_ate = null where x.id = a.id;
      continue;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'endpoint', i.endpoint, 'p256dh', i.p256dh, 'auth', i.auth) order by i.criada_em), '[]'::jsonb)
    into inscricoes
    from privado.avisos_inscricoes i
    where (a.tipo = 'teste' and i.usuario_id = a.solicitante_id)
       or (a.tipo <> 'teste' and (a.solicitante_id is null or i.usuario_id <> a.solicitante_id)
           and ((a.unidade_id is not null and i.usuario_id in (select privado.quem_recebe_aviso(a.unidade_id, a.permissao)))
             -- QUAL-a: o alerta da rede (rotina do banco com problema) vai para quem tem a permissão na rede inteira.
             or (a.unidade_id is null and i.usuario_id in (select privado.quem_recebe_aviso_da_rede(a.organizacao_id, a.permissao)))));
    if jsonb_array_length(inscricoes) = 0 then
      update privado.avisos x set situacao = 'sem_destino', reservado_ate = null where x.id = a.id;
      continue;
    end if;
    lote := lote || jsonb_build_object('id', a.id, 'tipo', a.tipo, 'titulo', a.titulo, 'corpo', a.corpo, 'endereco', a.endereco,
      'inscricoes', inscricoes);
  end loop;
  return lote;
end;
$$;

-- 7) O agendamento (horário do agendador: UTC). Agendar de novo pelo nome só atualiza.
select cron.schedule('ora5g-alertas-das-filas', '*/10 * * * *', 'select privado.rodar_rotina(''alertas_das_filas'')');
