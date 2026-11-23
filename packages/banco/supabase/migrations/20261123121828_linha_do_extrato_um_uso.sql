-- =============================================================================
-- Lote AUD-c (a auditoria do Codex de 21/11/2026, PR #105, achado F21-02; ORA-PAY-009, ORA-FIN-006, ORA-MKTPL-005 e
-- ORA-MKTPL-008). Decisão: ADR-016 e ADR-018, adendos de 23/11.
--
-- O defeito: a mesma linha de crédito do extrato do banco servia a duas obrigações diferentes, nas duas ordens: conciliava
-- o pagamento de uma venda (public.extrato_conciliar) e era o recebimento de um repasse de marketplace
-- (public.marketplace_repasse_casar). Casar o repasse deixava a linha "pendente", e nenhuma das duas funções olhava o uso
-- que a outra tinha dado à linha. O saldo do banco não era somado duas vezes (ele vem das linhas, cada uma uma vez); o que
-- ficava errado era a evidência: duas obrigações pareciam recebidas com o mesmo dinheiro.
--
-- A correção: a linha do extrato tem UM uso só, e o uso é a situação dela (a mesma coluna, para os dois caminhos):
--   pendente (livre) -> conciliada (o pagamento de uma venda) | repasse (o recebimento de um repasse) | ignorada (fora da conta)
--   * a situação nova "repasse" em public.extrato_linhas; quem casou e quando ficam na linha (decidida_por, decidida_em);
--   * a trava é a da própria linha (FOR UPDATE), tomada pelos dois caminhos antes de decidir: conciliar, tirar da conta,
--     desfazer e casar o repasse. A ordem das travas é sempre a mesma: nos repasses, a trava do repasse (consultiva, por
--     canal e data) e depois a linha; nos extratos, a linha e depois o pagamento. Nenhuma função toma as duas na ordem
--     inversa (a linha de um repasse só se solta pela tela dos repasses), então uma não espera a outra em círculo;
--   * a regra vale para qualquer caminho, não só para as funções de hoje: o gatilho de public.marketplace_repasses marca
--     a linha ao casar (e recusa a linha que não está livre) e solta ao desfazer; o gatilho de public.extrato_linhas não
--     deixa a linha entrar em "repasse" sem repasse, nem sair com o repasse ainda casado;
--   * public.marketplace_repasse_casar: recusa a linha conciliada ou fora da conta (OR046); o mesmo pedido de novo (o
--     mesmo repasse com a mesma linha) devolve o que já estava gravado, com repetida = true;
--   * public.extrato_conciliar, public.extrato_ignorar e public.extrato_desfazer: recusam a linha de um repasse (OR046);
--   * as sugestões: as do extrato já só olhavam as linhas pendentes; as do painel dos repasses passam a olhar só as
--     linhas pendentes (antes, a linha conciliada com uma venda ou fora da conta continuava sendo sugerida);
--   * public.extrato_resumo e public.extratos_recentes contam também as linhas de repasse (o total continua fechando).
-- Um crédito dividido entre várias obrigações (rateio) não existe hoje. Quando existir, entra com tabela própria de
-- alocações e a soma conferida; aqui não se abre essa porta por falta de validação.
-- Código novo: OR046, a linha do extrato já tem outro uso.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

-- A linha com dois usos (o defeito, se alguém já chegou a ele) pede decisão de gente: a migration não escolhe.
do $$
begin
  if exists (select 1 from public.marketplace_repasses r join public.extrato_linhas l on l.id = r.linha_id where l.situacao <> 'pendente') then
    raise exception 'Há linha de extrato com dois usos (conciliada ou fora da conta, e casada com um repasse): desfaça um dos dois antes desta migration';
  end if;
end;
$$;

alter table public.extrato_linhas drop constraint extrato_linhas_situacao_check;
alter table public.extrato_linhas add constraint extrato_linhas_situacao_check
  check (situacao in ('pendente', 'conciliada', 'ignorada', 'repasse'));
comment on column public.extrato_linhas.situacao is
  'AUD-c: o uso da linha, um só: pendente (livre), conciliada (o pagamento de uma venda), repasse (o recebimento de um repasse de marketplace) ou ignorada (fora da conta, com motivo).';

-- As linhas já casadas com um repasse passam a dizer o uso delas (quem casou e quando vêm do repasse).
select set_config('ora.motivo', 'AUD-c: a linha casada com um repasse passa a dizer o uso dela', true);
update public.extrato_linhas l set situacao = 'repasse', decidida_por = r.casado_por, decidida_em = r.casado_em
from public.marketplace_repasses r
where r.linha_id = l.id and l.situacao = 'pendente';

-- -----------------------------------------------------------------------------
-- A regra nas tabelas (vale para qualquer caminho)
-- -----------------------------------------------------------------------------
-- A linha só está em "repasse" casada com um repasse, e só sai dele com o repasse desfeito.
create or replace function privado.extrato_linha_um_uso()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  casada boolean := exists (select 1 from public.marketplace_repasses r where r.linha_id = new.id);
begin
  if new.situacao = 'repasse' and not casada then
    raise exception 'A linha do extrato só fica como repasse casada com um repasse' using errcode = 'OR046';
  end if;
  if new.situacao <> 'repasse' and casada then
    raise exception 'Esta linha é o recebimento de um repasse de marketplace: desfaça o repasse antes' using errcode = 'OR046';
  end if;
  return new;
end;
$$;
revoke all on function privado.extrato_linha_um_uso() from public, anon, authenticated;
create trigger extrato_linhas_um_uso before insert or update of situacao on public.extrato_linhas
  for each row execute function privado.extrato_linha_um_uso();

-- Casar o repasse ocupa a linha: com a trava dela, a linha tem de ser um crédito livre do extrato do banco da mesma rede.
create or replace function privado.repasse_ocupa_a_linha()
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
    raise exception 'A linha do repasse tem de ser um crédito do extrato do banco da mesma rede' using errcode = '22023';
  end if;
  if l.situacao <> 'pendente' then
    raise exception 'Esta linha do extrato já tem outro uso (conciliada com uma venda ou fora da conta): desfaça antes' using errcode = 'OR046';
  end if;
  update public.extrato_linhas x set situacao = 'repasse', decidida_por = new.casado_por, decidida_em = new.casado_em
  where x.id = l.id;
  return null;
end;
$$;
revoke all on function privado.repasse_ocupa_a_linha() from public, anon, authenticated;
create trigger marketplace_repasses_ocupa_a_linha after insert on public.marketplace_repasses
  for each row execute function privado.repasse_ocupa_a_linha();

-- Desfazer o repasse solta a linha.
create or replace function privado.repasse_solta_a_linha()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.extrato_linhas x set situacao = 'pendente', decidida_por = null, decidida_em = null
  where x.id = old.linha_id and x.situacao = 'repasse';
  return null;
end;
$$;
revoke all on function privado.repasse_solta_a_linha() from public, anon, authenticated;
create trigger marketplace_repasses_solta_a_linha after delete on public.marketplace_repasses
  for each row execute function privado.repasse_solta_a_linha();

-- O repasse casado não troca de linha, de rede, de canal nem de data: desfaz e casa de novo (a linha antiga é solta).
create or replace function privado.repasse_nao_muda_de_linha()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.linha_id <> old.linha_id or new.organizacao_id <> old.organizacao_id or new.canal <> old.canal or new.data_repasse <> old.data_repasse then
    raise exception 'O repasse casado não muda de linha, de canal nem de data: desfaça e case de novo' using errcode = 'OR045';
  end if;
  return new;
end;
$$;
revoke all on function privado.repasse_nao_muda_de_linha() from public, anon, authenticated;
create trigger marketplace_repasses_nao_muda_de_linha before update on public.marketplace_repasses
  for each row execute function privado.repasse_nao_muda_de_linha();

-- -----------------------------------------------------------------------------
-- Os repasses: casar, desfazer e o painel
-- -----------------------------------------------------------------------------
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

create or replace function public.marketplace_repasse_desfazer(p_canal text, p_data_repasse date, p_motivo text)
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
  if v_org is null or v_org not in (select privado.repasses_da_rede()) then
    raise exception 'Só quem vê o resultado e concilia pela rede desfaz o repasse' using errcode = '42501';
  end if;
  if v_motivo is null or length(v_motivo) not between 3 and 200 then
    raise exception 'Informe o motivo de desfazer (de 3 a 200 letras)' using errcode = '22023';
  end if;
  if p_canal is null or p_data_repasse is null then
    return false;
  end if;
  -- As travas na mesma ordem de casar: o repasse e depois a linha dele.
  perform pg_advisory_xact_lock(hashtextextended('repasse:' || v_org::text || ':' || p_canal || ':' || p_data_repasse::text, 0));
  perform 1 from public.extrato_linhas l
  where l.id = (select r.linha_id from public.marketplace_repasses r
                where r.organizacao_id = v_org and r.canal = p_canal and r.data_repasse = p_data_repasse)
  for update;
  perform set_config('ora.motivo', v_motivo, true);
  -- O gatilho do repasse solta a linha (volta a "pendente").
  delete from public.marketplace_repasses r where r.organizacao_id = v_org and r.canal = p_canal and r.data_repasse = p_data_repasse;
  return found;
end;
$$;

-- Com as regras de leitura de quem chama (security invoker): os pedidos, os repasses e o extrato que a pessoa lê.
create or replace function public.marketplace_repasses_painel(p_inicio date, p_fim date)
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
  if v_org is null or v_org not in (select privado.repasses_da_rede()) then
    raise exception 'Sem permissão para os repasses dos marketplaces' using errcode = '42501';
  end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio or p_fim - p_inicio > 400 then
    raise exception 'Período inválido (até 400 dias, como o painel dos marketplaces)' using errcode = '22023';
  end if;
  with
  repasses as (
    select m.canal, m.data_repasse, count(*)::int as pedidos,
      sum(coalesce(m.liquido_centavos, m.bruto_centavos - coalesce(m.tarifas_centavos, 0) - coalesce(m.frete_centavos, 0)
        - coalesce(m.reembolsos_centavos, 0)))::bigint as esperado,
      (count(*) filter (where m.liquido_centavos is null))::int as estimados
    from public.marketplace_pedidos m
    where m.organizacao_id = v_org and m.data_repasse between p_inicio and p_fim
    group by m.canal, m.data_repasse
  ),
  -- As linhas de crédito do extrato do banco da rede ainda livres: sem uso nenhum (nem repasse, nem venda, nem fora da conta).
  livres as (
    select l.id, l.data, l.valor_centavos, l.descricao, e.numero as extrato
    from public.extrato_linhas l
    join public.extratos e on e.id = l.extrato_id
    where e.organizacao_id = v_org and e.tipo = 'banco' and e.unidade_id is null and l.valor_centavos > 0
      and l.data between p_inicio and p_fim + 5
      and l.situacao = 'pendente'
      and not exists (select 1 from public.marketplace_repasses r where r.linha_id = l.id)
  )
  select jsonb_build_object(
    'repasses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'canal', x.canal, 'data_repasse', x.data_repasse, 'pedidos', x.pedidos, 'esperado', x.esperado, 'estimados', x.estimados,
        'casado', (
          select jsonb_build_object('linha', r.linha_id, 'extrato', e.numero, 'data', l.data, 'recebido', r.recebido_centavos,
            'esperado_ao_casar', r.esperado_centavos, 'pedidos_ao_casar', r.pedidos, 'motivo', r.motivo, 'casado_em', r.casado_em)
          from public.marketplace_repasses r
          join public.extrato_linhas l on l.id = r.linha_id
          join public.extratos e on e.id = l.extrato_id
          where r.organizacao_id = v_org and r.canal = x.canal and r.data_repasse = x.data_repasse),
        'sugestoes', coalesce((
          select jsonb_agg(jsonb_build_object('linha', s.id, 'extrato', s.extrato, 'data', s.data, 'valor', s.valor_centavos, 'descricao', s.descricao)
            order by (s.valor_centavos = x.esperado) desc, abs(s.valor_centavos - x.esperado), s.data, s.id)
          from (select * from livres f where f.data between x.data_repasse and x.data_repasse + 5
                order by (f.valor_centavos = x.esperado) desc, abs(f.valor_centavos - x.esperado), f.data limit 5) s), '[]'::jsonb)
      ) order by x.data_repasse desc, x.canal)
      from repasses x), '[]'::jsonb),
    'sem_data_de_repasse', (
      select count(*) from public.marketplace_pedidos m
      where m.organizacao_id = v_org and m.data between p_inicio and p_fim and m.data_repasse is null)
  ) into resultado;
  return resultado;
end;
$$;

-- -----------------------------------------------------------------------------
-- Os extratos: conciliar, tirar da conta, desfazer, o resumo e a lista
-- -----------------------------------------------------------------------------
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

-- O resumo do extrato (lido com a permissão de quem pede: o RLS das linhas), agora com as linhas de repasse.
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
    'repasses', count(*) filter (where l.situacao = 'repasse'))
  from public.extrato_linhas l
  where l.extrato_id = p_extrato;
$$;

-- A lista dos extratos de quem concilia, com as linhas por situação (a coluna nova muda o retorno: a função é refeita).
drop function public.extratos_recentes(int);
create function public.extratos_recentes(p_limite int)
returns table (id uuid, numero bigint, unidade_id uuid, loja text, tipo text, fonte text, arquivo text, periodo_inicio date,
  periodo_fim date, linhas int, importado_em timestamptz, pendentes bigint, conciliadas bigint, ignoradas bigint, repasses bigint)
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
    (select count(*) from public.extrato_linhas l where l.extrato_id = m.id and l.situacao = 'repasse')
  from meus m
  left join public.unidades u on u.id = m.unidade_id
  order by m.importado_em desc;
$$;
revoke all on function public.extratos_recentes(int) from public, anon;
grant execute on function public.extratos_recentes(int) to authenticated;
