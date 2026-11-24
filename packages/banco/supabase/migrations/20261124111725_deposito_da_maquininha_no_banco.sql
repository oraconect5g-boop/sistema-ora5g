-- =============================================================================
-- Lote FIN-006a (a fila do prompt de 23/11, área G; ORA-FIN-006: "conciliação bancária e contas multiempresa; imports e
-- matches reproduzíveis com aprovação"). Decisão: ADR-016, adendo de 24/11.
--
-- O que faltava (ADR-016, "o que fica de fora", item 2): o depósito agrupado da maquininha no banco. A maquininha (PicPay,
-- PagBank) junta as vendas e deposita de uma vez: um crédito no extrato do banco para vários pagamentos. Hoje esse crédito
-- sai da conta com o motivo, e ninguém confere se o depósito bateu com o que o extrato da maquininha disse que ia cair.
--
-- O depósito é tratado como o repasse dos marketplaces (ADR-018): o conjunto dos pagamentos da mesma maquininha com o
-- dinheiro para o mesmo dia (a data em que o dinheiro cai, gravada na conciliação pelo extrato da maquininha, L7a e EXT-a),
-- e o esperado é a soma do líquido deles. Casar é dizer "esta linha de crédito do extrato do banco é este depósito":
--   * public.maquininha_depositos: o depósito casado com a linha, com os pagamentos e o esperado no momento de casar, o
--     recebido (o valor da linha) e o motivo, obrigatório quando o recebido não é o esperado. Uma linha casa com um depósito
--     só, e um depósito com uma linha só;
--   * a linha ganha o uso "deposito" (a regra de um uso só, AUD-c): não concilia venda, não é repasse, não sai da conta e
--     só se solta desfazendo o depósito; os gatilhos valem para qualquer caminho;
--   * public.maquininha_depositos_painel(início, fim): os depósitos do período (pela data do dinheiro), com os pagamentos,
--     o esperado, o casado e, se ainda não casou, as linhas de crédito do extrato do banco da rede que podem ser ele (do dia
--     até 3 dias depois, livres, o mesmo valor primeiro); e os pagamentos dos mesmos meios ainda sem conciliação;
--   * public.maquininha_deposito_casar e public.maquininha_deposito_desfazer: casar (com o motivo, se diverge) e desfazer
--     (sempre com o motivo; a auditoria guarda o que era).
-- Quem: quem concilia pela rede inteira (o extrato do banco da rede e os pagamentos de todas as lojas): o dono.
-- A maquininha e os meios: PicPay (Pix e cartão na maquininha PicPay) e PagBank (cartão na maquininha PagSeguro). O Pix
-- direto cai na conta um a um e se concilia linha a linha, como já era.
-- Nada é suposto do arquivo do banco: quem casa escolhe a linha, e a diferença fica registrada com o motivo.
-- Fica de fora: a conferência com o saldo final que o arquivo do banco traz (o OFX real).
-- Códigos: OR045 a linha já é de outro depósito, ou o depósito já tem linha; OR046 a linha já tem outro uso.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

alter table public.extrato_linhas drop constraint extrato_linhas_situacao_check;
alter table public.extrato_linhas add constraint extrato_linhas_situacao_check
  check (situacao in ('pendente', 'conciliada', 'ignorada', 'repasse', 'estorno', 'deposito'));
comment on column public.extrato_linhas.situacao is
  'O uso da linha, um só (AUD-c, PAY-011a e FIN-006a): pendente (livre), conciliada (o pagamento de uma venda), repasse (o recebimento de um repasse de marketplace), estorno (o débito do estorno de uma venda), deposito (o depósito agrupado de uma maquininha) ou ignorada (fora da conta, com motivo).';

create table public.maquininha_depositos (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes (id),
  provedor text not null check (provedor in ('picpay', 'pagbank')),
  data_liquidacao date not null,
  linha_id uuid not null references public.extrato_linhas (id),
  pagamentos int not null check (pagamentos >= 1),
  esperado_centavos bigint not null check (esperado_centavos between 0 and 100000000000),
  recebido_centavos bigint not null check (recebido_centavos between 1 and 100000000000),
  motivo text check (motivo is null or (length(motivo) between 3 and 200 and motivo = btrim(motivo))),
  casado_por uuid not null references public.perfis_usuario (id),
  casado_em timestamptz not null default now(),
  unique (organizacao_id, provedor, data_liquidacao),
  unique (linha_id),
  constraint deposito_divergente_tem_motivo check (recebido_centavos = esperado_centavos or motivo is not null)
);
comment on table public.maquininha_depositos is
  'FIN-006a: o depósito da maquininha (os pagamentos com o dinheiro para o mesmo dia) casado com a linha de crédito do extrato do banco da rede; a divergência tem motivo.';
create index maquininha_depositos_casado_por on public.maquininha_depositos (casado_por);
create trigger maquininha_depositos_auditar after insert or update or delete on public.maquininha_depositos
  for each row execute function privado.auditar_mudanca();

alter table public.maquininha_depositos enable row level security;
revoke all on public.maquininha_depositos from anon, authenticated;
grant select on public.maquininha_depositos to authenticated;
create policy maquininha_depositos_ler on public.maquininha_depositos for select to authenticated
  using (organizacao_id in (select privado.organizacoes_com_permissao('pagamento.conciliar')));

-- Os meios de cada maquininha (os que se conciliam pelo extrato dela).
create or replace function privado.meios_da_maquininha(p_provedor text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_provedor
    when 'picpay' then array['pix_picpay', 'cartao_picpay']
    when 'pagbank' then array['cartao_pagseguro']
  end;
$$;
revoke all on function privado.meios_da_maquininha(text) from public, anon;
grant execute on function privado.meios_da_maquininha(text) to authenticated;

-- O esperado de um depósito agora: os pagamentos já conciliados da maquininha com o dinheiro para o dia, e a soma do
-- líquido deles. O pagamento de venda cancelada depois conta: o dinheiro caiu, e o estorno é um débito à parte.
create or replace function privado.deposito_esperado(p_organizacao uuid, p_provedor text, p_data date)
returns table (pagamentos int, esperado bigint)
language sql
stable
set search_path = ''
as $$
  select count(*)::int, coalesce(sum(p.valor_liquido_centavos), 0)::bigint
  from public.venda_pagamentos p
  where p.organizacao_id = p_organizacao and p.meio = any (privado.meios_da_maquininha(p_provedor))
    and p.conciliado_em is not null and p.liquidado_em = p_data;
$$;
revoke all on function privado.deposito_esperado(uuid, text, date) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- A regra nas tabelas (vale para qualquer caminho), como a dos repasses (AUD-c)
-- -----------------------------------------------------------------------------
-- Casar o depósito ocupa a linha: com a trava dela, a linha tem de ser um crédito livre do extrato do banco da mesma rede.
create or replace function privado.deposito_ocupa_a_linha()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.extrato_linhas;
  e public.extratos;
begin
  select * into l from public.extrato_linhas x where x.id = new.linha_id for update;
  select * into e from public.extratos x where x.id = l.extrato_id;
  if l.organizacao_id <> new.organizacao_id or e.tipo <> 'banco' or e.unidade_id is not null or l.valor_centavos <= 0 then
    raise exception 'A linha do depósito tem de ser um crédito do extrato do banco da mesma rede' using errcode = '22023';
  end if;
  if l.situacao <> 'pendente' then
    raise exception 'Esta linha do extrato já tem outro uso (conciliada, repasse, estorno ou fora da conta): desfaça antes' using errcode = 'OR046';
  end if;
  update public.extrato_linhas x set situacao = 'deposito', decidida_por = new.casado_por, decidida_em = new.casado_em
  where x.id = l.id;
  return null;
end;
$$;
revoke all on function privado.deposito_ocupa_a_linha() from public, anon, authenticated;
create trigger maquininha_depositos_ocupa_a_linha after insert on public.maquininha_depositos
  for each row execute function privado.deposito_ocupa_a_linha();

-- Desfazer o depósito solta a linha.
create or replace function privado.deposito_solta_a_linha()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.extrato_linhas x set situacao = 'pendente', decidida_por = null, decidida_em = null
  where x.id = old.linha_id and x.situacao = 'deposito';
  return null;
end;
$$;
revoke all on function privado.deposito_solta_a_linha() from public, anon, authenticated;
create trigger maquininha_depositos_solta_a_linha after delete on public.maquininha_depositos
  for each row execute function privado.deposito_solta_a_linha();

-- O depósito casado não muda de linha, de rede, de maquininha nem de data: desfaz e casa de novo.
create or replace function privado.deposito_nao_muda()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.linha_id <> old.linha_id or new.organizacao_id <> old.organizacao_id or new.provedor <> old.provedor or new.data_liquidacao <> old.data_liquidacao then
    raise exception 'O depósito casado não muda de linha, de maquininha nem de data: desfaça e case de novo' using errcode = 'OR045';
  end if;
  return new;
end;
$$;
revoke all on function privado.deposito_nao_muda() from public, anon, authenticated;
create trigger maquininha_depositos_nao_muda before update on public.maquininha_depositos
  for each row execute function privado.deposito_nao_muda();

-- -----------------------------------------------------------------------------
-- Casar, desfazer e o painel
-- -----------------------------------------------------------------------------
create or replace function public.maquininha_deposito_casar(p_provedor text, p_data date, p_linha uuid, p_motivo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := (select u.organizacao_id from public.unidades u where u.id = (select public.unidade_atual()));
  v_motivo text := nullif(regexp_replace(btrim(coalesce(p_motivo, '')), '\s+', ' ', 'g'), '');
  v_linha public.extrato_linhas;
  v_extrato public.extratos;
  v_deposito public.maquininha_depositos;
  v_pagamentos int;
  v_esperado bigint;
begin
  if v_org is null or v_org not in (select privado.organizacoes_com_permissao('pagamento.conciliar')) then
    raise exception 'Só quem concilia pela rede inteira casa o depósito da maquininha com o extrato do banco' using errcode = '42501';
  end if;
  if p_provedor is null or p_provedor not in ('picpay', 'pagbank') or p_data is null then
    raise exception 'Escolha a maquininha e o dia do dinheiro' using errcode = '22023';
  end if;
  if v_motivo is not null and length(v_motivo) not between 3 and 200 then
    raise exception 'O motivo tem de 3 a 200 letras' using errcode = '22023';
  end if;
  -- As travas, sempre nesta ordem: o depósito (um por vez na mesma maquininha e dia) e depois a linha (a mesma trava de
  -- conciliar, tirar da conta e desfazer). O uso da linha é lido já com a trava.
  perform pg_advisory_xact_lock(hashtextextended('deposito:' || v_org::text || ':' || p_provedor || ':' || p_data::text, 0));
  select * into v_linha from public.extrato_linhas l where l.id = p_linha and l.organizacao_id = v_org for update;
  if v_linha.id is null then
    raise exception 'Linha do extrato não encontrada' using errcode = 'P0002';
  end if;
  select * into v_extrato from public.extratos e where e.id = v_linha.extrato_id;
  if v_extrato.tipo <> 'banco' or v_extrato.unidade_id is not null then
    raise exception 'A linha tem de ser do extrato do banco da rede' using errcode = '22023';
  end if;
  if v_linha.valor_centavos <= 0 then
    raise exception 'O depósito é dinheiro que entra: escolha uma linha de crédito' using errcode = '22023';
  end if;
  select x.pagamentos, x.esperado into v_pagamentos, v_esperado from privado.deposito_esperado(v_org, p_provedor, p_data) x;
  select * into v_deposito from public.maquininha_depositos d
  where d.organizacao_id = v_org and d.provedor = p_provedor and d.data_liquidacao = p_data;
  -- O mesmo pedido de novo (o toque repetido): devolve o que já está gravado, sem gravar outra vez.
  if v_deposito.id is not null and v_deposito.linha_id = v_linha.id then
    return jsonb_build_object('pagamentos', v_deposito.pagamentos, 'esperado', v_deposito.esperado_centavos, 'recebido', v_deposito.recebido_centavos,
      'diferenca', v_deposito.recebido_centavos - v_deposito.esperado_centavos, 'repetida', true);
  end if;
  if v_deposito.id is not null or exists (select 1 from public.maquininha_depositos d where d.linha_id = v_linha.id) then
    raise exception 'Esta linha já é de outro depósito, ou este depósito já tem linha: desfaça antes' using errcode = 'OR045';
  end if;
  if v_linha.situacao <> 'pendente' then
    raise exception 'Esta linha do extrato já tem outro uso (conciliada, repasse, estorno ou fora da conta): desfaça antes' using errcode = 'OR046';
  end if;
  if v_pagamentos = 0 then
    raise exception 'Nenhum pagamento desta maquininha com o dinheiro para este dia: concilie antes pelo extrato da maquininha' using errcode = 'P0002';
  end if;
  if v_linha.valor_centavos <> v_esperado and v_motivo is null then
    raise exception 'O valor da linha não é o esperado do depósito: diga o motivo da diferença' using errcode = '22023';
  end if;
  perform set_config('ora.motivo', coalesce(v_motivo, 'Depósito da maquininha casado com o extrato do banco'), true);
  -- O gatilho do depósito marca a linha (situação "deposito").
  insert into public.maquininha_depositos (organizacao_id, provedor, data_liquidacao, linha_id, pagamentos, esperado_centavos, recebido_centavos, motivo, casado_por)
  values (v_org, p_provedor, p_data, v_linha.id, v_pagamentos, v_esperado, v_linha.valor_centavos, v_motivo, (select auth.uid()));
  return jsonb_build_object('pagamentos', v_pagamentos, 'esperado', v_esperado, 'recebido', v_linha.valor_centavos,
    'diferenca', v_linha.valor_centavos - v_esperado, 'repetida', false);
end;
$$;

create or replace function public.maquininha_deposito_desfazer(p_provedor text, p_data date, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := (select u.organizacao_id from public.unidades u where u.id = (select public.unidade_atual()));
  v_motivo text := nullif(regexp_replace(btrim(coalesce(p_motivo, '')), '\s+', ' ', 'g'), '');
begin
  if v_org is null or v_org not in (select privado.organizacoes_com_permissao('pagamento.conciliar')) then
    raise exception 'Só quem concilia pela rede inteira desfaz o depósito da maquininha' using errcode = '42501';
  end if;
  if v_motivo is null or length(v_motivo) not between 3 and 200 then
    raise exception 'Informe o motivo de desfazer (de 3 a 200 letras)' using errcode = '22023';
  end if;
  if p_provedor is null or p_data is null then
    return false;
  end if;
  -- As travas na mesma ordem de casar: o depósito e depois a linha dele.
  perform pg_advisory_xact_lock(hashtextextended('deposito:' || v_org::text || ':' || p_provedor || ':' || p_data::text, 0));
  perform 1 from public.extrato_linhas l
  where l.id = (select d.linha_id from public.maquininha_depositos d
                where d.organizacao_id = v_org and d.provedor = p_provedor and d.data_liquidacao = p_data)
  for update;
  perform set_config('ora.motivo', v_motivo, true);
  -- O gatilho do depósito solta a linha (volta a "pendente").
  delete from public.maquininha_depositos d where d.organizacao_id = v_org and d.provedor = p_provedor and d.data_liquidacao = p_data;
  return found;
end;
$$;

-- Com as regras de leitura de quem chama (security invoker): os pagamentos, os depósitos e o extrato que a pessoa lê.
create or replace function public.maquininha_depositos_painel(p_inicio date, p_fim date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_org uuid := (select u.organizacao_id from public.unidades u where u.id = (select public.unidade_atual()));
  resultado jsonb;
begin
  if v_org is null or v_org not in (select privado.organizacoes_com_permissao('pagamento.conciliar')) then
    raise exception 'Sem permissão para os depósitos das maquininhas' using errcode = '42501';
  end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio or p_fim - p_inicio > 400 then
    raise exception 'Período inválido (até 400 dias)' using errcode = '22023';
  end if;
  with
  maquininhas (provedor) as (values ('picpay'), ('pagbank')),
  depositos as (
    select m.provedor, p.liquidado_em as data_liquidacao, count(*)::int as pagamentos, sum(p.valor_liquido_centavos)::bigint as esperado,
      sum(p.valor_centavos)::bigint as bruto
    from maquininhas m
    join public.venda_pagamentos p on p.meio = any (privado.meios_da_maquininha(m.provedor))
    where p.organizacao_id = v_org and p.conciliado_em is not null and p.liquidado_em between p_inicio and p_fim
    group by m.provedor, p.liquidado_em
  ),
  -- As linhas de crédito do extrato do banco da rede ainda livres: sem uso nenhum.
  livres as (
    select l.id, l.data, l.valor_centavos, l.descricao, e.numero as extrato
    from public.extrato_linhas l
    join public.extratos e on e.id = l.extrato_id
    where e.organizacao_id = v_org and e.tipo = 'banco' and e.unidade_id is null and l.valor_centavos > 0
      and l.data between p_inicio and p_fim + 3
      and l.situacao = 'pendente'
  )
  select jsonb_build_object(
    'depositos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'provedor', x.provedor, 'data_liquidacao', x.data_liquidacao, 'pagamentos', x.pagamentos, 'esperado', x.esperado, 'bruto', x.bruto,
        'casado', (
          select jsonb_build_object('linha', d.linha_id, 'extrato', e.numero, 'data', l.data, 'recebido', d.recebido_centavos,
            'esperado_ao_casar', d.esperado_centavos, 'pagamentos_ao_casar', d.pagamentos, 'motivo', d.motivo, 'casado_em', d.casado_em)
          from public.maquininha_depositos d
          join public.extrato_linhas l on l.id = d.linha_id
          join public.extratos e on e.id = l.extrato_id
          where d.organizacao_id = v_org and d.provedor = x.provedor and d.data_liquidacao = x.data_liquidacao),
        'sugestoes', coalesce((
          select jsonb_agg(jsonb_build_object('linha', s.id, 'extrato', s.extrato, 'data', s.data, 'valor', s.valor_centavos, 'descricao', s.descricao)
            order by (s.valor_centavos = x.esperado) desc, abs(s.valor_centavos - x.esperado), s.data, s.id)
          from (select * from livres f where f.data between x.data_liquidacao and x.data_liquidacao + 3
                order by (f.valor_centavos = x.esperado) desc, abs(f.valor_centavos - x.esperado), f.data limit 5) s), '[]'::jsonb)
      ) order by x.data_liquidacao desc, x.provedor)
      from depositos x), '[]'::jsonb),
    -- Os pagamentos das maquininhas, de vendas concluídas no período, ainda sem conciliação: o dinheiro deles ainda não
    -- tem dia, e eles ainda não entram em depósito nenhum.
    'sem_conciliacao', (
      select jsonb_build_object('pagamentos', count(*), 'valor', coalesce(sum(p.valor_centavos), 0))
      from public.venda_pagamentos p
      join public.vendas v on v.id = p.venda_id
      where p.organizacao_id = v_org and p.meio in ('pix_picpay', 'cartao_picpay', 'cartao_pagseguro')
        and p.situacao = 'confirmado' and p.conciliado_em is null and v.situacao = 'concluida'
        and v.concluida_em >= (p_inicio::timestamp at time zone 'America/Sao_Paulo')
        and v.concluida_em < ((p_fim + 1)::timestamp at time zone 'America/Sao_Paulo'))
  ) into resultado;
  return resultado;
end;
$$;

revoke all on function public.maquininha_deposito_casar(text, date, uuid, text), public.maquininha_deposito_desfazer(text, date, text),
  public.maquininha_depositos_painel(date, date) from public, anon;
grant execute on function public.maquininha_deposito_casar(text, date, uuid, text), public.maquininha_deposito_desfazer(text, date, text),
  public.maquininha_depositos_painel(date, date) to authenticated;

-- -----------------------------------------------------------------------------
-- A linha de depósito nas regras e nas funções de antes (as definições em vigor, com o uso novo)
-- -----------------------------------------------------------------------------
create or replace function privado.extrato_linha_um_uso()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  casada boolean := exists (select 1 from public.marketplace_repasses r where r.linha_id = new.id);
  -- FIN-006a: o depósito da maquininha casado com a linha.
  depositada boolean := exists (select 1 from public.maquininha_depositos d where d.linha_id = new.id);
begin
  if new.situacao = 'repasse' and not casada then
    raise exception 'A linha do extrato só fica como repasse casada com um repasse' using errcode = 'OR046';
  end if;
  if new.situacao <> 'repasse' and casada then
    raise exception 'Esta linha é o recebimento de um repasse de marketplace: desfaça o repasse antes' using errcode = 'OR046';
  end if;
  if new.situacao = 'deposito' and not depositada then
    raise exception 'A linha do extrato só fica como depósito casada com o depósito de uma maquininha' using errcode = 'OR046';
  end if;
  if new.situacao <> 'deposito' and depositada then
    raise exception 'Esta linha é o depósito de uma maquininha: desfaça o depósito antes' using errcode = 'OR046';
  end if;
  return new;
end;
$$;

create or replace function public.extrato_conciliar(p_linha uuid, p_pagamento uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  l public.extrato_linhas;
  e public.extratos;
  v_venda public.vendas;
  v_pagamento public.venda_pagamentos;
  v_data date;
  v_liquido bigint;
begin
  select * into l from public.extrato_linhas x where x.id = p_linha for update;
  select * into e from public.extratos x where x.id = l.extrato_id;
  if l.id is null or not (select privado.extrato_e_meu(e.organizacao_id, e.unidade_id)) then
    raise exception 'Linha do extrato não encontrada para você' using errcode = '42501';
  end if;
  select * into v_pagamento from public.venda_pagamentos p where p.id = p_pagamento;
  select * into v_venda from public.vendas v where v.id = v_pagamento.venda_id;
  if v_pagamento.id is null or v_venda.organizacao_id <> e.organizacao_id or (e.unidade_id is not null and v_venda.unidade_id <> e.unidade_id)
     or not (select public.tem_permissao('pagamento.conciliar', v_venda.unidade_id)) then
    raise exception 'Pagamento não encontrado para você' using errcode = '42501';
  end if;
  if l.situacao = 'conciliada' and l.pagamento_id = p_pagamento then
    return jsonb_build_object('conciliada', true, 'repetida', true);
  end if;
  -- AUD-c: a linha que é o recebimento de um repasse não concilia uma venda (a mesma trava de casar o repasse).
  if l.situacao = 'repasse' or exists (select 1 from public.marketplace_repasses r where r.linha_id = l.id) then
    raise exception 'Esta linha é o recebimento de um repasse de marketplace: desfaça o repasse antes' using errcode = 'OR046';
  end if;
  -- FIN-006a: a linha que é o depósito de uma maquininha também já tem o uso dela.
  if l.situacao = 'deposito' then
    raise exception 'Esta linha é o depósito de uma maquininha: desfaça o depósito antes' using errcode = 'OR046';
  end if;
  if l.situacao <> 'pendente' then
    raise exception 'Esta linha do extrato já foi decidida: desfaça antes' using errcode = '22023';
  end if;
  if not (v_pagamento.meio = any (e.meios)) then
    raise exception 'Este pagamento não é de um meio deste extrato' using errcode = '22023';
  end if;
  if l.valor_centavos <> v_pagamento.valor_centavos then
    raise exception 'O valor da linha não é o do pagamento' using errcode = '22023';
  end if;
  if exists (select 1 from public.extrato_linhas o where o.pagamento_id = p_pagamento and o.situacao = 'conciliada' and o.id <> l.id) then
    raise exception 'Este pagamento já está conciliado com outra linha de extrato' using errcode = '22023';
  end if;
  -- A data em que o dinheiro caiu: a do repasse (ou a da linha), nunca antes do dia da venda.
  v_data := greatest(coalesce(l.data_liquidacao, l.data), (v_venda.concluida_em at time zone 'America/Sao_Paulo')::date);
  if v_data > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'O dinheiro desta linha ainda não caiu: concilie no dia do repasse' using errcode = '22023';
  end if;
  v_liquido := coalesce(l.liquido_centavos, l.valor_centavos - coalesce(l.taxa_centavos, 0));
  -- A conciliação de sempre (L7a), com a referência (a da linha, ou o número do extrato e da linha), o líquido e a data.
  perform public.pagamento_conciliar(p_pagamento,
    case when length(l.referencia) >= 3 then l.referencia else format('Extrato %s, linha %s', e.numero, l.numero) end, v_liquido, v_data);
  update public.extrato_linhas x set situacao = 'conciliada', pagamento_id = p_pagamento, decidida_por = (select auth.uid()), decidida_em = now()
  where x.id = l.id;
  return jsonb_build_object('conciliada', true, 'repetida', false);
end;
$$;

create or replace function public.marketplace_repasse_casar(p_canal text, p_data_repasse date, p_linha uuid, p_motivo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := (select u.organizacao_id from public.unidades u where u.id = (select public.unidade_atual()));
  v_motivo text := nullif(regexp_replace(btrim(coalesce(p_motivo, '')), '\s+', ' ', 'g'), '');
  v_linha public.extrato_linhas;
  v_extrato public.extratos;
  v_repasse public.marketplace_repasses;
  v_pedidos int;
  v_esperado bigint;
  v_estimados int;
begin
  if v_org is null or v_org not in (select privado.repasses_da_rede()) then
    raise exception 'Só quem vê o resultado e concilia pela rede casa o repasse com o extrato' using errcode = '42501';
  end if;
  if p_canal is null or p_canal not in ('mercado_livre', 'shopee', 'tiktok_shop') or p_data_repasse is null then
    raise exception 'Escolha o canal e a data do repasse' using errcode = '22023';
  end if;
  if v_motivo is not null and length(v_motivo) not between 3 and 200 then
    raise exception 'O motivo tem de 3 a 200 letras' using errcode = '22023';
  end if;
  -- As travas, sempre nesta ordem: o repasse (um por vez no mesmo canal e data) e depois a linha (a mesma trava de
  -- conciliar, tirar da conta e desfazer). O uso da linha é lido já com a trava.
  perform pg_advisory_xact_lock(hashtextextended('repasse:' || v_org::text || ':' || p_canal || ':' || p_data_repasse::text, 0));
  select * into v_linha from public.extrato_linhas l where l.id = p_linha and l.organizacao_id = v_org for update;
  if v_linha.id is null then
    raise exception 'Linha do extrato não encontrada' using errcode = 'P0002';
  end if;
  select * into v_extrato from public.extratos e where e.id = v_linha.extrato_id;
  if v_extrato.tipo <> 'banco' or v_extrato.unidade_id is not null then
    raise exception 'A linha tem de ser do extrato do banco da rede' using errcode = '22023';
  end if;
  if v_linha.valor_centavos <= 0 then
    raise exception 'O repasse é dinheiro que entra: escolha uma linha de crédito' using errcode = '22023';
  end if;
  select x.pedidos, x.esperado, x.estimados into v_pedidos, v_esperado, v_estimados from privado.repasse_esperado(v_org, p_canal, p_data_repasse) x;
  select * into v_repasse from public.marketplace_repasses r
  where r.organizacao_id = v_org and r.canal = p_canal and r.data_repasse = p_data_repasse;
  -- O mesmo pedido de novo (o toque repetido): devolve o que já está gravado, sem gravar outra vez.
  if v_repasse.id is not null and v_repasse.linha_id = v_linha.id then
    return jsonb_build_object('pedidos', v_repasse.pedidos, 'esperado', v_repasse.esperado_centavos, 'recebido', v_repasse.recebido_centavos,
      'diferenca', v_repasse.recebido_centavos - v_repasse.esperado_centavos, 'estimados', v_estimados, 'repetida', true);
  end if;
  if v_repasse.id is not null or exists (select 1 from public.marketplace_repasses r where r.linha_id = v_linha.id) then
    raise exception 'Esta linha já é de outro repasse, ou este repasse já tem linha: desfaça antes' using errcode = 'OR045';
  end if;
  if v_linha.situacao = 'conciliada' then
    raise exception 'Esta linha já está conciliada com o pagamento de uma venda: desfaça a conciliação antes' using errcode = 'OR046';
  end if;
  -- FIN-006a: a linha que é o depósito de uma maquininha.
  if v_linha.situacao = 'deposito' then
    raise exception 'Esta linha é o depósito de uma maquininha: desfaça o depósito antes' using errcode = 'OR046';
  end if;
  if v_linha.situacao <> 'pendente' then
    raise exception 'Esta linha está fora da conta: volte a linha para a conta antes' using errcode = 'OR046';
  end if;
  if v_pedidos = 0 then
    raise exception 'Nenhum pedido deste canal com esta data de repasse' using errcode = 'P0002';
  end if;
  if v_linha.valor_centavos <> v_esperado and v_motivo is null then
    raise exception 'O valor da linha não é o esperado do repasse: diga o motivo da diferença' using errcode = '22023';
  end if;
  perform set_config('ora.motivo', coalesce(v_motivo, 'Repasse casado com o extrato do banco'), true);
  -- O gatilho do repasse marca a linha (situação "repasse").
  insert into public.marketplace_repasses (organizacao_id, canal, data_repasse, linha_id, pedidos, esperado_centavos, recebido_centavos, motivo, casado_por)
  values (v_org, p_canal, p_data_repasse, v_linha.id, v_pedidos, v_esperado, v_linha.valor_centavos, v_motivo, (select auth.uid()));
  return jsonb_build_object('pedidos', v_pedidos, 'esperado', v_esperado, 'recebido', v_linha.valor_centavos,
    'diferenca', v_linha.valor_centavos - v_esperado, 'estimados', v_estimados, 'repetida', false);
end;
$$;

create or replace function public.extrato_ignorar(p_linha uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  l public.extrato_linhas;
  e public.extratos;
begin
  select * into l from public.extrato_linhas x where x.id = p_linha for update;
  select * into e from public.extratos x where x.id = l.extrato_id;
  if l.id is null or not (select privado.extrato_e_meu(e.organizacao_id, e.unidade_id)) then
    raise exception 'Linha do extrato não encontrada para você' using errcode = '42501';
  end if;
  if l.situacao = 'ignorada' then
    return false;
  end if;
  -- AUD-c: a linha de um repasse não sai da conta com o repasse casado.
  if l.situacao = 'repasse' then
    raise exception 'Esta linha é o recebimento de um repasse de marketplace: desfaça o repasse antes' using errcode = 'OR046';
  end if;
  -- FIN-006a: a linha que é o depósito de uma maquininha só se solta desfazendo o depósito.
  if l.situacao = 'deposito' then
    raise exception 'Esta linha é o depósito de uma maquininha: desfaça o depósito antes' using errcode = 'OR046';
  end if;
  -- PAY-011a: o débito que é o estorno de uma venda já tem o uso dele.
  if l.situacao = 'estorno' then
    raise exception 'Este débito é o estorno de uma venda: ele já tem o uso dele' using errcode = 'OR046';
  end if;
  if l.situacao <> 'pendente' then
    raise exception 'Esta linha está conciliada: desfaça antes' using errcode = '22023';
  end if;
  perform set_config('ora.motivo', 'Linha do extrato fora da conta: ' || v_motivo, true);
  update public.extrato_linhas x set situacao = 'ignorada', motivo = left(v_motivo, 200), decidida_por = (select auth.uid()), decidida_em = now()
  where x.id = l.id;
  return true;
end;
$$;

create or replace function public.extrato_desfazer(p_linha uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  l public.extrato_linhas;
  e public.extratos;
  v_unidade uuid;
begin
  select * into l from public.extrato_linhas x where x.id = p_linha for update;
  select * into e from public.extratos x where x.id = l.extrato_id;
  if l.id is null or not (select privado.extrato_e_meu(e.organizacao_id, e.unidade_id)) then
    raise exception 'Linha do extrato não encontrada para você' using errcode = '42501';
  end if;
  if l.situacao = 'pendente' then
    return false;
  end if;
  -- AUD-c: a linha de um repasse só se solta desfazendo o repasse (lá a trava do repasse vem antes da linha; daqui, a
  -- ordem seria a inversa).
  if l.situacao = 'repasse' then
    raise exception 'Esta linha é o recebimento de um repasse de marketplace: desfaça o repasse na tela dos repasses' using errcode = 'OR046';
  end if;
  -- FIN-006a: a linha que é o depósito de uma maquininha só se solta na tela dos depósitos (lá a trava do depósito vem
  -- antes da linha; daqui, a ordem seria a inversa).
  if l.situacao = 'deposito' then
    raise exception 'Esta linha é o depósito de uma maquininha: desfaça o depósito na tela dos depósitos' using errcode = 'OR046';
  end if;
  -- PAY-011a: o débito de um estorno. O que só guardou a prova de um estorno já confirmado se solta, com o motivo; o que
  -- confirmou o estorno fica (a confirmação não se desfaz, e a linha solta confirmaria outro estorno com o mesmo débito).
  if l.situacao = 'estorno' then
    if l.confirmou_o_estorno then
      raise exception 'Este débito confirmou o estorno de uma venda: a confirmação não se desfaz, e a linha fica como a prova dele' using errcode = 'OR047';
    end if;
    perform set_config('ora.motivo', format('Débito do extrato solto do estorno nº %s: %s',
      (select s.numero from public.estornos_externos s where s.id = l.estorno_id), v_motivo), true);
    update public.extrato_linhas x
    set situacao = 'pendente', estorno_id = null, confirmou_o_estorno = null, chargeback = null, decidida_por = null, decidida_em = null
    where x.id = l.id;
    return true;
  end if;
  if l.situacao = 'conciliada' then
    select v.unidade_id into v_unidade from public.venda_pagamentos p join public.vendas v on v.id = p.venda_id where p.id = l.pagamento_id;
    if not (select public.tem_permissao('pagamento.conciliar', v_unidade)) then
      raise exception 'Linha do extrato não encontrada para você' using errcode = '42501';
    end if;
    -- A conciliação de sempre desfaz o pagamento, e o gatilho devolve a linha (o update abaixo só pega o que sobrar).
    perform public.pagamento_desconciliar(l.pagamento_id, v_motivo);
  else
    perform set_config('ora.motivo', 'Linha do extrato de volta à conta: ' || v_motivo, true);
  end if;
  update public.extrato_linhas x set situacao = 'pendente', pagamento_id = null, motivo = null, decidida_por = null, decidida_em = null
  where x.id = l.id and x.situacao <> 'pendente';
  return true;
end;
$$;

create or replace function public.extrato_resumo(p_extrato uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'creditos', count(*) filter (where l.valor_centavos > 0),
    'creditos_centavos', coalesce(sum(l.valor_centavos) filter (where l.valor_centavos > 0), 0),
    'debitos', count(*) filter (where l.valor_centavos < 0),
    'debitos_centavos', coalesce(sum(-l.valor_centavos) filter (where l.valor_centavos < 0), 0),
    'taxas_centavos', coalesce(sum(l.taxa_centavos), 0),
    'liquido_centavos', coalesce(sum(coalesce(l.liquido_centavos, l.valor_centavos - coalesce(l.taxa_centavos, 0))), 0),
    'a_cair_centavos', coalesce(sum(coalesce(l.liquido_centavos, l.valor_centavos - coalesce(l.taxa_centavos, 0)))
      filter (where l.data_liquidacao > (now() at time zone 'America/Sao_Paulo')::date and l.valor_centavos > 0), 0),
    'pendentes', count(*) filter (where l.situacao = 'pendente'),
    'conciliadas', count(*) filter (where l.situacao = 'conciliada'),
    'ignoradas', count(*) filter (where l.situacao = 'ignorada'),
    'repasses', count(*) filter (where l.situacao = 'repasse'),
    'estornos', count(*) filter (where l.situacao = 'estorno'),
    'depositos', count(*) filter (where l.situacao = 'deposito'))
  from public.extrato_linhas l
  where l.extrato_id = p_extrato;
$$;

-- A coluna nova (os depósitos) muda o retorno: a função é refeita.
drop function public.extratos_recentes(int);
create function public.extratos_recentes(p_limite int)
returns table (id uuid, numero bigint, unidade_id uuid, loja text, tipo text, fonte text, arquivo text, periodo_inicio date,
  periodo_fim date, linhas int, importado_em timestamptz, pendentes bigint, conciliadas bigint, ignoradas bigint, repasses bigint, estornos bigint, depositos bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with meus as (
    select e.* from public.extratos e
    where e.organizacao_id in (select v.organizacao_id from privado.vinculos_vigentes() v)
      and privado.extrato_e_meu(e.organizacao_id, e.unidade_id)
    order by e.importado_em desc
    limit least(greatest(coalesce(p_limite, 50), 1), 200)
  )
  select m.id, m.numero, m.unidade_id, u.nome, m.tipo, m.fonte, m.arquivo, m.periodo_inicio, m.periodo_fim, m.linhas, m.importado_em,
    (select count(*) from public.extrato_linhas l where l.extrato_id = m.id and l.situacao = 'pendente'),
    (select count(*) from public.extrato_linhas l where l.extrato_id = m.id and l.situacao = 'conciliada'),
    (select count(*) from public.extrato_linhas l where l.extrato_id = m.id and l.situacao = 'ignorada'),
    (select count(*) from public.extrato_linhas l where l.extrato_id = m.id and l.situacao = 'repasse'),
    (select count(*) from public.extrato_linhas l where l.extrato_id = m.id and l.situacao = 'estorno'),
    (select count(*) from public.extrato_linhas l where l.extrato_id = m.id and l.situacao = 'deposito')
  from meus m
  left join public.unidades u on u.id = m.unidade_id
  order by m.importado_em desc;
$$;
revoke all on function public.extratos_recentes(int) from public, anon;
grant execute on function public.extratos_recentes(int) to authenticated;
