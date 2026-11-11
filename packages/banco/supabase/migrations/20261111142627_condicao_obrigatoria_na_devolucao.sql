-- =============================================================================
-- Condição obrigatória na devolução (lote L4b: ORA-INV-010)
--
-- devolver_itens gravava o aparelho, o chip ou o acessório devolvido como "novo" quando a condição
-- não vinha no pedido, e a tela já abria com "novo" marcado: um item usado podia voltar ao estoque
-- como novo sem ninguém decidir. Agora a condição (novo, seminovo ou avariado) é obrigatória para
-- todo item físico devolvido; o resto da função é o mesmo texto aplicado em
-- 20261109190240_integridade_vendas_lote2 (só o bloco marcado mudou).
-- Reversão: supabase/reversao/<mesmo nome>.sql (volta o texto anterior).
-- =============================================================================

create or replace function public.devolver_itens(p_venda uuid, p_itens jsonb, p_reembolsos jsonb, p_motivo text, p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  venda public.vendas;
  existente public.venda_devolucoes;
  conteudo text;
  caixa public.caixas;
  linha jsonb;
  item public.venda_itens;
  calculados jsonb := '[]'::jsonb;
  ids_itens uuid[] := '{}';
  quantidade_pedida int;
  ja_devolvida int;
  condicao_retorno text;
  valor_item bigint;
  total bigint := 0;
  meio_reembolso text;
  meios_vistos text[] := '{}';
  valor bigint;
  soma_reembolsos bigint := 0;
  em_vale bigint := 0;
  em_dinheiro bigint := 0;
  pago bigint;
  devolvido_antes bigint;
  precisa_caixa boolean := false;
  devolucao public.venda_devolucoes;
  vale public.vales_troca;
  nota public.notas_pedidos;
begin
  if p_chave is null or length(trim(p_chave)) = 0 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  select * into venda from public.vendas v where v.id = p_venda;
  if not found or venda.unidade_id is distinct from (select public.unidade_atual())
     or not (select public.tem_permissao('venda.cancelar', venda.unidade_id)) then
    raise exception 'Venda não encontrada' using errcode = 'P0002';
  end if;
  conteudo := md5(concat_ws('|', p_venda, coalesce(p_itens, 'null'::jsonb)::text, coalesce(p_reembolsos, 'null'::jsonb)::text, trim(coalesce(p_motivo, ''))));

  -- (0) chave: a repetição devolve o mesmo resultado; outro conteúdo, OR004
  perform pg_advisory_xact_lock(privado.trava_da_chave('devolucoes', venda.organizacao_id, p_chave));
  select * into existente from public.venda_devolucoes d where d.organizacao_id = venda.organizacao_id and d.chave = p_chave;
  if found then
    if existente.conteudo <> conteudo or existente.criado_por <> usuario then
      raise exception 'Chave de idempotência já usada em outra operação' using errcode = 'OR004';
    end if;
    return jsonb_build_object('devolucao', existente.id, 'numero', existente.numero, 'valor', existente.valor_centavos,
                              'vale', (select v.numero from public.vales_troca v where v.devolucao_id = existente.id), 'repetida', true);
  end if;
  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'Informe o motivo' using errcode = '22023';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Escolha ao menos um item' using errcode = '22023';
  end if;
  if p_reembolsos is null or jsonb_typeof(p_reembolsos) <> 'array' or jsonb_array_length(p_reembolsos) = 0 then
    raise exception 'Informe como o valor volta ao cliente' using errcode = 'OR009';
  end if;

  -- (1) venda travada
  select * into venda from public.vendas v where v.id = p_venda for update;
  if venda.situacao <> 'concluida' then
    raise exception 'Só venda concluída tem devolução' using errcode = '22023';
  end if;
  if exists (select 1 from public.venda_pagamentos p where p.venda_id = venda.id and p.situacao = 'confirmado' and privado.meio_financeira(p.meio)) then
    raise exception 'Venda financiada: a devolução parcial passa pela financeira; use o cancelamento total' using errcode = 'OR016';
  end if;

  -- Itens: da venda, sem repetir, até o que resta; valor com a parte acumulada do desconto.
  for linha in select value from jsonb_array_elements(p_itens) loop
    if coalesce(linha ->> 'item', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Item inválido' using errcode = '22023';
    end if;
    select * into item from public.venda_itens i where i.id = (linha ->> 'item')::uuid and i.venda_id = venda.id;
    if not found then
      raise exception 'O item não é desta venda' using errcode = 'P0002';
    end if;
    if item.id = any (ids_itens) then
      raise exception 'Item repetido na devolução' using errcode = '22023';
    end if;
    ids_itens := ids_itens || item.id;
    if coalesce(linha ->> 'quantidade', '1') !~ '^[0-9]{1,4}$' then
      raise exception 'Quantidade inválida' using errcode = '22023';
    end if;
    quantidade_pedida := coalesce(linha ->> 'quantidade', '1')::int;
    select coalesce(sum(di.quantidade), 0) into ja_devolvida from public.venda_devolucao_itens di where di.venda_item_id = item.id;
    if quantidade_pedida < 1 or quantidade_pedida > item.quantidade - ja_devolvida then
      raise exception 'Quantidade maior que a que resta deste item' using errcode = '22023';
    end if;
    condicao_retorno := nullif(linha ->> 'condicao', '');
    if item.tipo in ('aparelho', 'chip', 'acessorio') then
      -- Condição informada por quem recebe (ORA-INV-010): o item devolvido não volta "novo" por omissão.
      if condicao_retorno is null or condicao_retorno not in ('novo', 'seminovo', 'avariado') then
        raise exception 'Informe a condição do item devolvido: novo, seminovo ou avariado' using errcode = '22023';
      end if;
      -- Identidade conferida no balcão (REV-049, #51): o IMEI/ICCID devolvido é o do item vendido.
      if item.item_serializado_id is not null and not exists (
           select 1 from public.itens_serializados s
           where s.id = item.item_serializado_id
             and regexp_replace(coalesce(linha ->> 'identificador', ''), '[^0-9]', '', 'g') in (s.imei, s.imei2, s.iccid)) then
        raise exception 'Confira o IMEI/ICCID: o item devolvido precisa ser o que foi vendido' using errcode = '22023';
      end if;
    else
      condicao_retorno := null;
      if exists (select 1 from public.connect_operacoes o where o.venda_item_id = item.id
                 and o.situacao not in ('recusada', 'negada', 'nao_recebida', 'cancelada')) then
        raise exception 'Serviço com operação da Ora Connect em andamento ou feita: resolva a operação antes' using errcode = 'OR013';
      end if;
    end if;
    valor_item := item.preco_unitario_centavos * quantidade_pedida
      - (item.desconto_centavos * (ja_devolvida + quantidade_pedida) / item.quantidade - item.desconto_centavos * ja_devolvida / item.quantidade);
    total := total + valor_item;
    calculados := calculados || jsonb_build_array(jsonb_build_object(
      'item', item.id, 'quantidade', quantidade_pedida, 'valor', valor_item, 'condicao', condicao_retorno));
  end loop;
  if total <= 0 then
    raise exception 'Nada a devolver em dinheiro ou vale' using errcode = '22023';
  end if;

  -- Reembolso: só nos meios pagos, até o que cada um pagou menos o já devolvido; o vale à parte.
  for linha in select value from jsonb_array_elements(p_reembolsos) loop
    meio_reembolso := linha ->> 'meio';
    if coalesce(linha ->> 'valor', '') !~ '^[0-9]{1,12}$' or (linha ->> 'valor')::bigint <= 0 or meio_reembolso is null then
      raise exception 'Valor de reembolso inválido' using errcode = 'OR009';
    end if;
    valor := (linha ->> 'valor')::bigint;
    if meio_reembolso = any (meios_vistos) then
      raise exception 'Um valor por meio de reembolso' using errcode = 'OR009';
    end if;
    meios_vistos := meios_vistos || meio_reembolso;
    if meio_reembolso = 'vale_troca' then
      em_vale := em_vale + valor;
    else
      if not privado.meio_valido(meio_reembolso) or privado.meio_financeira(meio_reembolso) or meio_reembolso = 'link_pagamento' then
        raise exception 'Meio de reembolso inválido' using errcode = 'OR009';
      end if;
      select coalesce(sum(p.valor_centavos), 0) into pago from public.venda_pagamentos p
      where p.venda_id = venda.id and p.situacao = 'confirmado' and p.meio = meio_reembolso;
      if meio_reembolso = 'dinheiro' then
        pago := pago - coalesce(venda.troco_centavos, 0);
        em_dinheiro := valor;
      end if;
      select coalesce(sum(r.valor_centavos), 0) into devolvido_antes
      from public.venda_devolucao_reembolsos r join public.venda_devolucoes d on d.id = r.devolucao_id
      where d.venda_id = venda.id and r.meio = meio_reembolso;
      if valor > pago - devolvido_antes then
        raise exception 'O reembolso em % passa do que esse meio pagou', meio_reembolso using errcode = 'OR009';
      end if;
      -- Só o dinheiro sai do caixa agora; Pix e cartão ficam como estorno a confirmar (#50).
      precisa_caixa := precisa_caixa or meio_reembolso = 'dinheiro';
    end if;
    soma_reembolsos := soma_reembolsos + valor;
  end loop;
  if soma_reembolsos <> total then
    raise exception 'O reembolso (%) precisa somar o valor devolvido (%)', soma_reembolsos, total using errcode = 'OR009';
  end if;

  -- (2) caixa de quem devolve, quando sai dinheiro (Pix e cartão ficam como estorno a confirmar)
  if precisa_caixa then
    caixa := privado.meu_caixa_aberto();
    if em_dinheiro > privado.dinheiro_no_caixa(caixa.id) then
      raise exception 'Não há dinheiro suficiente no seu caixa para devolver' using errcode = '23514';
    end if;
  end if;

  -- (3) itens serializados em ordem de id
  perform 1 from public.itens_serializados s
  where s.id in (select i.item_serializado_id from public.venda_itens i where i.id = any (ids_itens) and i.item_serializado_id is not null)
  order by s.id for update;

  insert into public.venda_devolucoes (organizacao_id, unidade_id, venda_id, chave, conteudo, motivo, valor_centavos, caixa_id, criado_por)
  values (venda.organizacao_id, venda.unidade_id, venda.id, p_chave, conteudo, trim(p_motivo), total, caixa.id, usuario)
  returning * into devolucao;

  for linha in select value from jsonb_array_elements(calculados) loop
    select * into item from public.venda_itens i where i.id = (linha ->> 'item')::uuid;
    insert into public.venda_devolucao_itens (devolucao_id, venda_item_id, quantidade, valor_centavos, condicao)
    values (devolucao.id, item.id, (linha ->> 'quantidade')::int, (linha ->> 'valor')::bigint, linha ->> 'condicao');
    if item.tipo in ('aparelho', 'chip', 'acessorio') then
      perform privado.lancar_movimento(venda.unidade_id, item.variante_id, (linha ->> 'quantidade')::int, 'devolucao', item.item_serializado_id,
        'Devolução nº ' || devolucao.numero || ': ' || trim(p_motivo), 'devolucao', devolucao.id::text,
        'devolucao:' || devolucao.id || ':item:' || item.id, usuario);
      if item.item_serializado_id is not null then
        update public.itens_serializados s set condicao = linha ->> 'condicao' where s.id = item.item_serializado_id;
      end if;
    end if;
  end loop;

  for linha in select value from jsonb_array_elements(p_reembolsos) loop
    meio_reembolso := linha ->> 'meio';
    valor := (linha ->> 'valor')::bigint;
    insert into public.venda_devolucao_reembolsos (devolucao_id, meio, valor_centavos) values (devolucao.id, meio_reembolso, valor);
    if meio_reembolso = 'dinheiro' then
      insert into public.caixa_movimentos (organizacao_id, caixa_id, tipo, meio, valor_centavos, venda_id, motivo, usuario_id, chave_idempotencia)
      values (venda.organizacao_id, caixa.id, 'estorno', meio_reembolso, -valor, venda.id,
              'Devolução nº ' || devolucao.numero || ': ' || trim(p_motivo), usuario,
              'devolucao:' || devolucao.id || ':reembolso:' || meio_reembolso);
    elsif meio_reembolso <> 'vale_troca' then
      insert into public.estornos_externos (organizacao_id, unidade_id, venda_id, devolucao_id, meio, valor_centavos, solicitado_por)
      values (venda.organizacao_id, venda.unidade_id, venda.id, devolucao.id, meio_reembolso, valor, usuario);
    end if;
  end loop;
  if em_vale > 0 then
    insert into public.vales_troca (organizacao_id, unidade_id, devolucao_id, valor_centavos, saldo_centavos, cliente_nome)
    values (venda.organizacao_id, venda.unidade_id, devolucao.id, em_vale, em_vale, venda.cliente_nome)
    returning * into vale;
  end if;
  update public.vendas v set devolvido_centavos = v.devolvido_centavos + total where v.id = venda.id;

  -- Fiscal: nota emitida pede nota de devolução; nota ainda não emitida recebe o aviso.
  select * into nota from public.notas_pedidos p where p.venda_id = venda.id and p.tipo = 'venda' and p.situacao <> 'cancelada';
  if found then
    if nota.situacao = 'emitida' then
      insert into public.notas_pedidos (organizacao_id, unidade_id, venda_id, venda_concluida_em, solicitado_por, chave, tipo, devolucao_id, observacao)
      values (venda.organizacao_id, venda.unidade_id, venda.id, now(), usuario, 'devolucao:' || devolucao.id, 'devolucao', devolucao.id,
              'Nota de devolução da devolução nº ' || devolucao.numero || ' (nota de origem ' || nota.chave_acesso || ')')
      returning * into nota;
      perform privado.nota_evento(nota, 'pedida', 'Devolução nº ' || devolucao.numero);
    else
      update public.notas_pedidos p
      set observacao = left(concat_ws(' · ', p.observacao, 'Devolução nº ' || devolucao.numero || ' antes da emissão: emitir só os itens que ficaram'), 500),
          atualizado_em = now()
      where p.id = nota.id;
      perform privado.nota_evento(nota, 'ajustada_por_devolucao', 'Devolução nº ' || devolucao.numero);
    end if;
  end if;

  return jsonb_build_object('devolucao', devolucao.id, 'numero', devolucao.numero, 'valor', total, 'vale', vale.numero, 'repetida', false);
end;
$$;
