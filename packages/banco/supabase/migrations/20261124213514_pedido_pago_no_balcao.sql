-- =============================================================================
-- Lote PAY-014b (24/11/2026; ORA-PAY-014 e ORA-ONLINE-002, que seguem parciais; ADR-025, item 9): no balcão, a venda
-- que atende o pedido pago pelo site registra o "pago pelo site" sem cobrar de novo.
--   * Atender o pedido pago (public.loja_pedido_atender): cada item da venda fica com o preço que o cliente pagou (o da
--     reserva do site; venda_itens.loja_reserva_id) e a reserva de estoque da venda dura o que dura o pedido pago (7 dias
--     depois do pagamento), não os 30 minutos do carrinho.
--   * Concluir (public.concluir_venda): o banco põe sozinho a linha "pago pelo site" (o meio link_pagamento, ligado ao
--     pagamento do site: venda_pagamentos.loja_pagamento_id), com o valor pago; a tela não declara esse pagamento. O que
--     passa do pago (um item a mais no balcão) se paga pelas formas de sempre; sem nada a mais, a venda conclui sem outra
--     forma. O link digitado pela tela segue recusado ("a compra online é que tem link de pagamento", o proprietário,
--     18/11). O celular já pago não entra no que a PayJoy e a Aiva podem financiar.
--   * O pedido pago sai pelo preço pago: o item pago não sai da venda (public.remover_item); o desconto que deixe o total
--     abaixo do pago é recusado na conclusão; a venda aberta do pedido pago não se cancela enquanto o dinheiro não voltar
--     (public.cancelar_venda; OR048, como o pedido): o estorno é pelo painel da Asaas. Concluída, o cancelamento põe a
--     linha do link como estorno externo a confirmar com o comprovante (o estorno externo passa a aceitar o link).
--   * A tela do PDV (public.pdv_tela) recebe o pago pelo site da venda aberta e a reserva do site de cada item.
-- As cinco funções refeitas são as em vigor (o md5 do corpo conferido no ora5g-dev): loja_pedido_atender
-- (20261118031404), concluir_venda (20261118155834), cancelar_venda (20261109190240), remover_item (20261108233546) e
-- pdv_tela (20261117015315). Os acessos ficam como estão (create or replace mantém os grants).
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

-- 1) As ligações com o pedido pago pelo site.
alter table public.venda_itens add column loja_reserva_id uuid unique references public.loja_reservas (id);
comment on column public.venda_itens.loja_reserva_id is
  'PAY-014b: a reserva do site (de um pedido pago pelo site) que este item atende; o item vale o preço pago, o da reserva. Nula nos outros itens.';
alter table public.venda_pagamentos add column loja_pagamento_id uuid unique references public.loja_pagamentos (id);
alter table public.venda_pagamentos add constraint venda_pagamento_do_site
  check ((meio = 'link_pagamento') = (loja_pagamento_id is not null));
comment on column public.venda_pagamentos.loja_pagamento_id is
  'PAY-014b: o pagamento pelo site (a Asaas) que esta linha registra. Só no meio link_pagamento, que só a conclusão da venda grava.';

-- 2) O estorno externo aceita o link (a venda concluída do pedido pago, cancelada: o estorno é pelo painel da Asaas).
alter table public.estornos_externos drop constraint estornos_externos_meio_check;
alter table public.estornos_externos add constraint estornos_externos_meio_check
  check (privado.meio_valido(meio) and meio not in ('dinheiro', 'vale_troca'));

-- 3) Atender o pedido do site (a do ONLINE-d), com o preço pago no pedido pago.
create or replace function public.loja_pedido_atender(p_pedido uuid, p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pedido public.loja_pedidos := privado.pedido_do_site_para_a_loja(p_pedido);
  v_chave text := trim(coalesce(p_chave, ''));
  v_venda uuid;
  v_reserva public.loja_reservas;
  v_n int := 0;
  v_hoje bigint := (select coalesce(sum(coalesce(privado.preco_do_balcao(r.variante_id, r.unidade_id), r.preco_centavos)), 0)
                    from public.loja_reservas r where r.pedido_id = v_pedido.id);
  -- PAY-014b: o que o site recebeu, quando o pedido foi pago (lido sem trava: o worker trava o pagamento antes do pedido,
  -- e esta função já tem o pedido travado).
  v_pago bigint := (select pg.valor_centavos from public.loja_pagamentos pg where pg.pedido_id = v_pedido.id and pg.situacao = 'pago');
  v_item uuid;
begin
  if v_pedido.situacao = 'atendido' then
    return jsonb_build_object('venda', v_pedido.venda_id, 'total_reservado_centavos', v_pedido.total_centavos,
      'total_atual_centavos', v_hoje, 'pago_pelo_site_centavos', v_pago, 'repetida', true);
  end if;
  if v_pedido.situacao = 'cancelado' then
    raise exception 'Este pedido foi cancelado' using errcode = '22023';
  end if;
  if v_pedido.expira_em <= now() then
    raise exception 'Este pedido venceu: venda pelo PDV, se ainda houver estoque' using errcode = '22023';
  end if;
  if length(v_chave) not between 8 and 70 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  v_venda := public.criar_venda(v_chave || ':venda');
  for v_reserva in select * from public.loja_reservas r where r.pedido_id = v_pedido.id order by r.numero for update loop
    if v_reserva.situacao <> 'ativa' or not privado.encerrar_reserva(v_reserva.estoque_reserva_id, 'liberada') then
      raise exception 'A reserva de estoque de um item deste pedido não está mais ativa' using errcode = '22023';
    end if;
    v_n := v_n + 1;
    v_item := public.adicionar_item(v_venda, v_reserva.variante_id, v_reserva.item_serializado_id, 1, v_chave || ':item:' || v_n);
    -- PAY-014b: no pedido pago pelo site, o item vale o preço pago (o da reserva do site; a linha de preço fica nula) e a
    -- reserva de estoque da venda dura o que dura o pedido pago, não os 30 minutos do carrinho.
    if v_pago is not null then
      update public.venda_itens i set preco_unitario_centavos = v_reserva.preco_centavos, preco_id = null, loja_reserva_id = v_reserva.id
      where i.id = v_item;
      update public.estoque_reservas er set expira_em = greatest(er.expira_em, v_pedido.expira_em)
      where er.id = (select i.reserva_id from public.venda_itens i where i.id = v_item);
    end if;
    update public.loja_reservas r
    set situacao = 'atendida', atendida_em = now(), atendida_por = (select auth.uid()), venda_id = v_venda
    where r.id = v_reserva.id;
  end loop;
  update public.loja_pedidos p
  set situacao = 'atendido', atendido_em = now(), atendido_por = (select auth.uid()), venda_id = v_venda
  where p.id = v_pedido.id;
  return jsonb_build_object('venda', v_venda, 'total_reservado_centavos', v_pedido.total_centavos,
    'total_atual_centavos', v_hoje, 'pago_pelo_site_centavos', v_pago, 'repetida', false);
end;
$$;

-- 4) Concluir a venda (a do PDV-c), com a linha "pago pelo site".
create or replace function public.concluir_venda(p_venda uuid, p_pagamentos jsonb, p_cliente jsonb, p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  unidade uuid := (select public.unidade_atual());
  organizacao uuid;
  conteudo text;
  venda public.vendas;
  caixa public.caixas;
  item public.venda_itens;
  pagamento jsonb;
  ordem int := 0;
  meio text;
  valor bigint;
  entrada bigint;
  meio_entrada text;
  comprovante text;
  subtotal bigint := 0;
  descontos bigint := 0;
  total bigint;
  recebido bigint := 0;
  a_receber bigint := 0;
  em_dinheiro bigint := 0;
  excedente bigint;
  troco bigint;
  email text := nullif(lower(trim(coalesce(p_cliente ->> 'email', ''))), '');
  nome text := nullif(trim(coalesce(p_cliente ->> 'nome', '')), '');
  cliente_rede uuid; -- L5a
  terminal_escolhido uuid; -- L7a
  parcelas int; -- PDV-c
  tem_financeira boolean; -- PDV-c
  financiado bigint := 0; -- PDV-c
  valor_aparelhos bigint := 0; -- PDV-c
  pagamento_id uuid;
  reserva public.estoque_reservas;
  os_da_venda public.ordens_servico; -- L12c
  orcamento_da_os public.os_orcamentos; -- L12c
  do_site public.loja_pagamentos; -- PAY-014b
  pago_pelo_site bigint := 0; -- PAY-014b
begin
  if unidade is null or not (select public.tem_permissao('venda.registrar', unidade)) then
    raise exception 'Sem permissão para vender nesta loja' using errcode = '42501';
  end if;
  if p_chave is null or length(trim(p_chave)) = 0 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  -- PAY-014b: a lista pode vir vazia quando o pedido pago pelo site cobre a venda (conferido depois de ler a venda).
  if p_pagamentos is null or jsonb_typeof(p_pagamentos) <> 'array' then
    raise exception 'Informe ao menos um pagamento' using errcode = 'OR009';
  end if;
  select u.organizacao_id into organizacao from public.unidades u where u.id = unidade;
  conteudo := md5(concat_ws('|', p_venda, p_pagamentos::text, coalesce(p_cliente, '{}'::jsonb)::text));

  -- (0) chave: a repetição devolve o mesmo resultado; outro conteúdo, OR004
  perform pg_advisory_xact_lock(privado.trava_da_chave('vendas_conclusao', organizacao, p_chave));
  select * into venda from public.vendas v where v.organizacao_id = organizacao and v.chave_conclusao = p_chave;
  if found then
    if venda.conteudo_conclusao <> conteudo or venda.vendedor_id <> usuario then
      raise exception 'Chave de idempotência já usada em outra operação' using errcode = 'OR004';
    end if;
    return jsonb_build_object('venda', venda.id, 'numero', venda.numero, 'total', venda.total_centavos, 'troco', venda.troco_centavos,
                              'recebido', venda.recebido_centavos, 'a_receber', venda.a_receber_centavos, 'repetida', true);
  end if;

  -- (1) venda, (2) caixa
  venda := privado.minha_venda_aberta(p_venda);
  if venda.situacao = 'aguardando_aprovacao' then
    raise exception 'Há desconto aguardando aprovação' using errcode = 'OR010';
  end if;
  if not exists (select 1 from public.venda_itens i where i.venda_id = venda.id) then
    raise exception 'A venda não tem itens' using errcode = '22023';
  end if;
  -- PAY-014b: o pedido pago pelo site que esta venda atende. A trava segura até o fim da conclusão o estorno que chega
  -- pelo worker (ele trava o pagamento antes de mexer no resto).
  select pg.* into do_site from public.loja_pagamentos pg
  where pg.pedido_id in (select p.id from public.loja_pedidos p where p.venda_id = venda.id) and pg.situacao = 'pago'
  for update;
  pago_pelo_site := coalesce(do_site.valor_centavos, 0);
  if jsonb_array_length(p_pagamentos) = 0 and pago_pelo_site = 0 then
    raise exception 'Informe ao menos um pagamento' using errcode = 'OR009';
  end if;
  caixa := privado.meu_caixa_aberto();
  if email is not null and email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'E-mail do cliente inválido' using errcode = '22023';
  end if;
  -- L5a: cliente da rede escolhido na venda pela busca exata; o nome e o e-mail digitados seguem como origem.
  if nullif(p_cliente ->> 'id', '') is not null then
    begin
      cliente_rede := (p_cliente ->> 'id')::uuid;
    exception when others then
      raise exception 'Cliente inválido' using errcode = '22023';
    end;
    if not public.tem_permissao('cliente.buscar', unidade) or not exists (
         select 1 from public.clientes c where c.id = cliente_rede and c.organizacao_id = organizacao and c.situacao = 'ativo') then
      raise exception 'Cliente não encontrado nesta rede' using errcode = '22023';
    end if;
  end if;

  -- (3) itens serializados em ordem de id
  perform 1 from public.itens_serializados s
  where s.id in (select i.item_serializado_id from public.venda_itens i where i.venda_id = venda.id and i.item_serializado_id is not null)
  order by s.id for update;
  -- L12c: as OS cobradas por esta venda, travadas em ordem de id (duas vendas com a mesma OS não concluem juntas).
  perform 1 from public.ordens_servico o
  where o.id in (select i.os_id from public.venda_itens i where i.venda_id = venda.id and i.os_id is not null)
  order by o.id for update;

  for item in select * from public.venda_itens i where i.venda_id = venda.id order by i.criado_em, i.id loop
    if item.os_id is not null then
      -- L12c: o conserto da OS vale o orçamento aprovado (não tem preço de catálogo) e só é cobrado uma vez.
      select * into os_da_venda from public.ordens_servico o where o.id = item.os_id;
      if os_da_venda.venda_id is not null then
        raise exception 'Esta ordem de serviço já foi cobrada (venda nº %)', (select v.numero from public.vendas v where v.id = os_da_venda.venda_id)
          using errcode = 'OR032';
      end if;
      if os_da_venda.situacao <> 'aberta' or os_da_venda.servico <> 'concluido' or os_da_venda.local <> 'loja'
         or os_da_venda.unidade_id <> venda.unidade_id then
        raise exception 'A ordem de serviço mudou: tire o conserto do carrinho e cobre de novo pela OS' using errcode = 'OR007';
      end if;
      orcamento_da_os := privado.os_orcamento_aprovado(item.os_id);
      if orcamento_da_os.total_centavos is distinct from item.preco_unitario_centavos then
        raise exception 'O preço de um item mudou: confira o carrinho' using errcode = 'OR007';
      end if;
    elsif item.loja_reserva_id is not null then
      -- PAY-014b: o item do pedido pago vale o preço pago (o da reserva do site), enquanto o pagamento estiver pago.
      if do_site.id is null then
        raise exception 'O pagamento pelo site deste pedido foi estornado: tire os itens do pedido e cobre pelo PDV' using errcode = 'OR007';
      end if;
      if item.preco_unitario_centavos is distinct from (
           select r.preco_centavos from public.loja_reservas r where r.id = item.loja_reserva_id and r.pedido_id = do_site.pedido_id) then
        raise exception 'O preço de um item mudou: confira o carrinho' using errcode = 'OR007';
      end if;
    elsif public.preco_vigente(item.variante_id, venda.unidade_id, case venda.canal when 'online' then 'online' else 'loja' end)
       is distinct from item.preco_unitario_centavos then
      raise exception 'O preço de um item mudou: confira o carrinho' using errcode = 'OR007';
    end if;
    if (item.desconto_centavos > privado.maximo_sem_aprovacao(item) or privado.abaixo_do_custo(item)) and not exists (
         select 1 from public.aprovacoes_desconto a
         where a.item_id = item.id and a.situacao = 'aprovada' and a.conteudo = privado.conteudo_do_item(item) and a.expira_em > now()) then
      raise exception 'Desconto sem aprovação válida' using errcode = 'OR010';
    end if;
    if item.reserva_id is not null then
      select * into reserva from public.estoque_reservas r where r.id = item.reserva_id;
      if reserva.situacao <> 'ativa' or reserva.expira_em <= now() then
        raise exception 'A reserva de um item venceu: tire e coloque de novo' using errcode = 'OR002';
      end if;
    end if;
    subtotal := subtotal + item.preco_unitario_centavos * item.quantidade;
    descontos := descontos + item.desconto_centavos;
    -- PDV-c: o valor do celular (o que a PayJoy e a Aiva podem financiar). PAY-014b: o celular já pago pelo site, não.
    if item.tipo = 'aparelho' and item.loja_reserva_id is null then
      valor_aparelhos := valor_aparelhos + item.preco_unitario_centavos * item.quantidade - item.desconto_centavos;
    end if;
  end loop;
  total := subtotal - descontos;

  -- Pagamentos: a mesma regra de packages/dominio/src/pagamento.ts
  tem_financeira := exists (select 1 from jsonb_array_elements(p_pagamentos) e
                           where jsonb_typeof(e) = 'object' and e ->> 'meio' in ('payjoy', 'aiva'));
  for pagamento in select value from jsonb_array_elements(p_pagamentos) loop
    meio := pagamento ->> 'meio';
    if meio is null or not privado.meio_valido(meio) then
      raise exception 'Meio de pagamento desconhecido' using errcode = 'OR009';
    end if;
    -- PDV-c (pedido do proprietário de 18/11): a quantidade de parcelas em todos os casos que parcelam (a PayJoy, a Aiva
    -- e o cartão) e a entrada do financiamento como um lançamento separado, na mesma venda, em dinheiro, Pix ou cartão.
    if (pagamento ? 'parcelas' and jsonb_typeof(pagamento -> 'parcelas') not in ('number', 'null'))
       or (pagamento ->> 'parcelas' is not null and pagamento ->> 'parcelas' !~ '^[0-9]{1,2}$')
       or (pagamento ? 'entrada_do_financiamento' and jsonb_typeof(pagamento -> 'entrada_do_financiamento') not in ('boolean', 'null')) then
      raise exception 'Parcelas ou entrada em formato inválido' using errcode = 'OR009';
    end if;
    parcelas := (pagamento ->> 'parcelas')::int;
    if privado.meio_financeira(meio) and (parcelas is null or parcelas not between 1 and 48) then
      raise exception 'Informe em quantas parcelas a % financiou (de 1 a 48)', case meio when 'payjoy' then 'PayJoy' else 'Aiva' end
        using errcode = 'OR009';
    end if;
    if meio in ('cartao_picpay', 'cartao_pagseguro') and parcelas is not null and parcelas not between 1 and 24 then
      raise exception 'O cartão parcela de 1 a 24 vezes' using errcode = 'OR009';
    end if;
    if not privado.meio_financeira(meio) and meio not in ('cartao_picpay', 'cartao_pagseguro') and coalesce(parcelas, 1) <> 1 then
      raise exception 'Só o cartão, a PayJoy e a Aiva têm parcelas' using errcode = 'OR009';
    end if;
    if coalesce((pagamento ->> 'entrada_do_financiamento')::boolean, false) then
      if privado.meio_financeira(meio) or meio in ('vale_troca', 'link_pagamento') then
        raise exception 'A entrada do financiamento é paga em dinheiro, Pix ou cartão' using errcode = 'OR009';
      end if;
      if not tem_financeira then
        raise exception 'A entrada só existe numa venda com a PayJoy ou a Aiva' using errcode = 'OR009';
      end if;
    end if;
    if meio = 'link_pagamento' then
      raise exception 'O link de pagamento é só do pagamento pelo site (o banco põe a linha dele): use outro meio' using errcode = 'OR009';
    end if;
    begin
      valor := (pagamento ->> 'valor')::bigint;
      entrada := coalesce((pagamento ->> 'entrada')::bigint, 0);
    exception when others then
      raise exception 'Valor de pagamento inválido' using errcode = 'OR009';
    end;
    if valor is null or valor <= 0 or entrada < 0 or entrada > valor then
      raise exception 'Valor de pagamento inválido' using errcode = 'OR009';
    end if;
    if privado.meio_com_comprovante(meio) and length(trim(coalesce(pagamento ->> 'comprovante', ''))) < 4 then
      raise exception 'Informe o código do comprovante' using errcode = 'OR009';
    end if;
    -- L7a: maquininha usada (obrigatória quando a loja tem maquininha ativa daquele provedor).
    perform privado.terminal_do_pagamento(venda.unidade_id, meio, pagamento ->> 'terminal');
    if privado.meio_financeira(meio) then
      -- 16/11/2026: o e-mail do cliente é opcional também na PayJoy (regra do proprietário de 12/11, #76; DEC-U30
      -- substituída). Exigência de um parceiro só com o contrato dele comprovado, no adaptador e só na operação dele.
      meio_entrada := case when entrada > 0 then coalesce(pagamento ->> 'meio_entrada', 'dinheiro') end;
      if meio_entrada is not null and (not privado.meio_valido(meio_entrada) or privado.meio_financeira(meio_entrada)
                                       or meio_entrada in ('link_pagamento', 'vale_troca')) then
        raise exception 'Meio da entrada inválido' using errcode = 'OR009';
      end if;
      -- Entrada por Pix ou cartão também precisa do comprovante (REV-044, #46).
      if meio_entrada is not null and privado.meio_com_comprovante(meio_entrada)
         and length(trim(coalesce(pagamento ->> 'comprovante', ''))) < 4 then
        raise exception 'Informe o código do comprovante da entrada' using errcode = 'OR009';
      end if;
      recebido := recebido + entrada;
      a_receber := a_receber + valor - entrada;
      financiado := financiado + valor - entrada; -- PDV-c
      -- Troco só sai de linha em dinheiro (REV-046, #48), como em packages/dominio/src/pagamento.ts:
      -- crédito da financeira acima do preço nunca vira dinheiro na mão do cliente.
    else
      if entrada <> 0 then
        raise exception 'Entrada só existe em financiamento' using errcode = 'OR009';
      end if;
      recebido := recebido + valor;
      if meio = 'dinheiro' then
        em_dinheiro := em_dinheiro + valor;
      end if;
    end if;
  end loop;
  -- PAY-014b: o pago pelo site entra como recebido (o dinheiro está com a Asaas; o repasse é da conciliação). O pedido
  -- pago sai pelo preço pago: o desconto que deixe o total abaixo do pago é recusado.
  if pago_pelo_site > total then
    raise exception 'O pedido foi pago pelo site pelo preço anunciado: tire o desconto dos itens dele' using errcode = 'OR009';
  end if;
  recebido := recebido + pago_pelo_site;
  excedente := greatest(0, recebido + a_receber - total);
  troco := least(excedente, em_dinheiro);
  if excedente > troco then
    raise exception 'Pagamento maior que o total sem dinheiro para dar troco' using errcode = 'OR009';
  end if;
  if recebido + a_receber < total then
    raise exception 'Falta pagar %', total - recebido - a_receber using errcode = 'OR009';
  end if;
  -- PDV-c: a PayJoy e a Aiva financiam só o celular. O chip, os acessórios e os serviços entram na mesma venda e são
  -- pagos à parte (a entrada também é um lançamento à parte).
  if financiado > valor_aparelhos then
    if valor_aparelhos = 0 then
      raise exception 'A PayJoy e a Aiva financiam só o celular: esta venda não tem celular' using errcode = 'OR009';
    end if;
    raise exception 'A PayJoy e a Aiva financiam só o valor do celular: o chip, os acessórios e os serviços são pagos à parte'
      using errcode = 'OR009';
  end if;

  -- Estoque: consome as reservas e lança a saída "venda" (reserva e saldo vêm depois dos itens)
  for item in select * from public.venda_itens i where i.venda_id = venda.id order by i.criado_em, i.id loop
    if item.reserva_id is not null then
      perform privado.encerrar_reserva(item.reserva_id, 'consumida');
    end if;
    if item.tipo in ('aparelho', 'chip', 'acessorio') then
      perform privado.lancar_movimento(venda.unidade_id, item.variante_id, -item.quantidade, 'venda', item.item_serializado_id,
        null, 'venda', venda.id::text, 'venda:' || venda.id || ':item:' || item.id, usuario);
    end if;
  end loop;

  -- Pagamentos, caixa e valores a receber
  -- PAY-014b: a linha "pago pelo site" (o link de pagamento da Asaas), gravada pelo banco e sempre a primeira. Como o
  -- cartão, entra no caixa como recebimento do seu meio (o fechamento conta só o dinheiro).
  if do_site.id is not null then
    ordem := ordem + 1;
    insert into public.venda_pagamentos (organizacao_id, venda_id, ordem, meio, valor_centavos, entrada_centavos, comprovante, confirmacao,
                                         confirmado_por, loja_pagamento_id)
    values (venda.organizacao_id, venda.id, ordem, 'link_pagamento', do_site.valor_centavos, 0, do_site.id_no_provedor, 'provedor',
            usuario, do_site.id)
    returning id into pagamento_id;
    insert into public.caixa_movimentos (organizacao_id, caixa_id, tipo, meio, valor_centavos, venda_id, pagamento_id, usuario_id, chave_idempotencia)
    values (venda.organizacao_id, caixa.id, 'recebimento', 'link_pagamento', do_site.valor_centavos, venda.id, pagamento_id, usuario,
            'venda:' || venda.id || ':pagamento:' || ordem);
  end if;
  for pagamento in select value from jsonb_array_elements(p_pagamentos) loop
    ordem := ordem + 1;
    meio := pagamento ->> 'meio';
    valor := (pagamento ->> 'valor')::bigint;
    entrada := coalesce((pagamento ->> 'entrada')::bigint, 0);
    meio_entrada := case when privado.meio_financeira(meio) and entrada > 0 then coalesce(pagamento ->> 'meio_entrada', 'dinheiro') end;
    comprovante := nullif(trim(coalesce(pagamento ->> 'comprovante', '')), '');
    terminal_escolhido := privado.terminal_do_pagamento(venda.unidade_id, meio, pagamento ->> 'terminal'); -- L7a
    parcelas := (pagamento ->> 'parcelas')::int; -- PDV-c
    insert into public.venda_pagamentos (organizacao_id, venda_id, ordem, meio, valor_centavos, entrada_centavos, meio_entrada, comprovante, confirmacao, confirmado_por,
                                         terminal_id, parcelas, entrada_do_financiamento) -- L7a, PDV-c
    values (venda.organizacao_id, venda.id, ordem, meio, valor, entrada, meio_entrada, comprovante,
            case when meio = 'dinheiro' then 'caixa' when privado.meio_financeira(meio) then 'financeira' else 'manual' end, usuario,
            terminal_escolhido,
            case when privado.meio_financeira(meio) or meio in ('cartao_picpay', 'cartao_pagseguro') then coalesce(parcelas, 1) end,
            coalesce((pagamento ->> 'entrada_do_financiamento')::boolean, false))
    returning id into pagamento_id;
    if privado.meio_financeira(meio) then
      if entrada > 0 then
        insert into public.caixa_movimentos (organizacao_id, caixa_id, tipo, meio, valor_centavos, venda_id, pagamento_id, usuario_id, chave_idempotencia)
        values (venda.organizacao_id, caixa.id, 'recebimento', meio_entrada, entrada, venda.id, pagamento_id, usuario, 'venda:' || venda.id || ':pagamento:' || ordem);
      end if;
      if valor - entrada > 0 then
        insert into public.contas_a_receber (organizacao_id, unidade_id, venda_id, pagamento_id, devedor, valor_centavos)
        values (venda.organizacao_id, venda.unidade_id, venda.id, pagamento_id, meio, valor - entrada);
      end if;
    else
      insert into public.caixa_movimentos (organizacao_id, caixa_id, tipo, meio, valor_centavos, venda_id, pagamento_id, usuario_id, chave_idempotencia)
      values (venda.organizacao_id, caixa.id, 'recebimento', meio, valor, venda.id, pagamento_id, usuario, 'venda:' || venda.id || ':pagamento:' || ordem);
    end if;
  end loop;
  if troco > 0 then
    insert into public.caixa_movimentos (organizacao_id, caixa_id, tipo, meio, valor_centavos, venda_id, usuario_id, chave_idempotencia)
    values (venda.organizacao_id, caixa.id, 'troco', 'dinheiro', -troco, venda.id, usuario, 'venda:' || venda.id || ':troco');
  end if;

  update public.vendas v
  set situacao = 'concluida', concluida_em = now(), subtotal_centavos = subtotal, desconto_centavos = descontos, total_centavos = total,
      troco_centavos = troco, recebido_centavos = recebido - troco, a_receber_centavos = a_receber, caixa_id = caixa.id,
      chave_conclusao = p_chave, conteudo_conclusao = conteudo,
      cliente_nome = coalesce(nome, v.cliente_nome), cliente_email = coalesce(email, v.cliente_email),
      cliente_id = coalesce(cliente_rede, v.cliente_id) -- L5a
  where v.id = venda.id
  returning * into venda;
  -- L12c: a OS fica cobrada por esta venda, com o evento na trilha (a produção é a da venda, uma vez).
  for os_da_venda in select o.* from public.ordens_servico o
                     where o.id in (select i.os_id from public.venda_itens i where i.venda_id = venda.id and i.os_id is not null)
                     order by o.id loop
    update public.ordens_servico o set venda_id = venda.id, cobrada_em = now(), atualizada_em = now() where o.id = os_da_venda.id;
    perform privado.os_evento(os_da_venda, 'cobrada', null, null, 'Venda nº ' || venda.numero, false, venda.unidade_id);
  end loop;
  return jsonb_build_object('venda', venda.id, 'numero', venda.numero, 'total', total, 'troco', troco,
                            'recebido', recebido - troco, 'a_receber', a_receber, 'pago_pelo_site', pago_pelo_site, 'repetida', false);
end;
$$;

-- 5) Cancelar a venda (a do lote 2 de integridade), com a venda aberta do pedido pago presa até o estorno.
create or replace function public.cancelar_venda(p_venda uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  venda public.vendas;
  caixa public.caixas;
  item public.venda_itens;
  pagamento public.venda_pagamentos;
  troco_a_descontar bigint;
  devolver bigint;
  descontar bigint;
  em_dinheiro bigint := 0;
  dinheiro_por_pagamento jsonb := '{}'::jsonb;
  externo boolean;
begin
  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'Informe o motivo' using errcode = '22023';
  end if;
  select * into venda from public.vendas v where v.id = p_venda for update;
  if not found or venda.unidade_id is distinct from (select public.unidade_atual())
     or not ((venda.vendedor_id = usuario and venda.situacao in ('rascunho', 'aguardando_aprovacao')
              and (select public.tem_permissao('venda.registrar', venda.unidade_id)))
             or (select public.tem_permissao('venda.cancelar', venda.unidade_id))) then
    raise exception 'Venda não encontrada' using errcode = 'P0002';
  end if;
  if venda.situacao = 'cancelada' then
    return false;
  end if;
  -- PAY-014b: a venda aberta do pedido pago pelo site não se cancela enquanto o dinheiro não voltar (OR048, como o pedido):
  -- o estorno é pelo painel da Asaas, e o aviso dele volta pelo worker. Concluída, segue o cancelamento de sempre (a linha
  -- do link vira estorno externo a confirmar com o comprovante).
  if venda.situacao in ('rascunho', 'aguardando_aprovacao') and exists (
       select 1 from public.loja_pedidos p join public.loja_pagamentos pg on pg.pedido_id = p.id
       where p.venda_id = venda.id and pg.situacao = 'pago') then
    raise exception 'O pedido desta venda foi pago pelo site: conclua a venda; para desistir, o estorno é pelo painel da Asaas'
      using errcode = 'OR048';
  end if;

  if venda.situacao in ('rascunho', 'aguardando_aprovacao') then
    for item in select * from public.venda_itens i where i.venda_id = venda.id loop
      if item.reserva_id is not null then
        perform privado.encerrar_reserva(item.reserva_id, 'liberada');
      end if;
    end loop;
    update public.aprovacoes_desconto a set situacao = 'invalidada' where a.venda_id = venda.id and a.situacao in ('pendente', 'aprovada');
  else
    -- Concluída: o cancelamento comercial separa três coisas (REV-047/048/049, #49–#51):
    --   * dinheiro: devolve o recebido líquido (troco descontado), do caixa de quem cancela, com o
    --     saldo conferido sob a trava do caixa — inclusive a entrada em dinheiro (#47);
    --   * Pix, cartão e financeira: estorno A CONFIRMAR com o comprovante (estornos_externos);
    --     o pagamento fica "estorno_pendente" até lá (#50);
    --   * aparelho, chip e acessório: aguardam o retorno físico conferido (venda_retornos); nada volta
    --     sozinho ao estoque (#51). Chip com ativação viva na Ora Connect impede o cancelamento.
    caixa := privado.meu_caixa_aberto();
    if exists (
         select 1 from public.connect_operacoes o
         where o.organizacao_id = venda.organizacao_id and o.tipo = 'ativacao'
           and o.situacao not in ('recusada', 'negada', 'nao_recebida', 'cancelada')
           and (o.venda_chip_id = venda.id or o.iccid in (
                 select s.iccid from public.venda_itens i join public.itens_serializados s on s.id = i.item_serializado_id
                 where i.venda_id = venda.id and s.iccid is not null))) then
      raise exception 'Chip com ativação na Ora Connect: resolva a operação antes de cancelar' using errcode = 'OR013';
    end if;
    troco_a_descontar := coalesce(venda.troco_centavos, 0);
    for pagamento in select * from public.venda_pagamentos p where p.venda_id = venda.id and p.situacao = 'confirmado' order by p.ordem loop
      devolver := case when pagamento.meio = 'dinheiro' then pagamento.valor_centavos
                       when privado.meio_financeira(pagamento.meio) and pagamento.meio_entrada = 'dinheiro' then pagamento.entrada_centavos
                       else 0 end;
      descontar := least(devolver, troco_a_descontar);
      troco_a_descontar := troco_a_descontar - descontar;
      devolver := devolver - descontar;
      if devolver > 0 then
        dinheiro_por_pagamento := dinheiro_por_pagamento || jsonb_build_object(pagamento.id::text, devolver);
        em_dinheiro := em_dinheiro + devolver;
      end if;
    end loop;
    if em_dinheiro > privado.dinheiro_no_caixa(caixa.id) then
      raise exception 'Não há dinheiro suficiente no seu caixa para devolver' using errcode = '23514';
    end if;
    for item in select * from public.venda_itens i where i.venda_id = venda.id order by i.criado_em, i.id loop
      if item.tipo in ('aparelho', 'chip', 'acessorio') then
        insert into public.venda_retornos (organizacao_id, unidade_id, venda_id, venda_item_id, quantidade, motivo, solicitado_por)
        values (venda.organizacao_id, venda.unidade_id, venda.id, item.id, item.quantidade, trim(p_motivo), usuario);
      end if;
    end loop;
    for pagamento in select * from public.venda_pagamentos p where p.venda_id = venda.id and p.situacao = 'confirmado' order by p.ordem loop
      devolver := coalesce((dinheiro_por_pagamento ->> pagamento.id::text)::bigint, 0);
      if devolver > 0 then
        insert into public.caixa_movimentos (organizacao_id, caixa_id, tipo, meio, valor_centavos, venda_id, pagamento_id, motivo, usuario_id, chave_idempotencia)
        values (venda.organizacao_id, caixa.id, 'estorno', 'dinheiro', -devolver, venda.id, pagamento.id,
                trim(p_motivo), usuario, 'venda:' || venda.id || ':estorno:' || pagamento.ordem);
      end if;
      externo := false;
      if privado.meio_financeira(pagamento.meio) then
        update public.contas_a_receber r set situacao = 'cancelada', atualizado_em = now() where r.pagamento_id = pagamento.id and r.situacao = 'aberta';
        -- O contrato na financeira se cancela fora daqui: fica a confirmar com o protocolo.
        if pagamento.valor_centavos - pagamento.entrada_centavos > 0 then
          insert into public.estornos_externos (organizacao_id, unidade_id, venda_id, pagamento_id, meio, valor_centavos, solicitado_por)
          values (venda.organizacao_id, venda.unidade_id, venda.id, pagamento.id, pagamento.meio,
                  pagamento.valor_centavos - pagamento.entrada_centavos, usuario);
          externo := true;
        end if;
        if pagamento.entrada_centavos > 0 and pagamento.meio_entrada <> 'dinheiro' then
          insert into public.estornos_externos (organizacao_id, unidade_id, venda_id, pagamento_id, meio, valor_centavos, solicitado_por)
          values (venda.organizacao_id, venda.unidade_id, venda.id, pagamento.id, pagamento.meio_entrada, pagamento.entrada_centavos, usuario);
          externo := true;
        end if;
      elsif pagamento.meio not in ('dinheiro', 'vale_troca') then
        insert into public.estornos_externos (organizacao_id, unidade_id, venda_id, pagamento_id, meio, valor_centavos, solicitado_por)
        values (venda.organizacao_id, venda.unidade_id, venda.id, pagamento.id, pagamento.meio, pagamento.valor_centavos, usuario);
        externo := true;
      end if;
      -- Dinheiro e vale-troca se resolvem aqui; o resto espera o comprovante do estorno.
      update public.venda_pagamentos p
      set situacao = case when externo then 'estorno_pendente' else 'estornado' end,
          estornado_em = case when externo then null else now() end
      where p.id = pagamento.id;
    end loop;
  end if;
  perform set_config('ora.motivo', trim(p_motivo), true);
  update public.vendas v
  set situacao = 'cancelada', cancelada_em = now(), cancelada_por = usuario, motivo_cancelamento = trim(p_motivo)
  where v.id = venda.id;
  return true;
end;
$$;

-- 6) Tirar um item (a da fundação das vendas), menos o pago pelo site.
create or replace function public.remover_item(p_item uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  item public.venda_itens;
  venda public.vendas;
begin
  select * into item from public.venda_itens i where i.id = p_item;
  if not found then
    raise exception 'Item não encontrado' using errcode = 'P0002';
  end if;
  venda := privado.minha_venda_aberta(item.venda_id);
  -- PAY-014b: o item pago pelo site não sai da venda enquanto o pagamento estiver pago (o estorno é pelo painel da Asaas).
  if item.loja_reserva_id is not null and exists (
       select 1 from public.loja_reservas r join public.loja_pagamentos pg on pg.pedido_id = r.pedido_id
       where r.id = item.loja_reserva_id and pg.situacao = 'pago') then
    raise exception 'Este item foi pago pelo site: ele não sai da venda' using errcode = 'OR048';
  end if;
  if item.reserva_id is not null then
    perform privado.encerrar_reserva(item.reserva_id, 'liberada');
  end if;
  update public.aprovacoes_desconto a set situacao = 'invalidada'
  where a.item_id = item.id and a.situacao in ('pendente', 'aprovada');
  delete from public.venda_itens i where i.id = item.id;
  perform privado.atualizar_espera_de_aprovacao(venda.id);
  return true;
end;
$$;

-- 7) A tela do PDV (a do VEL-a), com o pago pelo site.
create or replace function public.pdv_tela()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_eu constant uuid := (select auth.uid());
  v_unidade constant uuid := (select public.unidade_atual());
  v_caixa jsonb;
  v_venda_id uuid;
  v_venda jsonb;
  v_itens jsonb := '[]'::jsonb;
  v_terminais jsonb := '[]'::jsonb;
begin
  -- Sem sessão ou sem loja do turno não há PDV: resposta vazia (a tela já manda escolher a loja).
  if v_eu is null or v_unidade is null then
    return jsonb_build_object('caixa', null, 'venda', null, 'itens', '[]'::jsonb, 'terminais', '[]'::jsonb);
  end if;

  select jsonb_build_object('id', c.id, 'aberto_em', c.aberto_em)
  into v_caixa
  from public.caixas c
  where c.operador_id = v_eu and c.unidade_id = v_unidade and c.situacao = 'aberto'
  order by c.aberto_em desc, c.id
  limit 1;

  select v.id, jsonb_build_object('id', v.id, 'numero', v.numero, 'situacao', v.situacao,
           -- PAY-014b: o que o pedido do site desta venda já pagou (a tela cobra só o resto).
           'pago_pelo_site_centavos', (select sum(pg.valor_centavos) from public.loja_pedidos p
                                       join public.loja_pagamentos pg on pg.pedido_id = p.id
                                       where p.venda_id = v.id and pg.situacao = 'pago'))
  into v_venda_id, v_venda
  from public.vendas v
  where v.vendedor_id = v_eu and v.unidade_id = v_unidade and v.situacao in ('rascunho', 'aguardando_aprovacao')
  order by v.criado_em desc, v.id
  limit 1;

  if v_venda_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id,
        'variante_id', i.variante_id,
        'item_serializado_id', i.item_serializado_id,
        'tipo', i.tipo,
        'quantidade', i.quantidade,
        'preco_unitario_centavos', i.preco_unitario_centavos,
        'desconto_centavos', i.desconto_centavos,
        'preco_id', i.preco_id,
        'os_id', i.os_id,
        'loja_reserva_id', i.loja_reserva_id, -- PAY-014b: o item pago pelo site
        'variante', (select jsonb_build_object('sku', va.sku, 'nome', va.nome) from public.variantes va where va.id = i.variante_id),
        'serial', (select jsonb_build_object('imei', s.imei, 'iccid', s.iccid) from public.itens_serializados s where s.id = i.item_serializado_id),
        -- A regra de preço gravada no item (L6b): a tela só mostra quando é campanha.
        'preco', (select jsonb_build_object('id', p.id, 'origem', p.origem, 'unidade_id', p.unidade_id, 'motivo', p.motivo, 'fim', p.fim)
                  from public.precos p where p.id = i.preco_id),
        -- O conserto da ordem de serviço no carrinho (L12c).
        'os', (select jsonb_build_object('id', o.id, 'numero', o.numero, 'situacao', o.situacao) from public.ordens_servico o where o.id = i.os_id),
        -- O pedido de aprovação de desconto mais recente do item.
        'aprovacao', (select a.situacao from public.aprovacoes_desconto a
                      where a.venda_id = i.venda_id and a.item_id = i.id
                      order by a.solicitado_em desc, a.id desc limit 1)
      ) order by i.criado_em, i.id), '[]'::jsonb)
    into v_itens
    from public.venda_itens i
    where i.venda_id = v_venda_id;
  end if;

  -- Maquininhas ativas da loja (L7a): quem paga por maquininha escolhe qual foi usada.
  select coalesce(
    jsonb_agg(jsonb_build_object('id', t.id, 'provedor', t.provedor, 'apelido', t.apelido, 'identificador', t.identificador) order by t.apelido, t.id),
    '[]'::jsonb)
  into v_terminais
  from public.terminais t
  where t.unidade_id = v_unidade and t.ativo;

  return jsonb_build_object('caixa', v_caixa, 'venda', v_venda, 'itens', v_itens, 'terminais', v_terminais);
end;
$$;
