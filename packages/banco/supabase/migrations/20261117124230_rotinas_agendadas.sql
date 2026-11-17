-- =============================================================================
-- Rotinas agendadas no próprio banco (lote ROT-a: ORA-INV-005, ORA-ONLINE-006 e ORA-QUAL-006, em parte; ADR-011;
-- plano de 16/11/2026, onda 0, item 3)
--
-- Até aqui nenhuma rotina rodava sozinha: a reserva vencida (do PDV ou do site) só saía quando alguém reservava de
-- novo o mesmo item, transferia, ou abria o PDV da loja. Agora o agendador do Supabase (a extensão pg_cron) chama as
-- rotinas, e cada rodada fica registrada:
--
-- 1) privado.rotinas: o catálogo (nome, o que faz, a frequência por extenso e depois de quanto tempo sem uma rodada
--    certa ela conta como atrasada).
-- 2) privado.rotinas_execucoes: uma linha por rodada, com o início, o fim, a situação (certa, com falha ou pulada),
--    quantos itens ela tratou e, na falha, só o código do erro (nada de mensagem, que pode trazer dado).
-- 3) privado.rodar_rotina(nome): roda a rotina e registra. A falha é pega e registrada (o que a rotina fez é desfeito,
--    o registro fica). Uma segunda rodada da mesma rotina ao mesmo tempo não roda: fica registrada como pulada.
-- 4) As rotinas: "reservas_vencidas", a cada 5 minutos, chama privado.expirar_reservas() sem filtro, que já era a
--    rotina (ADR-003): vence as reservas do PDV e do site e não espera item ocupado por outra transação, que fica para
--    a rodada seguinte. "limpeza_dos_registros", todo dia às 03:30 de São Paulo, apaga as rodadas certas e puladas com
--    mais de 30 dias, as falhas com mais de 90 e o histórico do agendador destas rotinas com mais de 7 dias (o pg_cron
--    não apaga o próprio histórico).
-- 5) public.rotinas_situacao(): para quem vê a Saúde da operação (venda.ver_unidade ou venda.ver_todas na loja do
--    turno), cada rotina com a última rodada certa, a última falha e a situação: em dia, atrasada, com falha ou
--    aguardando a primeira rodada. As rotinas são do sistema, não de uma empresa: a lista é a mesma para todos.
-- 6) O agendamento das duas tarefas pelo nome (agendar de novo só atualiza). O horário do agendador é o UTC.
--
-- Fica de fora a limpeza das fotos: ela apaga arquivos no Storage, o que pede a API do Storage e a chave secreta, fora
-- do banco. Continua pelo cartão "Arquivos sem registro" das fotos em lote.
-- Reversão: supabase/reversao/<mesmo nome>.sql (tira as tarefas, as funções e as tabelas; a extensão fica).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- O agendador. No Supabase, a extensão pg_cron (cria o esquema cron), com as permissões que a documentação do Supabase
-- pede. Nos testes, o Supabase simulado já traz um esquema cron sem relógio. Sem nenhum dos dois, a migration para
-- aqui: sem agendador, as rotinas não rodariam.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    grant usage on schema cron to postgres;
    grant all privileges on all tables in schema cron to postgres;
  elsif not exists (select 1 from pg_catalog.pg_namespace where nspname = 'cron') then
    raise exception 'O agendador do banco (pg_cron) não está disponível';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- O catálogo e o registro das rodadas (acesso só por função)
-- -----------------------------------------------------------------------------
create table privado.rotinas (
  nome text primary key check (nome ~ '^[a-z][a-z_]{2,39}$'),
  descricao text not null check (length(descricao) between 3 and 120),
  frequencia text not null check (length(frequencia) between 3 and 60),
  atrasada_apos interval not null check (atrasada_apos > interval '0'),
  criada_em timestamptz not null default now()
);
alter table privado.rotinas enable row level security;
revoke all on privado.rotinas from public, anon, authenticated;
comment on table privado.rotinas is
  'Rotinas agendadas no banco (ROT-a, ADR-011); lidas só pelas funções privado.rodar_rotina e public.rotinas_situacao.';

create table privado.rotinas_execucoes (
  id bigint generated always as identity primary key,
  rotina text not null references privado.rotinas (nome),
  iniciada_em timestamptz not null,
  terminada_em timestamptz not null,
  situacao text not null check (situacao in ('ok', 'falha', 'pulada')),
  quantidade int check (quantidade >= 0),
  erro text check (erro ~ '^[0-9A-Z]{5}$'),
  check (terminada_em >= iniciada_em),
  check ((situacao = 'falha') = (erro is not null)),
  check (situacao = 'ok' or quantidade is null)
);
create index rotinas_execucoes_da_rotina on privado.rotinas_execucoes (rotina, iniciada_em desc);
alter table privado.rotinas_execucoes enable row level security;
revoke all on privado.rotinas_execucoes from public, anon, authenticated;
comment on table privado.rotinas_execucoes is
  'Uma linha por rodada das rotinas agendadas (ROT-a, ADR-011); escrita só por privado.rodar_rotina, lida só por public.rotinas_situacao; a limpeza diária apaga as antigas.';

insert into privado.rotinas (nome, descricao, frequencia, atrasada_apos) values
  ('reservas_vencidas', 'Vencimento das reservas (PDV e site)', 'a cada 5 minutos', interval '20 minutes'),
  ('limpeza_dos_registros', 'Limpeza do registro das rotinas', 'todo dia às 03:30', interval '26 hours');

-- -----------------------------------------------------------------------------
-- A limpeza do registro: o nosso (certas e puladas com mais de 30 dias, falhas com mais de 90) e o do agendador, só
-- das tarefas destas rotinas, com mais de 7 dias. Devolve quantas linhas saíram.
-- -----------------------------------------------------------------------------
create or replace function privado.limpar_registros_das_rotinas()
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nossas int;
  v_do_agendador int;
begin
  delete from privado.rotinas_execucoes e
  where (e.situacao <> 'falha' and e.iniciada_em < now() - interval '30 days')
     or (e.situacao = 'falha' and e.iniciada_em < now() - interval '90 days');
  get diagnostics v_nossas = row_count;
  delete from cron.job_run_details d
  where d.jobid in (select j.jobid from cron.job j where j.jobname like 'ora5g-%')
    and d.end_time < now() - interval '7 days';
  get diagnostics v_do_agendador = row_count;
  return v_nossas + v_do_agendador;
end;
$$;
revoke all on function privado.limpar_registros_das_rotinas() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Rodar uma rotina e registrar a rodada. Quem chama é o agendador (o comando de cada tarefa).
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- A situação das rotinas, para a Saúde da operação (o dono e a gerência). Com falha: a última rodada que terminou
-- falhou. Atrasada: nenhuma rodada certa no prazo (contado da criação, se nunca rodou). Aguardando: criada há pouco e
-- ainda sem rodada. Em dia: o resto.
-- -----------------------------------------------------------------------------
create or replace function public.rotinas_situacao()
returns table (nome text, descricao text, frequencia text, situacao text, ultima_ok timestamptz, ultima_falha timestamptz, erro text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_unidade uuid := (select public.unidade_atual());
begin
  if v_unidade is null
     or not ((select public.tem_permissao('venda.ver_unidade', v_unidade)) or (select public.tem_permissao('venda.ver_todas', v_unidade))) then
    raise exception 'Sem permissão para ver a saúde da operação' using errcode = '42501';
  end if;
  return query
  with ultima as (
    select distinct on (e.rotina) e.rotina, e.situacao, e.erro
    from privado.rotinas_execucoes e
    where e.situacao in ('ok', 'falha')
    order by e.rotina, e.iniciada_em desc, e.id desc
  ), datas as (
    select e.rotina,
      max(e.terminada_em) filter (where e.situacao = 'ok') as certa,
      max(e.terminada_em) filter (where e.situacao = 'falha') as falha
    from privado.rotinas_execucoes e
    group by e.rotina
  )
  select r.nome, r.descricao, r.frequencia,
    case
      when u.situacao = 'falha' then 'com_falha'
      when coalesce(d.certa, r.criada_em) < now() - r.atrasada_apos then 'atrasada'
      when d.certa is null then 'aguardando'
      else 'em_dia'
    end,
    d.certa, d.falha, case when u.situacao = 'falha' then u.erro end
  from privado.rotinas r
  left join ultima u on u.rotina = r.nome
  left join datas d on d.rotina = r.nome
  order by r.nome;
end;
$$;
revoke all on function public.rotinas_situacao() from public, anon;
grant execute on function public.rotinas_situacao() to authenticated;

-- -----------------------------------------------------------------------------
-- O agendamento (horário do agendador: UTC; 06:30 UTC são 03:30 em São Paulo). Agendar de novo pelo nome só atualiza.
-- -----------------------------------------------------------------------------
select cron.schedule('ora5g-reservas-vencidas', '*/5 * * * *', 'select privado.rodar_rotina(''reservas_vencidas'')');
select cron.schedule('ora5g-limpeza-dos-registros', '30 6 * * *', 'select privado.rodar_rotina(''limpeza_dos_registros'')');
