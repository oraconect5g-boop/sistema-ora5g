-- =============================================================================
-- Lote FIN-007a (ORA-FIN-007, a primeira parte: "gestão de inadimplência e cobranças autorizadas", e o vencimento do
-- ORA-FIN-003): o que as financeiras devem e já passou do prazo, e as cobranças feitas, com auditoria.
--
-- Quem deve à loja, hoje, são as financeiras (PayJoy e Aiva): a venda financiada gera a conta a receber, que fica aberta
-- até o repasse ser registrado. O sistema mostrava a idade de cada conta, mas não dizia o que estava ATRASADO, porque o
-- prazo do repasse é do contrato de cada financeira (a pergunta P8 ao proprietário) e ninguém tinha onde gravá-lo.
-- Nada de prazo é inventado aqui:
--
--   1) public.prazos_de_repasse: o prazo de cada financeira, em dias corridos desde a venda, gravado por quem concilia
--      pela rede inteira (o dono), com o motivo. Só de inserção: cada mudança é uma linha nova; vale a mais recente; a
--      linha sem dias retira o prazo. Sem prazo, nenhuma conta é chamada de atrasada.
--   2) public.cobrancas_de_repasse: cada cobrança feita à financeira por uma conta em aberto (o canal, o resumo, o
--      protocolo e a data combinada para voltar ao assunto), por quem concilia na loja da venda. Só de inserção, auditada.
--   3) public.prazo_de_repasse_definir e public.cobranca_de_repasse_registrar: os únicos caminhos de escrita.
--   4) public.repasses_atrasados: as contas em aberto das lojas de quem concilia, com o vencimento (o dia da venda mais
--      o prazo em vigor), os dias de atraso, as cobranças de cada uma e os totais (atrasado, no prazo, sem prazo).
--
-- O vencimento é calculado na leitura, com o prazo em vigor: mudar o prazo muda o que está atrasado, e nada é regravado.
-- A cobrança é à financeira, uma empresa: não há dado pessoal de cliente nem mensagem enviada pelo sistema. A cobrança
-- ao cliente final não existe porque a loja não vende a prazo próprio (decisão D-013, pendente).
-- Códigos: 42501 sem permissão; P0002 conta que não é da pessoa; 22023 dado inválido; OR004 chave já usada em outra cobrança.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) O prazo de repasse de cada financeira
-- -----------------------------------------------------------------------------
create table public.prazos_de_repasse (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes (id),
  devedor text not null check (devedor in ('payjoy', 'aiva')),
  -- Nulo: o prazo foi retirado, e as contas voltam a "sem prazo definido".
  dias int check (dias between 1 and 180),
  motivo text not null check (length(motivo) between 3 and 200 and motivo = btrim(motivo)),
  definido_por uuid not null references public.perfis_usuario (id),
  -- O relógio de verdade, e não o começo da transação: duas mudanças seguidas ficam na ordem em que foram feitas.
  criado_em timestamptz not null default clock_timestamp()
);
comment on table public.prazos_de_repasse is
  'FIN-007a: o prazo de repasse de cada financeira (dias corridos desde a venda), definido pelo dono. Só de inserção: vale a linha mais recente; sem dias, o prazo foi retirado.';
create index prazos_de_repasse_em_vigor on public.prazos_de_repasse (organizacao_id, devedor, criado_em desc);
create index prazos_de_repasse_definido_por on public.prazos_de_repasse (definido_por);
create trigger prazos_de_repasse_auditar after insert on public.prazos_de_repasse
  for each row execute function privado.auditar_mudanca();
create trigger prazos_de_repasse_sem_alteracao before update or delete on public.prazos_de_repasse
  for each row execute function privado.so_insercao();

alter table public.prazos_de_repasse enable row level security;
revoke all on public.prazos_de_repasse from anon, authenticated;
grant select on public.prazos_de_repasse to authenticated;
-- Lê quem concilia em alguma loja da rede (o dono e o gerente).
create policy prazos_de_repasse_ler on public.prazos_de_repasse for select to authenticated
  using (organizacao_id in (select u.organizacao_id from public.unidades u where u.id in (select privado.unidades_com_permissao('pagamento.conciliar'))));

-- -----------------------------------------------------------------------------
-- 2) As cobranças feitas à financeira
-- -----------------------------------------------------------------------------
create table public.cobrancas_de_repasse (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  unidade_id uuid not null,
  conta_id uuid not null references public.contas_a_receber (id),
  canal text not null check (canal in ('telefone', 'email', 'portal', 'whatsapp', 'presencial', 'outro')),
  resumo text not null check (length(resumo) between 3 and 500 and resumo = btrim(resumo)),
  protocolo text check (protocolo is null or (length(protocolo) between 1 and 80 and protocolo = btrim(protocolo))),
  retornar_em date,
  chave text not null check (length(chave) between 1 and 200 and chave = btrim(chave)),
  conteudo text not null,
  registrado_por uuid not null references public.perfis_usuario (id),
  criado_em timestamptz not null default clock_timestamp(),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id),
  unique (organizacao_id, chave)
);
comment on table public.cobrancas_de_repasse is
  'FIN-007a: cada cobrança feita à financeira por uma conta a receber em aberto (canal, resumo, protocolo e a data para voltar ao assunto). Só de inserção.';
create index cobrancas_de_repasse_conta on public.cobrancas_de_repasse (conta_id, criado_em desc);
create index cobrancas_de_repasse_unidade on public.cobrancas_de_repasse (unidade_id, organizacao_id);
create index cobrancas_de_repasse_registrado_por on public.cobrancas_de_repasse (registrado_por);
create trigger cobrancas_de_repasse_auditar after insert on public.cobrancas_de_repasse
  for each row execute function privado.auditar_mudanca();
create trigger cobrancas_de_repasse_sem_alteracao before update or delete on public.cobrancas_de_repasse
  for each row execute function privado.so_insercao();

alter table public.cobrancas_de_repasse enable row level security;
revoke all on public.cobrancas_de_repasse from anon, authenticated;
grant select on public.cobrancas_de_repasse to authenticated;
-- Lê quem concilia na loja da conta.
create policy cobrancas_de_repasse_ler on public.cobrancas_de_repasse for select to authenticated
  using (unidade_id in (select privado.unidades_com_permissao('pagamento.conciliar')));

-- -----------------------------------------------------------------------------
-- 3) Definir o prazo (o dono) e registrar a cobrança (quem concilia na loja)
-- -----------------------------------------------------------------------------
create or replace function public.prazo_de_repasse_definir(p_devedor text, p_dias integer, p_motivo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := (select u.organizacao_id from public.unidades u where u.id = (select public.unidade_atual()));
  v_motivo text := regexp_replace(btrim(coalesce(p_motivo, '')), '\s+', ' ', 'g');
  v_atual public.prazos_de_repasse;
begin
  -- O prazo vale para a rede inteira: só quem concilia pela rede (papel de organização) o define.
  if v_org is null or v_org not in (select privado.organizacoes_com_permissao('pagamento.conciliar')) then
    raise exception 'O prazo de repasse é definido por quem concilia pela rede inteira' using errcode = '42501';
  end if;
  if p_devedor is null or p_devedor not in ('payjoy', 'aiva') then
    raise exception 'Financeira desconhecida' using errcode = '22023';
  end if;
  if p_dias is not null and p_dias not between 1 and 180 then
    raise exception 'O prazo vai de 1 a 180 dias corridos' using errcode = '22023';
  end if;
  if length(v_motivo) not between 3 and 200 then
    raise exception 'Informe o motivo (de 3 a 200 letras): de onde veio o prazo' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(privado.trava_da_chave('prazos_de_repasse', v_org, p_devedor));
  select * into v_atual from public.prazos_de_repasse p
  where p.organizacao_id = v_org and p.devedor = p_devedor
  order by p.criado_em desc, p.id desc limit 1;
  -- O mesmo prazo de novo não grava outra linha (nem o "sem prazo" de quem nunca teve).
  if (v_atual.id is null and p_dias is null) or (v_atual.id is not null and v_atual.dias is not distinct from p_dias) then
    return jsonb_build_object('devedor', p_devedor, 'dias', p_dias, 'repetida', true);
  end if;
  perform set_config('ora.motivo', 'Prazo de repasse da financeira: ' || v_motivo, true);
  insert into public.prazos_de_repasse (organizacao_id, devedor, dias, motivo, definido_por)
  values (v_org, p_devedor, p_dias, v_motivo, (select auth.uid()));
  return jsonb_build_object('devedor', p_devedor, 'dias', p_dias, 'repetida', false);
end;
$$;

create or replace function public.cobranca_de_repasse_registrar(
  p_conta uuid, p_canal text, p_resumo text, p_protocolo text, p_retornar_em date, p_chave text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c public.contas_a_receber;
  v_venda public.vendas;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_resumo text := regexp_replace(btrim(coalesce(p_resumo, '')), '\s+', ' ', 'g');
  v_protocolo text := nullif(regexp_replace(btrim(coalesce(p_protocolo, '')), '\s+', ' ', 'g'), '');
  v_chave text := btrim(coalesce(p_chave, ''));
  v_conteudo text;
  v_existente public.cobrancas_de_repasse;
  v_id uuid;
begin
  select * into v_c from public.contas_a_receber c where c.id = p_conta;
  select * into v_venda from public.vendas v where v.id = v_c.venda_id;
  if v_c.id is null or not public.tem_permissao('pagamento.conciliar', v_venda.unidade_id) then
    raise exception 'Conta a receber não encontrada para você' using errcode = 'P0002';
  end if;
  if length(v_chave) not between 1 and 200 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  if p_canal is null or p_canal not in ('telefone', 'email', 'portal', 'whatsapp', 'presencial', 'outro') then
    raise exception 'Diga por onde a cobrança foi feita' using errcode = '22023';
  end if;
  if length(v_resumo) not between 3 and 500 then
    raise exception 'Conte o que foi combinado (de 3 a 500 letras)' using errcode = '22023';
  end if;
  if v_protocolo is not null and length(v_protocolo) > 80 then
    raise exception 'O protocolo tem até 80 letras' using errcode = '22023';
  end if;
  if p_retornar_em is not null and (p_retornar_em < v_hoje or p_retornar_em > v_hoje + 365) then
    raise exception 'A data para voltar ao assunto vai de hoje a um ano' using errcode = '22023';
  end if;
  v_conteudo := md5(concat_ws('|', p_conta, p_canal, v_resumo, coalesce(v_protocolo, ''), coalesce(p_retornar_em::text, '')));

  -- A chave: a repetição devolve a mesma cobrança; a mesma chave com outro conteúdo é recusada.
  perform pg_advisory_xact_lock(privado.trava_da_chave('cobrancas_de_repasse', v_c.organizacao_id, v_chave));
  select * into v_existente from public.cobrancas_de_repasse k where k.organizacao_id = v_c.organizacao_id and k.chave = v_chave;
  if found then
    if v_existente.conteudo <> v_conteudo or v_existente.registrado_por <> (select auth.uid()) then
      raise exception 'Chave de idempotência já usada em outra cobrança' using errcode = 'OR004';
    end if;
    return jsonb_build_object('id', v_existente.id, 'repetida', true);
  end if;
  -- Só a conta em aberto se cobra: a recebida já caiu, e a cancelada não é devida.
  if v_c.situacao <> 'aberta' then
    raise exception 'Só se cobra conta em aberto' using errcode = '22023';
  end if;
  perform set_config('ora.motivo', 'Cobrança do repasse da venda nº ' || v_venda.numero, true);
  insert into public.cobrancas_de_repasse (organizacao_id, unidade_id, conta_id, canal, resumo, protocolo, retornar_em, chave, conteudo, registrado_por)
  values (v_c.organizacao_id, v_venda.unidade_id, v_c.id, p_canal, v_resumo, v_protocolo, p_retornar_em, v_chave, v_conteudo, (select auth.uid()))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'repetida', false);
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) A leitura: o que está atrasado, o que está no prazo e o que não tem prazo
-- -----------------------------------------------------------------------------
create or replace function public.repasses_atrasados(p_unidade uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_org uuid := (select u.organizacao_id from public.unidades u where u.id = (select public.unidade_atual()));
  lojas uuid[];
  resultado jsonb;
begin
  select coalesce(array_agg(x.id), '{}') into lojas
  from (select u as id from privado.unidades_com_permissao('pagamento.conciliar') u) x
  where p_unidade is null or x.id = p_unidade;
  if cardinality(lojas) = 0 then
    raise exception 'Os repasses atrasados são de quem concilia os pagamentos da loja ou da rede' using errcode = '42501';
  end if;

  with
  -- O prazo em vigor de cada financeira, por rede: a linha mais recente (a que não tem dias retirou o prazo).
  prazo as (
    select distinct on (p.organizacao_id, p.devedor) p.organizacao_id, p.devedor, p.dias, p.criado_em
    from public.prazos_de_repasse p
    order by p.organizacao_id, p.devedor, p.criado_em desc, p.id desc
  ),
  aberta as (
    select c.id, c.venda_id, v.numero as venda_numero, v.unidade_id, u.nome as unidade_nome, c.devedor, c.valor_centavos as valor, v.concluida_em,
      v_hoje - (v.concluida_em at time zone 'America/Sao_Paulo')::date as dias,
      p.dias as prazo,
      (v.concluida_em at time zone 'America/Sao_Paulo')::date + p.dias as vencimento
    from public.contas_a_receber c
    join public.vendas v on v.id = c.venda_id
    join public.unidades u on u.id = v.unidade_id
    left join prazo p on p.organizacao_id = c.organizacao_id and p.devedor = c.devedor
    where c.situacao = 'aberta' and v.unidade_id = any (lojas)
  ),
  conta as (
    select a.*,
      case when a.vencimento is null then null else greatest(v_hoje - a.vencimento, 0) end as atraso,
      case when a.vencimento is null then 'sem_prazo' when a.vencimento < v_hoje then 'atrasada' else 'no_prazo' end as estado
    from aberta a
  ),
  cobranca as (
    select k.conta_id, count(*) as quantidade,
      jsonb_agg(jsonb_build_object(
        'id', k.id, 'quando', k.criado_em, 'canal', k.canal, 'resumo', k.resumo, 'protocolo', k.protocolo, 'retornar_em', k.retornar_em,
        'por', (select f.nome from public.perfis_usuario f where f.id = k.registrado_por)
      ) order by k.criado_em desc, k.id desc) as historico
    from public.cobrancas_de_repasse k
    where k.conta_id in (select c.id from conta c)
    group by k.conta_id
  )
  select jsonb_build_object(
    'hoje', v_hoje,
    -- O prazo de cada financeira na rede da loja do turno, e se quem lê pode mudá-lo.
    'prazos', (
      select jsonb_agg(jsonb_build_object('devedor', d.devedor, 'dias', p.dias, 'definido_em', case when p.dias is null then null else p.criado_em end) order by d.devedor)
      from (values ('aiva'), ('payjoy')) d (devedor)
      left join prazo p on p.organizacao_id = v_org and p.devedor = d.devedor),
    'pode_definir_prazo', v_org is not null and v_org in (select privado.organizacoes_com_permissao('pagamento.conciliar')),
    'totais', (
      select jsonb_build_object(
        'atrasadas', count(*) filter (where c.estado = 'atrasada'), 'valor_atrasado', coalesce(sum(c.valor) filter (where c.estado = 'atrasada'), 0),
        'no_prazo', count(*) filter (where c.estado = 'no_prazo'), 'valor_no_prazo', coalesce(sum(c.valor) filter (where c.estado = 'no_prazo'), 0),
        'sem_prazo', count(*) filter (where c.estado = 'sem_prazo'), 'valor_sem_prazo', coalesce(sum(c.valor) filter (where c.estado = 'sem_prazo'), 0),
        'maior_atraso', coalesce(max(c.atraso), 0))
      from conta c),
    'por_loja', coalesce((
      select jsonb_agg(jsonb_build_object('unidade_id', x.unidade_id, 'nome', x.unidade_nome, 'abertas', x.abertas, 'atrasadas', x.atrasadas, 'valor_atrasado', x.valor_atrasado)
                       order by x.valor_atrasado desc, x.unidade_nome)
      from (select c.unidade_id, c.unidade_nome, count(*) as abertas, count(*) filter (where c.estado = 'atrasada') as atrasadas,
              coalesce(sum(c.valor) filter (where c.estado = 'atrasada'), 0) as valor_atrasado
            from conta c group by c.unidade_id, c.unidade_nome) x), '[]'::jsonb),
    'contas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'venda_id', c.venda_id, 'venda_numero', c.venda_numero, 'unidade_id', c.unidade_id, 'unidade_nome', c.unidade_nome,
        'devedor', c.devedor, 'valor', c.valor, 'concluida_em', c.concluida_em, 'dias', c.dias, 'prazo', c.prazo, 'vencimento', c.vencimento,
        'atraso', c.atraso, 'estado', c.estado, 'cobrancas', coalesce(k.quantidade, 0), 'historico', coalesce(k.historico, '[]'::jsonb)
      -- As atrasadas primeiro, da mais atrasada para a menos; depois as que vencem antes; por fim as sem prazo, da mais antiga.
      ) order by case c.estado when 'atrasada' then 0 when 'no_prazo' then 1 else 2 end, c.atraso desc nulls last, c.vencimento nulls last, c.concluida_em, c.id)
      from conta c left join cobranca k on k.conta_id = c.id), '[]'::jsonb)
  ) into resultado;
  return resultado;
end;
$$;

comment on function public.prazo_de_repasse_definir(text, integer, text) is
  'FIN-007a: define (ou retira, sem dias) o prazo de repasse de uma financeira, em dias corridos desde a venda. Só quem concilia pela rede inteira. Grava uma linha nova; o mesmo prazo de novo não grava.';
comment on function public.cobranca_de_repasse_registrar(uuid, text, text, text, date, text) is
  'FIN-007a: registra uma cobrança feita à financeira por uma conta a receber em aberto. Para quem concilia na loja da venda. A repetição com a mesma chave devolve a mesma cobrança.';
comment on function public.repasses_atrasados(uuid) is
  'FIN-007a: as contas a receber das financeiras em aberto, com o vencimento pelo prazo em vigor, os dias de atraso, as cobranças de cada uma e os totais. Para quem concilia na loja ou na rede. Só lê.';

revoke all on function public.prazo_de_repasse_definir(text, integer, text) from public, anon;
revoke all on function public.cobranca_de_repasse_registrar(uuid, text, text, text, date, text) from public, anon;
revoke all on function public.repasses_atrasados(uuid) from public, anon;
grant execute on function public.prazo_de_repasse_definir(text, integer, text) to authenticated;
grant execute on function public.cobranca_de_repasse_registrar(uuid, text, text, text, date, text) to authenticated;
grant execute on function public.repasses_atrasados(uuid) to authenticated;
