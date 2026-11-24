-- =============================================================================
-- Lote PAY-011a (a fila do prompt de 23/11, área F; ORA-PAY-011: "gerir chargebacks, estornos, antecipação e ajustes;
-- efeito financeiro e comissão não duplicado"). Decisão: ADR-016, adendo de 24/11.
--
-- O que faltava (ADR-016, "o que fica de fora", item 4): o débito do extrato (o estorno ou o chargeback que a maquininha
-- ou o banco tirou) só saía da conta com um motivo escrito à mão. O estorno da venda (public.estornos_externos, lote de
-- integridade #50) era confirmado digitando o código do comprovante, sem ligação com o extrato. Nada impedia o mesmo
-- débito de servir de prova a dois estornos, e a venda não mostrava que o dinheiro saiu mesmo.
--
-- A regra nova: o débito do extrato é a prova do estorno da venda, e cada débito prova UM estorno só.
--   pendente (livre) -> conciliada | repasse | ignorada (os usos de antes) | estorno (o débito do estorno de uma venda)
--   * a situação nova "estorno" em public.extrato_linhas, com o estorno (estorno_id), se foi a linha que confirmou o
--     estorno (confirmou_o_estorno) e se quem ligou disse que foi contestação do cliente no banco (chargeback). Uma linha
--     por estorno e um estorno por linha;
--   * public.extrato_sugestoes_de_estorno: para cada débito pendente, os estornos da mesma loja (ou da rede, no extrato
--     da rede), de um dos meios do extrato, com o mesmo valor, ainda sem débito ligado, pedidos até 60 dias antes ou
--     depois da data da linha (o chargeback aparece no extrato antes de a loja cancelar a venda; o estorno comum, depois);
--   * public.extrato_casar_estorno: liga o débito ao estorno. O estorno ainda pendente é confirmado ali mesmo, pela
--     confirmação de sempre (public.confirmar_estorno_externo: a gerência da loja da venda, na loja do turno), com a
--     referência da linha como comprovante. O estorno já confirmado à mão só ganha a prova. O mesmo pedido de novo
--     devolve o que já estava gravado (repetida = true);
--   * as travas, sempre na mesma ordem: a linha (a ordem dos extratos), depois a venda e o estorno (a ordem de
--     public.confirmar_estorno_externo). Nenhum caminho toma a venda ou o estorno e depois espera por um débito do
--     extrato, então ninguém espera em círculo;
--   * desfazer (public.extrato_desfazer): o débito que só guardou a prova de um estorno já confirmado se solta, com o
--     motivo. O débito que CONFIRMOU o estorno não se solta (OR047): a confirmação do estorno não se desfaz (registro
--     fixo desde o lote de integridade), e, se a linha se soltasse, o mesmo débito confirmaria outro estorno;
--   * a regra vale para qualquer caminho: o gatilho de public.extrato_linhas só aceita como estorno o débito de um
--     estorno confirmado, do mesmo valor e da mesma rede, e não deixa soltar a linha que confirmou;
--   * public.extrato_estorno_chargeback: corrige, com o motivo, a marca de chargeback do débito já ligado (a ligação
--     que confirmou o estorno não se desfaz; a marca é só uma classificação e pode ser corrigida);
--   * public.extrato_ignorar recusa o débito de um estorno (OR046, "já tem outro uso"); public.extrato_resumo e
--     public.extratos_recentes contam também as linhas de estorno (o total continua fechando).
-- O chargeback de uma venda que ainda está concluída: a loja cancela a venda (o cancelamento de sempre cria o estorno, tira
-- a venda da comissão uma vez e pede o retorno do aparelho, que pode ser fechado como "não voltou"), e o débito do extrato
-- confirma o estorno. Nada é lançado duas vezes: o débito não vira uma saída à parte.
-- Fica de fora: o débito de valor diferente do estorno (chargeback parcial ou com tarifa junta), que continua saindo da
-- conta com o motivo, e a antecipação como operação própria (depende do arquivo real de cada maquininha).
-- Código novo: OR047, o débito confirmou o estorno e não se solta.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

alter table public.extrato_linhas drop constraint extrato_linhas_situacao_check;
alter table public.extrato_linhas add constraint extrato_linhas_situacao_check
  check (situacao in ('pendente', 'conciliada', 'ignorada', 'repasse', 'estorno'));
comment on column public.extrato_linhas.situacao is
  'O uso da linha, um só (AUD-c e PAY-011a): pendente (livre), conciliada (o pagamento de uma venda), repasse (o recebimento de um repasse de marketplace), estorno (o débito do estorno de uma venda) ou ignorada (fora da conta, com motivo).';

alter table public.extrato_linhas
  add column estorno_id uuid references public.estornos_externos (id),
  add column confirmou_o_estorno boolean,
  add column chargeback boolean;
comment on column public.extrato_linhas.estorno_id is
  'PAY-011a: o estorno da venda de que esta linha (um débito) é a prova. Uma linha por estorno.';
comment on column public.extrato_linhas.confirmou_o_estorno is
  'PAY-011a: verdadeiro quando foi esta linha que confirmou o estorno (ela não se solta mais); falso quando o estorno já estava confirmado e a linha só guardou a prova.';
comment on column public.extrato_linhas.chargeback is
  'PAY-011a: verdadeiro quando quem ligou disse que o débito foi uma contestação do cliente no banco (chargeback), e não um estorno pedido pela loja.';
alter table public.extrato_linhas add constraint linha_de_estorno check (
  (situacao = 'estorno') = (estorno_id is not null)
  and (estorno_id is null) = (confirmou_o_estorno is null)
  and (estorno_id is null) = (chargeback is null)
  and (estorno_id is null or valor_centavos < 0));
-- Um estorno com um débito só (o índice também serve à chave estrangeira).
create unique index extrato_linhas_um_estorno on public.extrato_linhas (estorno_id);

-- -----------------------------------------------------------------------------
-- A regra na tabela (vale para qualquer caminho)
-- -----------------------------------------------------------------------------
create or replace function privado.extrato_linha_de_estorno()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.estornos_externos;
begin
  -- A linha que confirmou o estorno não se solta, não troca de estorno e não deixa de dizer que confirmou.
  if tg_op = 'UPDATE' and old.estorno_id is not null and old.confirmou_o_estorno
     and (new.estorno_id is distinct from old.estorno_id or new.confirmou_o_estorno is distinct from true) then
    raise exception 'Este débito confirmou o estorno de uma venda: a confirmação não se desfaz, e a linha fica como a prova dele' using errcode = 'OR047';
  end if;
  if new.estorno_id is not null and (tg_op = 'INSERT' or new.estorno_id is distinct from old.estorno_id) then
    select * into s from public.estornos_externos x where x.id = new.estorno_id;
    if s.id is null or s.organizacao_id <> new.organizacao_id or s.situacao <> 'confirmado' or s.valor_centavos <> -new.valor_centavos then
      raise exception 'A linha de estorno tem de ser o débito de um estorno confirmado, do mesmo valor e da mesma rede' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function privado.extrato_linha_de_estorno() from public, anon, authenticated;
create trigger extrato_linhas_de_estorno before insert or update of situacao, estorno_id, confirmou_o_estorno on public.extrato_linhas
  for each row execute function privado.extrato_linha_de_estorno();

-- -----------------------------------------------------------------------------
-- As sugestões: os estornos que cada débito pendente pode provar
-- -----------------------------------------------------------------------------
create or replace function public.extrato_sugestoes_de_estorno(p_extrato uuid)
returns table (linha_id uuid, estorno_id uuid, estorno_numero bigint, venda_id uuid, venda_numero bigint, meio text, valor_centavos bigint,
  situacao text, solicitado_em timestamptz, confirmado_em timestamptz, comprovante text, loja text, de_devolucao boolean,
  pela_referencia boolean, pode_confirmar boolean, na_loja_do_turno boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  e public.extratos;
  v_atual uuid := (select public.unidade_atual());
begin
  select * into e from public.extratos x where x.id = p_extrato;
  if not found or not (select privado.extrato_e_meu(e.organizacao_id, e.unidade_id)) then
    raise exception 'Extrato não encontrado para você' using errcode = '42501';
  end if;
  return query
  select l.id, s.id, s.numero, v.id, v.numero, s.meio, s.valor_centavos, s.situacao, s.solicitado_em, s.confirmado_em, s.comprovante, u.nome,
    s.devolucao_id is not null,
    (l.referencia is not null and s.comprovante is not null and l.referencia = btrim(s.comprovante)),
    -- Confirmar o estorno pendente é da gerência da loja da venda (venda.cancelar), na loja do turno.
    (select public.tem_permissao('venda.cancelar', s.unidade_id)),
    s.unidade_id is not distinct from v_atual
  from public.extrato_linhas l
  join public.estornos_externos s on s.valor_centavos = -l.valor_centavos
  join public.vendas v on v.id = s.venda_id
  join public.unidades u on u.id = s.unidade_id
  where l.extrato_id = e.id and l.situacao = 'pendente' and l.valor_centavos < 0
    and s.organizacao_id = e.organizacao_id and (e.unidade_id is null or s.unidade_id = e.unidade_id)
    and s.unidade_id in (select privado.unidades_com_permissao('pagamento.conciliar'))
    and s.meio = any (e.meios)
    and l.data <= (now() at time zone 'America/Sao_Paulo')::date
    and l.data >= (v.concluida_em at time zone 'America/Sao_Paulo')::date
    and l.data between (s.solicitado_em at time zone 'America/Sao_Paulo')::date - 60 and (s.solicitado_em at time zone 'America/Sao_Paulo')::date + 60
    and not exists (select 1 from public.extrato_linhas o where o.estorno_id = s.id)
  order by l.numero, (l.referencia is not null and s.comprovante is not null and l.referencia = btrim(s.comprovante)) desc,
    abs(l.data - (s.solicitado_em at time zone 'America/Sao_Paulo')::date), s.numero;
end;
$$;

-- -----------------------------------------------------------------------------
-- Ligar o débito ao estorno (e confirmar o estorno, se ele ainda esperava)
-- -----------------------------------------------------------------------------
create or replace function public.extrato_casar_estorno(p_linha uuid, p_estorno uuid, p_chargeback boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  l public.extrato_linhas;
  e public.extratos;
  s public.estornos_externos;
  v public.vendas;
  v_chargeback boolean := coalesce(p_chargeback, false);
  v_confirmou boolean := false;
  v_codigo text;
begin
  -- A trava da linha vem primeiro (a ordem dos extratos).
  select * into l from public.extrato_linhas x where x.id = p_linha for update;
  select * into e from public.extratos x where x.id = l.extrato_id;
  if l.id is null or not (select privado.extrato_e_meu(e.organizacao_id, e.unidade_id)) then
    raise exception 'Linha do extrato não encontrada para você' using errcode = '42501';
  end if;
  select * into s from public.estornos_externos x where x.id = p_estorno;
  if s.id is null or s.organizacao_id <> e.organizacao_id or (e.unidade_id is not null and s.unidade_id <> e.unidade_id)
     or not (select public.tem_permissao('pagamento.conciliar', s.unidade_id)) then
    raise exception 'Estorno não encontrado para você' using errcode = '42501';
  end if;
  select * into v from public.vendas x where x.id = s.venda_id;
  -- O mesmo pedido de novo devolve o que já estava gravado.
  if l.situacao = 'estorno' and l.estorno_id = s.id then
    return jsonb_build_object('ligada', true, 'repetida', true, 'confirmou', l.confirmou_o_estorno, 'chargeback', l.chargeback, 'estorno', s.numero, 'venda', v.numero);
  end if;
  if l.situacao <> 'pendente' then
    raise exception 'Esta linha do extrato já foi decidida: desfaça antes' using errcode = '22023';
  end if;
  if l.valor_centavos >= 0 then
    raise exception 'Só um débito do extrato é o estorno de uma venda' using errcode = '22023';
  end if;
  if not (s.meio = any (e.meios)) then
    raise exception 'O meio do estorno não é deste extrato' using errcode = '22023';
  end if;
  if s.valor_centavos <> -l.valor_centavos then
    raise exception 'O débito não tem o valor do estorno' using errcode = '22023';
  end if;
  if l.data > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'O débito desta linha ainda não aconteceu: ligue no dia dele' using errcode = '22023';
  end if;
  if l.data < (v.concluida_em at time zone 'America/Sao_Paulo')::date then
    raise exception 'O débito é de antes da venda: não é o estorno dela' using errcode = '22023';
  end if;
  -- Depois da linha, a venda e o estorno (a ordem de public.confirmar_estorno_externo); o estorno é relido com a trava.
  perform 1 from public.vendas x where x.id = s.venda_id for update;
  select * into s from public.estornos_externos x where x.id = p_estorno for update;
  if exists (select 1 from public.extrato_linhas o where o.estorno_id = s.id and o.id <> l.id) then
    raise exception 'Este estorno já tem o débito dele em outra linha de extrato' using errcode = '22023';
  end if;
  if s.situacao = 'pendente' then
    -- Confirmar continua sendo da gerência da loja da venda, na loja do turno: a função de sempre confere de novo.
    if not (select public.tem_permissao('venda.cancelar', s.unidade_id)) then
      raise exception 'Confirmar o estorno é da gerência da loja da venda' using errcode = '42501';
    end if;
    if s.unidade_id is distinct from (select public.unidade_atual()) then
      raise exception 'Para confirmar o estorno, entre na loja da venda' using errcode = '22023';
    end if;
    v_codigo := case when length(l.referencia) between 4 and 60 then l.referencia else format('EXTRATO-%s-L%s', e.numero, l.numero) end;
    -- A marca de chargeback fica só na linha (onde pode ser corrigida); a observação do estorno, que é fixa, não a repete.
    perform public.confirmar_estorno_externo(s.id, v_codigo,
      left(format('Confirmado pelo débito do extrato nº %s (%s), linha %s, de %s', e.numero, e.fonte, l.numero, to_char(l.data, 'DD/MM/YYYY')), 500));
    v_confirmou := true;
  end if;
  perform set_config('ora.motivo', format('Débito do extrato ligado ao estorno nº %s da venda nº %s%s%s', s.numero, v.numero,
    case when v_confirmou then ' (o débito confirmou o estorno)' else ' (o estorno já estava confirmado)' end,
    case when v_chargeback then '; chargeback' else '' end), true);
  update public.extrato_linhas x
  set situacao = 'estorno', estorno_id = s.id, confirmou_o_estorno = v_confirmou, chargeback = v_chargeback,
      decidida_por = (select auth.uid()), decidida_em = now()
  where x.id = l.id;
  return jsonb_build_object('ligada', true, 'repetida', false, 'confirmou', v_confirmou, 'chargeback', v_chargeback, 'estorno', s.numero, 'venda', v.numero);
end;
$$;

-- A marca de chargeback do débito já ligado, corrigida com o motivo (a auditoria guarda quem mudou e por quê).
create or replace function public.extrato_estorno_chargeback(p_linha uuid, p_chargeback boolean, p_motivo text)
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
  if p_chargeback is null or l.situacao <> 'estorno' then
    raise exception 'Só o débito ligado a um estorno diz se foi chargeback' using errcode = '22023';
  end if;
  if l.chargeback = p_chargeback then
    return false;
  end if;
  perform set_config('ora.motivo', case when p_chargeback then 'Débito do extrato marcado como chargeback: ' else 'Débito do extrato desmarcado como chargeback: ' end
    || left(v_motivo, 200), true);
  update public.extrato_linhas x set chargeback = p_chargeback where x.id = l.id;
  return true;
end;
$$;

revoke all on function public.extrato_sugestoes_de_estorno(uuid), public.extrato_casar_estorno(uuid, uuid, boolean),
  public.extrato_estorno_chargeback(uuid, boolean, text) from public, anon;
grant execute on function public.extrato_sugestoes_de_estorno(uuid), public.extrato_casar_estorno(uuid, uuid, boolean),
  public.extrato_estorno_chargeback(uuid, boolean, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Tirar da conta e desfazer (as definições do AUD-c, com o débito de estorno)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- O resumo e a lista, agora com as linhas de estorno
-- -----------------------------------------------------------------------------
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
    'estornos', count(*) filter (where l.situacao = 'estorno'))
  from public.extrato_linhas l
  where l.extrato_id = p_extrato;
$$;

-- A coluna nova muda o retorno: a função é refeita.
drop function public.extratos_recentes(int);
create function public.extratos_recentes(p_limite int)
returns table (id uuid, numero bigint, unidade_id uuid, loja text, tipo text, fonte text, arquivo text, periodo_inicio date,
  periodo_fim date, linhas int, importado_em timestamptz, pendentes bigint, conciliadas bigint, ignoradas bigint, repasses bigint, estornos bigint)
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
    (select count(*) from public.extrato_linhas l where l.extrato_id = m.id and l.situacao = 'estorno')
  from meus m
  left join public.unidades u on u.id = m.unidade_id
  order by m.importado_em desc;
$$;
revoke all on function public.extratos_recentes(int) from public, anon;
grant execute on function public.extratos_recentes(int) to authenticated;
