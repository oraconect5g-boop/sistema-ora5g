-- Desative a tela nova antes de reverter. Não converte nem remove dados registrados de maquininha.
do $$
begin
  if exists (select 1 from public.terminais where provedor = 'mercado_pago')
     or exists (select 1 from public.venda_pagamentos where modalidade_cartao is not null or bandeira_cartao is not null or acrescimo_cliente_centavos is not null) then
    raise exception 'Reversão interrompida: existem dados do novo fluxo de maquininha; preserve o histórico';
  end if;
end;
$$;

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
  pix public.caixa_pix; -- PAY-015a
  pix_pagos bigint := 0; -- PAY-015a
  cartao public.caixa_cartao; -- PAY-015b
  cartao_pagos bigint := 0; -- PAY-015b
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
  -- PAY-015a: os Pix pela Asaas da venda, travados até o fim da conclusão (o worker trava o QR antes de mexer). Um QR que
  -- ainda espera segura a conclusão: ou ele é pago, ou cancelado.
  perform 1 from public.caixa_pix x where x.venda_id = venda.id order by x.id for update;
  if exists (select 1 from public.caixa_pix x where x.venda_id = venda.id and x.situacao in ('criando', 'aguardando', 'cancelando')) then
    raise exception 'Há um Pix pela Asaas esperando: espere o pagamento ou cancele o QR Code' using errcode = 'OR059';
  end if;
  select coalesce(sum(x.valor_centavos), 0) into pix_pagos from public.caixa_pix x where x.venda_id = venda.id and x.situacao = 'pago';
  -- PAY-015b: os links do cartão pela Asaas, do mesmo jeito (travados; o que espera segura a conclusão).
  perform 1 from public.caixa_cartao x where x.venda_id = venda.id order by x.id for update;
  if exists (select 1 from public.caixa_cartao x where x.venda_id = venda.id and x.situacao in ('criando', 'aguardando', 'cancelando')) then
    raise exception 'Há um cartão pela Asaas esperando: espere o pagamento ou cancele o link' using errcode = 'OR059';
  end if;
  select coalesce(sum(x.valor_centavos), 0) into cartao_pagos from public.caixa_cartao x where x.venda_id = venda.id and x.situacao = 'pago';
  if jsonb_array_length(p_pagamentos) = 0 and pago_pelo_site = 0 and pix_pagos = 0 and cartao_pagos = 0 then
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
    -- PAY-015a: o Pix pela Asaas também entra sozinho (o banco põe a linha de cada QR pago).
    if meio = 'pix_asaas' then
      raise exception 'O Pix pela Asaas entra sozinho quando o QR Code é pago: use outro meio' using errcode = 'OR009';
    end if;
    -- PAY-015b: o cartão pela Asaas também (o banco põe a linha de cada link pago).
    if meio = 'cartao_asaas' then
      raise exception 'O cartão pela Asaas entra sozinho quando o link é pago: use outro meio' using errcode = 'OR009';
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
                                       or meio_entrada in ('link_pagamento', 'vale_troca', 'pix_asaas', 'cartao_asaas')) then
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
  -- PAY-015a: o Pix pela Asaas pago entra como recebido (o dinheiro está com a Asaas; o repasse é da conciliação). Ele não
  -- dá troco: o que passar do total volta pela Asaas.
  if pago_pelo_site + pix_pagos > total then
    raise exception 'O Pix pela Asaas pago passa do total da venda: devolva a diferença pela Asaas ou ponha o item de volta' using errcode = 'OR009';
  end if;
  -- PAY-015b: o cartão pela Asaas pago, do mesmo jeito (sem troco: o que passar do total volta pela Asaas).
  if pago_pelo_site + pix_pagos + cartao_pagos > total then
    raise exception 'O cartão pela Asaas pago passa do total da venda: devolva a diferença pela Asaas ou ponha o item de volta' using errcode = 'OR009';
  end if;
  recebido := recebido + pago_pelo_site + pix_pagos + cartao_pagos;
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
  -- PAY-015a: as linhas "Pix pela Asaas" (uma por QR pago), gravadas pelo banco depois da do site. Como o cartão, entram
  -- no caixa como recebimento do seu meio (o fechamento conta só o dinheiro).
  for pix in select x.* from public.caixa_pix x where x.venda_id = venda.id and x.situacao = 'pago' order by x.numero loop
    ordem := ordem + 1;
    insert into public.venda_pagamentos (organizacao_id, venda_id, ordem, meio, valor_centavos, entrada_centavos, comprovante, confirmacao,
                                         confirmado_por, caixa_pix_id)
    values (venda.organizacao_id, venda.id, ordem, 'pix_asaas', pix.valor_centavos, 0, pix.id_no_provedor, 'provedor', usuario, pix.id)
    returning id into pagamento_id;
    insert into public.caixa_movimentos (organizacao_id, caixa_id, tipo, meio, valor_centavos, venda_id, pagamento_id, usuario_id, chave_idempotencia)
    values (venda.organizacao_id, caixa.id, 'recebimento', 'pix_asaas', pix.valor_centavos, venda.id, pagamento_id, usuario,
            'venda:' || venda.id || ':pagamento:' || ordem);
  end loop;
  -- PAY-015b: as linhas "Cartão pela Asaas" (uma por link pago), depois das do Pix. No caixa, recebimento do seu meio.
  for cartao in select x.* from public.caixa_cartao x where x.venda_id = venda.id and x.situacao = 'pago' order by x.numero loop
    ordem := ordem + 1;
    insert into public.venda_pagamentos (organizacao_id, venda_id, ordem, meio, valor_centavos, entrada_centavos, comprovante, confirmacao,
                                         confirmado_por, caixa_cartao_id)
    values (venda.organizacao_id, venda.id, ordem, 'cartao_asaas', cartao.valor_centavos, 0, cartao.id_no_provedor, 'provedor', usuario, cartao.id)
    returning id into pagamento_id;
    insert into public.caixa_movimentos (organizacao_id, caixa_id, tipo, meio, valor_centavos, venda_id, pagamento_id, usuario_id, chave_idempotencia)
    values (venda.organizacao_id, caixa.id, 'recebimento', 'cartao_asaas', cartao.valor_centavos, venda.id, pagamento_id, usuario,
            'venda:' || venda.id || ':pagamento:' || ordem);
  end loop;
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
                            'recebido', recebido - troco, 'a_receber', a_receber, 'pago_pelo_site', pago_pelo_site, 'pago_no_pix', pix_pagos, 'pago_no_cartao', cartao_pagos, 'repetida', false);
end;
$$;

create or replace function privado.meio_valido(p_meio text)
returns boolean language sql immutable set search_path = ''
as $$ select p_meio in ('dinheiro', 'pix_direto', 'pix_picpay', 'cartao_picpay', 'cartao_pagseguro', 'link_pagamento', 'payjoy', 'aiva', 'vale_troca', 'pix_asaas', 'cartao_asaas'); $$;

create or replace function privado.meio_com_comprovante(p_meio text)
returns boolean language sql immutable set search_path = ''
as $$ select p_meio in ('pix_direto', 'pix_picpay', 'cartao_picpay', 'cartao_pagseguro', 'vale_troca'); $$;

create or replace function privado.meio_provedor(p_meio text)
returns text language sql immutable set search_path = ''
as $$ select case when p_meio in ('pix_picpay', 'cartao_picpay') then 'picpay' when p_meio = 'cartao_pagseguro' then 'pagbank' end; $$;

create or replace function privado.meio_liquidavel(p_meio text)
returns boolean language sql immutable set search_path = ''
as $$ select p_meio in ('pix_direto', 'pix_picpay', 'cartao_picpay', 'cartao_pagseguro'); $$;

create or replace function public.terminal_salvar(p_id uuid, p_unidade uuid, p_provedor text, p_identificador text, p_apelido text, p_ativo boolean, p_motivo text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_unidade public.unidades;
  v_atual public.terminais;
  v_apelido text := regexp_replace(trim(coalesce(p_apelido, '')), '\s+', ' ', 'g');
  v_identificador text := upper(trim(coalesce(p_identificador, '')));
  v_id uuid;
begin
  if p_id is not null then
    select * into v_atual from public.terminais t where t.id = p_id for no key update;
    if not found or not public.tem_permissao('terminal.gerir', v_atual.unidade_id) then
      raise exception 'Maquininha não encontrada para você' using errcode = 'P0002';
    end if;
    perform set_config('ora.motivo', v_motivo, true);
    if length(v_apelido) not between 2 and 60 then
      raise exception 'Dê um apelido à maquininha (de 2 a 60 letras), por exemplo "Balcão 1"' using errcode = '22023';
    end if;
    update public.terminais t set apelido = v_apelido, ativo = coalesce(p_ativo, t.ativo) where t.id = v_atual.id;
    return v_atual.id;
  end if;
  select * into v_unidade from public.unidades u where u.id = p_unidade;
  if not found or not public.tem_permissao('terminal.gerir', p_unidade) then
    raise exception 'Sem permissão para cadastrar maquininha nesta loja' using errcode = '42501';
  end if;
  if p_provedor is null or p_provedor not in ('picpay', 'pagbank') then
    raise exception 'Escolha o provedor da maquininha' using errcode = '22023';
  end if;
  if v_identificador !~ '^[A-Z0-9._/-]{3,40}$' then
    raise exception 'Número do terminal inválido (de 3 a 40 letras e números)' using errcode = '22023';
  end if;
  if length(v_apelido) not between 2 and 60 then
    raise exception 'Dê um apelido à maquininha (de 2 a 60 letras), por exemplo "Balcão 1"' using errcode = '22023';
  end if;
  perform set_config('ora.motivo', v_motivo, true);
  begin
    insert into public.terminais (organizacao_id, unidade_id, provedor, identificador, apelido, criado_por)
    values (v_unidade.organizacao_id, p_unidade, p_provedor, v_identificador, v_apelido, (select auth.uid()))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Esta maquininha já está cadastrada na rede' using errcode = 'OR020';
  end;
  return v_id;
end;
$$;

alter table public.venda_pagamentos drop constraint venda_pagamentos_detalhe_cartao_manual;
alter table public.venda_pagamentos drop constraint venda_pagamentos_parcelas_so_no_que_parcela;
alter table public.venda_pagamentos add constraint venda_pagamentos_parcelas_so_no_que_parcela check (parcelas is null or privado.meio_financeira(meio) or meio in ('cartao_picpay', 'cartao_pagseguro'));
alter table public.venda_pagamentos drop column modalidade_cartao, drop column bandeira_cartao, drop column acrescimo_cliente_centavos;
alter table public.terminais drop constraint terminais_provedor_check;
alter table public.terminais add constraint terminais_provedor_check check (provedor in ('picpay', 'pagbank'));
drop function privado.validar_tender_manual(jsonb, text, bigint, int);
