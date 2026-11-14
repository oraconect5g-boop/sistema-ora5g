-- =============================================================================
-- Entrega da ordem de serviço com cobrança pelo PDV (lote L12c: ORA-OS-006 e ORA-OS-005 em parte; DEC-U44 e DEC-U47,
-- seção 2C da Etapa 0, etapa 8: "cobra pelo PDV (conta na produção do vendedor), registra a entrega e avisa")
--
-- O conserto feito deixa de sair da loja sem lançamento: o valor do orçamento aprovado entra na venda do PDV como um
-- item de serviço ligado à OS, a venda concluída marca a OS como cobrada e só então a loja registra a entrega.
--   * Produto do sistema "Conserto (ordem de serviço)": um por rede (produtos.reservado_para = 'ordem_de_servico'),
--     criado na primeira cobrança, do tipo serviço e sem preço de catálogo; o item da venda leva o valor do orçamento
--     aprovado. Um gatilho em venda_itens recusa esse produto fora de uma OS (mesmo que alguém cadastre um preço para
--     ele) e o item de OS com outro produto; outro gatilho impede mudar o tipo ou a reserva do produto.
--   * venda_itens.os_id: a OS cobrada pelo item (uma vez por venda). ordens_servico.venda_id e cobrada_em: a venda
--     concluída que cobrou a OS. Uma OS só é cobrada por uma venda: a conclusão trava a OS e confere.
--   * public.os_cobrar(venda, os, chave): põe o conserto no carrinho de quem vende na loja da OS (venda.registrar e
--     os.abrir), com o conserto concluído, o aparelho de volta na loja e a OS ainda não cobrada. A mesma chave devolve
--     o mesmo item; a mesma OS na mesma venda também.
--   * public.concluir_venda (a do L7a, 20261111201342, com os trechos marcados "L12c"): o item da OS confere o valor com
--     o orçamento aprovado (em vez do preço de catálogo) e o estado da OS; ao concluir, a OS fica cobrada, com o evento
--     na trilha. A venda conta na produção de quem a concluiu, como toda venda, e só uma vez (o valor está só nela).
--   * Venda concluída e depois cancelada: a OS ainda na loja volta a "não cobrada" (pode ser cobrada de novo), com o
--     evento na trilha; a OS já entregue fica como está.
--   * public.os_entregar(os, observacao): a loja da OS registra a entrega ao cliente, só depois da cobrança; a OS se
--     encerra como "entregue" (o aparelho com o cliente).
--   * public.os_custodia (a do L12a, com os trechos marcados "L12c"): o conserto feito não sai mais pela devolução sem
--     cobrança feita pela loja: só a gerência devolve, com o motivo (garantia, cortesia); a OS cobrada só sai pela
--     entrega.
--   * public.os_contato_whatsapp (a do L12b, com os trechos marcados "L12c"): ganha o aviso "entrega", o comprovante da
--     entrega para o cliente.
-- As peças do estoque ligadas à OS e os relatórios da assistência ficam para o lote seguinte (L12d).
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Estrutura
-- -----------------------------------------------------------------------------
alter table public.produtos add column reservado_para text check (reservado_para in ('ordem_de_servico'));
create unique index produtos_reservado_para on public.produtos (organizacao_id, reservado_para) where reservado_para is not null;
comment on column public.produtos.reservado_para is
  'L12c: produto do sistema. ordem_de_servico = o conserto da OS, que só entra na venda pela própria OS (os_cobrar).';

alter table public.venda_itens add column os_id uuid references public.ordens_servico (id);
alter table public.venda_itens add constraint venda_item_da_os check (os_id is null or (tipo = 'servico' and quantidade = 1));
create unique index venda_itens_os_uma_vez on public.venda_itens (venda_id, os_id) where os_id is not null;
create index venda_itens_os on public.venda_itens (os_id) where os_id is not null;
comment on column public.venda_itens.os_id is
  'L12c: a ordem de serviço cobrada por este item (o conserto, pelo valor do orçamento aprovado).';

alter table public.ordens_servico add column venda_id uuid references public.vendas (id);
alter table public.ordens_servico add column cobrada_em timestamptz;
alter table public.ordens_servico drop constraint ordens_servico_situacao_check;
alter table public.ordens_servico add constraint ordens_servico_situacao_check
  check (situacao in ('aberta', 'devolvida', 'cancelada', 'entregue'));
alter table public.ordens_servico add constraint os_cobranca
  check ((venda_id is null) = (cobrada_em is null) and (situacao <> 'entregue' or venda_id is not null));
create index ordens_servico_venda on public.ordens_servico (venda_id) where venda_id is not null;
comment on column public.ordens_servico.venda_id is
  'L12c: a venda concluída que cobrou o conserto (uma só). Volta a nula se a venda é cancelada antes da entrega.';

alter table public.os_eventos drop constraint os_eventos_tipo_check;
alter table public.os_eventos add constraint os_eventos_tipo_check
  check (tipo in ('aberta', 'enviada_ao_tecnico', 'recebida_pelo_tecnico', 'devolvida_pelo_tecnico', 'recebida_na_loja',
                  'devolvida_ao_cliente', 'cancelada', 'foto', 'aviso_whatsapp', 'orcamento', 'resposta_do_cliente', 'servico_concluido',
                  'cobrada', 'cobranca_desfeita', 'entregue_ao_cliente'));

-- O conserto da OS só entra na venda pela OS; o item de OS só com o produto do conserto.
create or replace function privado.venda_item_reservado()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_reservado boolean;
begin
  select p.reservado_para = 'ordem_de_servico' into v_reservado
  from public.variantes v join public.produtos p on p.id = v.produto_id
  where v.id = new.variante_id;
  if coalesce(v_reservado, false) and new.os_id is null then
    raise exception 'O conserto só entra na venda pela ordem de serviço' using errcode = '22023';
  end if;
  if new.os_id is not null and not coalesce(v_reservado, false) then
    raise exception 'O item da ordem de serviço é o conserto' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger venda_itens_reservado before insert or update of variante_id, os_id on public.venda_itens
  for each row execute function privado.venda_item_reservado();

create or replace function privado.produto_reservado_fixo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.reservado_para is distinct from old.reservado_para or (old.reservado_para is not null and new.tipo <> old.tipo) then
    raise exception 'Produto do sistema: o tipo e a reserva não mudam' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger produtos_reservado_fixo before update on public.produtos
  for each row execute function privado.produto_reservado_fixo();

-- O produto do conserto da rede: criado na primeira cobrança (categoria "Assistência técnica", sem preço de catálogo).
create or replace function privado.os_variante_do_conserto(p_organizacao uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_produto uuid;
  v_variante uuid;
  v_categoria uuid;
  v_sku text := 'OS-CONSERTO';
begin
  -- Duas cobranças ao mesmo tempo na primeira vez não criam dois produtos.
  perform pg_advisory_xact_lock(privado.trava_da_chave('os_conserto', p_organizacao, 'produto'));
  select p.id into v_produto from public.produtos p where p.organizacao_id = p_organizacao and p.reservado_para = 'ordem_de_servico';
  if v_produto is not null then
    select v.id into v_variante from public.variantes v where v.produto_id = v_produto order by v.criado_em, v.id limit 1;
    if v_variante is not null then
      return v_variante;
    end if;
  else
    -- A categoria (e o SKU) seguem os índices únicos sem diferença de maiúsculas (R2): "assistência técnica" já
    -- cadastrada é a mesma categoria.
    select c.id into v_categoria from public.categorias c where c.organizacao_id = p_organizacao and lower(c.nome) = lower('Assistência técnica');
    if v_categoria is null then
      insert into public.categorias (organizacao_id, nome) values (p_organizacao, 'Assistência técnica')
      on conflict (organizacao_id, (lower(nome))) do nothing
      returning id into v_categoria;
      if v_categoria is null then
        select c.id into v_categoria from public.categorias c where c.organizacao_id = p_organizacao and lower(c.nome) = lower('Assistência técnica');
      end if;
    end if;
    insert into public.produtos (organizacao_id, tipo, nome, categoria_id, descricao, reservado_para)
    values (p_organizacao, 'servico', 'Conserto (ordem de serviço)', v_categoria,
            'Produto do sistema: entra na venda só pela ordem de serviço, com o valor do orçamento aprovado.', 'ordem_de_servico')
    returning id into v_produto;
  end if;
  if exists (select 1 from public.variantes v where v.organizacao_id = p_organizacao and lower(v.sku) = lower(v_sku)) then
    v_sku := 'OS-CONSERTO-' || upper(left(replace(v_produto::text, '-', ''), 8));
  end if;
  insert into public.variantes (organizacao_id, produto_id, sku, nome)
  values (p_organizacao, v_produto, v_sku, 'Conserto da OS')
  returning id into v_variante;
  return v_variante;
end;
$$;

-- O orçamento que vale na cobrança: o último aprovado (depois dele o conserto foi concluído e não há outro).
create or replace function privado.os_orcamento_aprovado(p_os uuid)
returns public.os_orcamentos
language sql
stable
security definer
set search_path = ''
as $$
  select x.* from public.os_orcamentos x where x.os_id = p_os and x.situacao = 'aprovado' order by x.numero desc limit 1;
$$;

-- -----------------------------------------------------------------------------
-- 2. Cobrar no PDV
-- -----------------------------------------------------------------------------
create or replace function public.os_cobrar(p_venda uuid, p_os uuid, p_chave text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  venda public.vendas;
  os public.ordens_servico;
  existente public.venda_itens;
  orcamento public.os_orcamentos;
  novo uuid;
begin
  if p_chave is null or length(trim(p_chave)) = 0 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  venda := privado.minha_venda_aberta(p_venda);
  select * into existente from public.venda_itens i where i.venda_id = venda.id and i.chave = p_chave;
  if found then
    if existente.os_id is distinct from p_os then
      raise exception 'Chave de idempotência já usada em outra operação' using errcode = 'OR004';
    end if;
    return existente.id;
  end if;
  select * into os from public.ordens_servico o where o.id = p_os for update;
  if not coalesce(os.id is not null and os.unidade_id = venda.unidade_id and (select public.tem_permissao('os.abrir', venda.unidade_id)), false) then
    raise exception 'Ordem de serviço não encontrada' using errcode = 'P0002';
  end if;
  -- A mesma OS já está nesta venda (outro clique): o mesmo item.
  select * into existente from public.venda_itens i where i.venda_id = venda.id and i.os_id = os.id;
  if found then
    return existente.id;
  end if;
  if venda.canal <> 'loja' then
    raise exception 'O conserto é cobrado no PDV da loja' using errcode = '22023';
  end if;
  if os.venda_id is not null then
    raise exception 'Esta ordem de serviço já foi cobrada (venda nº %)', (select v.numero from public.vendas v where v.id = os.venda_id)
      using errcode = 'OR032';
  end if;
  if os.situacao <> 'aberta' then
    raise exception 'A ordem de serviço já foi encerrada' using errcode = '22023';
  end if;
  if os.servico <> 'concluido' then
    raise exception 'Só o conserto concluído é cobrado' using errcode = '22023';
  end if;
  if os.local <> 'loja' then
    raise exception 'O conserto é cobrado com o aparelho de volta na loja' using errcode = '22023';
  end if;
  orcamento := privado.os_orcamento_aprovado(os.id);
  if orcamento.id is null then
    raise exception 'A ordem de serviço não tem orçamento aprovado' using errcode = '22023';
  end if;
  insert into public.venda_itens (organizacao_id, venda_id, chave, variante_id, tipo, quantidade, preco_unitario_centavos, os_id)
  values (venda.organizacao_id, venda.id, p_chave, privado.os_variante_do_conserto(venda.organizacao_id), 'servico', 1,
          orcamento.total_centavos, os.id)
  returning id into novo;
  return novo;
end;
$$;

-- A conclusão da venda (a do L7a, 20261111201342), com os trechos marcados "L12c".
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
  pagamento_id uuid;
  reserva public.estoque_reservas;
  os_da_venda public.ordens_servico; -- L12c
  orcamento_da_os public.os_orcamentos; -- L12c
begin
  if unidade is null or not (select public.tem_permissao('venda.registrar', unidade)) then
    raise exception 'Sem permissão para vender nesta loja' using errcode = '42501';
  end if;
  if p_chave is null or length(trim(p_chave)) = 0 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  if p_pagamentos is null or jsonb_typeof(p_pagamentos) <> 'array' or jsonb_array_length(p_pagamentos) = 0 then
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
  end loop;
  total := subtotal - descontos;

  -- Pagamentos: a mesma regra de packages/dominio/src/pagamento.ts
  for pagamento in select value from jsonb_array_elements(p_pagamentos) loop
    meio := pagamento ->> 'meio';
    if meio is null or not privado.meio_valido(meio) then
      raise exception 'Meio de pagamento desconhecido' using errcode = 'OR009';
    end if;
    if meio = 'link_pagamento' then
      raise exception 'Link de pagamento ainda não integrado: use outro meio' using errcode = 'OR009';
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
      if meio = 'payjoy' and email is null then
        raise exception 'PayJoy exige o e-mail do cliente' using errcode = 'OR009';
      end if;
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
  excedente := greatest(0, recebido + a_receber - total);
  troco := least(excedente, em_dinheiro);
  if excedente > troco then
    raise exception 'Pagamento maior que o total sem dinheiro para dar troco' using errcode = 'OR009';
  end if;
  if recebido + a_receber < total then
    raise exception 'Falta pagar %', total - recebido - a_receber using errcode = 'OR009';
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
  for pagamento in select value from jsonb_array_elements(p_pagamentos) loop
    ordem := ordem + 1;
    meio := pagamento ->> 'meio';
    valor := (pagamento ->> 'valor')::bigint;
    entrada := coalesce((pagamento ->> 'entrada')::bigint, 0);
    meio_entrada := case when privado.meio_financeira(meio) and entrada > 0 then coalesce(pagamento ->> 'meio_entrada', 'dinheiro') end;
    comprovante := nullif(trim(coalesce(pagamento ->> 'comprovante', '')), '');
    terminal_escolhido := privado.terminal_do_pagamento(venda.unidade_id, meio, pagamento ->> 'terminal'); -- L7a
    insert into public.venda_pagamentos (organizacao_id, venda_id, ordem, meio, valor_centavos, entrada_centavos, meio_entrada, comprovante, confirmacao, confirmado_por,
                                         terminal_id) -- L7a
    values (venda.organizacao_id, venda.id, ordem, meio, valor, entrada, meio_entrada, comprovante,
            case when meio = 'dinheiro' then 'caixa' when privado.meio_financeira(meio) then 'financeira' else 'manual' end, usuario,
            terminal_escolhido)
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
                            'recebido', recebido - troco, 'a_receber', a_receber, 'repetida', false);
end;
$$;

-- Venda concluída e depois cancelada: a OS ainda na loja volta a "não cobrada"; a já entregue fica como está.
create or replace function privado.os_da_venda_cancelada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  os public.ordens_servico;
begin
  for os in select o.* from public.ordens_servico o where o.venda_id = new.id and o.situacao = 'aberta' order by o.id for update loop
    update public.ordens_servico o set venda_id = null, cobrada_em = null, atualizada_em = now() where o.id = os.id;
    perform privado.os_evento(os, 'cobranca_desfeita', null, null, 'Venda nº ' || new.numero || ' cancelada', false, new.unidade_id);
  end loop;
  return new;
end;
$$;
create trigger vendas_os_cobrada after update of situacao on public.vendas
  for each row when (old.situacao = 'concluida' and new.situacao = 'cancelada') execute function privado.os_da_venda_cancelada();

-- -----------------------------------------------------------------------------
-- 3. Entregar ao cliente (depois da cobrança)
-- -----------------------------------------------------------------------------
create or replace function public.os_entregar(p_os uuid, p_observacao text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade uuid := (select public.unidade_atual());
  os public.ordens_servico;
  v_obs text := nullif(regexp_replace(trim(coalesce(p_observacao, '')), '\s+', ' ', 'g'), '');
  v_numero bigint;
begin
  select * into os from public.ordens_servico o where o.id = p_os for update;
  if not coalesce(os.id is not null and os.unidade_id = v_unidade and (select public.tem_permissao('os.abrir', v_unidade)), false) then
    raise exception 'Ordem de serviço não encontrada' using errcode = 'P0002';
  end if;
  if v_obs is not null and length(v_obs) not between 2 and 300 then
    raise exception 'Observação: de 2 a 300 letras' using errcode = '22023';
  end if;
  if os.situacao = 'entregue' then
    return false;
  end if;
  if os.situacao <> 'aberta' then
    raise exception 'A ordem de serviço já foi encerrada' using errcode = '22023';
  end if;
  if os.venda_id is null then
    raise exception 'Cobre o conserto no PDV antes de entregar' using errcode = '22023';
  end if;
  if os.local <> 'loja' then
    raise exception 'A ordem de serviço não está no ponto deste passo (está %)', replace(os.local, '_', ' ') using errcode = '22023';
  end if;
  select v.numero into v_numero from public.vendas v where v.id = os.venda_id;
  perform set_config('ora.motivo', coalesce(v_obs, 'Ordem de serviço entregue ao cliente'), true);
  update public.ordens_servico o set
    situacao = 'entregue', local = 'com_cliente', encerrada_em = now(),
    motivo_encerramento = 'Entregue ao cliente, cobrada na venda nº ' || v_numero, atualizada_em = now()
  where o.id = os.id;
  perform privado.os_evento(os, 'entregue_ao_cliente', 'loja', 'com_cliente', v_obs, false, v_unidade);
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. A custódia (a do L12a) e o aviso pelo WhatsApp (a do L12b), com os trechos "L12c"
-- -----------------------------------------------------------------------------
create or replace function public.os_custodia(p_os uuid, p_passo text, p_assistencia uuid, p_observacao text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade uuid := (select public.unidade_atual());
  os public.ordens_servico;
  v_obs text := nullif(regexp_replace(trim(coalesce(p_observacao, '')), '\s+', ' ', 'g'), '');
  v_pela_loja boolean;
  v_gere boolean;
  v_tecnico boolean;
  v_de text;
  v_para text;
  v_tipo text;
  v_assistencia uuid := p_assistencia;
  v_quantas int;
begin
  if p_passo is null or p_passo not in ('enviar_ao_tecnico', 'tecnico_recebeu', 'tecnico_devolveu', 'loja_recebeu', 'devolver_ao_cliente', 'cancelar') then
    raise exception 'Passo da ordem de serviço desconhecido' using errcode = '22023';
  end if;
  select * into os from public.ordens_servico o where o.id = p_os for update;
  -- coalesce: sem loja do turno ou sem assistência na OS, a comparação dá nulo, e nulo aqui é "não".
  v_pela_loja := coalesce(os.id is not null and os.unidade_id = v_unidade and (select public.tem_permissao('os.abrir', v_unidade)), false);
  v_gere := coalesce(os.id is not null and os.unidade_id = v_unidade and (select public.tem_permissao('os.gerir', v_unidade)), false);
  v_tecnico := coalesce(os.id is not null and os.assistencia_id = v_unidade and (select public.tem_permissao('os.orcar', v_unidade)), false);
  if not (v_pela_loja or v_gere or v_tecnico) then
    raise exception 'Ordem de serviço não encontrada' using errcode = 'P0002';
  end if;
  if v_obs is not null and length(v_obs) not between 2 and 300 then
    raise exception 'Observação: de 2 a 300 letras' using errcode = '22023';
  end if;
  v_de := os.local;
  v_para := case p_passo
    when 'enviar_ao_tecnico' then 'a_caminho_do_tecnico'
    when 'tecnico_recebeu' then 'com_tecnico'
    when 'tecnico_devolveu' then 'a_caminho_da_loja'
    when 'loja_recebeu' then 'loja'
    else 'com_cliente' end;
  v_tipo := case p_passo
    when 'enviar_ao_tecnico' then 'enviada_ao_tecnico'
    when 'tecnico_recebeu' then 'recebida_pelo_tecnico'
    when 'tecnico_devolveu' then 'devolvida_pelo_tecnico'
    when 'loja_recebeu' then 'recebida_na_loja'
    when 'devolver_ao_cliente' then 'devolvida_ao_cliente'
    else 'cancelada' end;

  -- Quem faz cada passo.
  if p_passo in ('enviar_ao_tecnico', 'loja_recebeu', 'devolver_ao_cliente') and not v_pela_loja then
    raise exception 'Este passo é da loja da ordem de serviço' using errcode = '42501';
  end if;
  if p_passo in ('tecnico_recebeu', 'tecnico_devolveu') and not v_tecnico and not v_gere then
    raise exception 'Só o técnico ou a gerência da loja registra este passo' using errcode = '42501';
  end if;
  if p_passo = 'cancelar' and not v_gere then
    raise exception 'Cancelar a ordem de serviço é da gerência da loja' using errcode = '42501';
  end if;

  -- Já feito (clique repetido ou outra pessoa fez antes): nada muda.
  if os.situacao <> 'aberta' then
    if (p_passo = 'devolver_ao_cliente' and os.situacao = 'devolvida') or (p_passo = 'cancelar' and os.situacao = 'cancelada') then
      return false;
    end if;
    raise exception 'A ordem de serviço já foi encerrada' using errcode = '22023';
  end if;
  if os.local = v_para then
    return false;
  end if;
  -- L12c: o conserto feito sai pela entrega com cobrança (os_entregar); sem cobrar, só a gerência, com o motivo.
  if p_passo = 'devolver_ao_cliente' and os.venda_id is not null then
    raise exception 'O conserto já foi cobrado: registre a entrega' using errcode = '22023';
  end if;
  if p_passo = 'devolver_ao_cliente' and os.servico = 'concluido' and not v_gere then
    raise exception 'O conserto foi feito: cobre no PDV e registre a entrega (sem cobrar, só a gerência, com o motivo)' using errcode = '42501';
  end if;

  -- De onde cada passo sai.
  if (p_passo in ('enviar_ao_tecnico', 'devolver_ao_cliente', 'cancelar') and os.local <> 'loja')
     or (p_passo = 'tecnico_recebeu' and os.local <> 'a_caminho_do_tecnico')
     or (p_passo = 'tecnico_devolveu' and os.local <> 'com_tecnico')
     or (p_passo = 'loja_recebeu' and os.local <> 'a_caminho_da_loja') then
    raise exception 'A ordem de serviço não está no ponto deste passo (está %)', replace(os.local, '_', ' ') using errcode = '22023';
  end if;
  if p_passo = 'enviar_ao_tecnico' then
    if v_assistencia is null then
      select (array_agg(u.id order by u.id))[1], count(*) into v_assistencia, v_quantas from public.unidades u
      where u.organizacao_id = os.organizacao_id and u.tipo = 'assistencia' and u.status = 'ativa';
      if v_quantas = 0 then
        raise exception 'A rede ainda não tem a assistência cadastrada: cadastre em Lojas da rede, com o tipo assistência' using errcode = '22023';
      elsif v_quantas > 1 then
        raise exception 'Escolha a assistência (o técnico) para onde o aparelho vai' using errcode = '22023';
      end if;
    elsif not exists (
         select 1 from public.unidades u
         where u.id = v_assistencia and u.organizacao_id = os.organizacao_id and u.tipo = 'assistencia' and u.status = 'ativa') then
      raise exception 'Escolha a assistência (o técnico) para onde o aparelho vai' using errcode = '22023';
    end if;
  end if;
  if p_passo in ('tecnico_recebeu', 'tecnico_devolveu') and not v_tecnico and v_obs is null then
    raise exception 'Em nome do técnico, diga como ele confirmou (mensagem, ligação, entrega em mãos)' using errcode = '22023';
  end if;
  if p_passo in ('devolver_ao_cliente', 'cancelar') then
    v_obs := privado.exigir_motivo(v_obs);
  end if;
  if p_passo = 'cancelar' and exists (select 1 from public.os_eventos e where e.os_id = os.id and e.tipo = 'enviada_ao_tecnico') then
    raise exception 'A ordem de serviço já foi ao técnico: devolva o aparelho ao cliente em vez de cancelar' using errcode = '22023';
  end if;

  perform set_config('ora.motivo', coalesce(v_obs, 'Ordem de serviço: ' || replace(v_tipo, '_', ' ')), true);
  update public.ordens_servico o set
    local = v_para,
    assistencia_id = case when p_passo = 'enviar_ao_tecnico' then v_assistencia else o.assistencia_id end,
    situacao = case p_passo when 'devolver_ao_cliente' then 'devolvida' when 'cancelar' then 'cancelada' else o.situacao end,
    encerrada_em = case when p_passo in ('devolver_ao_cliente', 'cancelar') then now() else o.encerrada_em end,
    motivo_encerramento = case when p_passo in ('devolver_ao_cliente', 'cancelar') then v_obs else o.motivo_encerramento end,
    atualizada_em = now()
  where o.id = os.id;
  perform privado.os_evento(os, v_tipo, v_de, v_para, v_obs, p_passo in ('tecnico_recebeu', 'tecnico_devolveu') and not v_tecnico, v_unidade);
  return true;
end;
$$;

create or replace function public.os_contato_whatsapp(p_os uuid, p_aviso text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade uuid := (select public.unidade_atual());
  os public.ordens_servico;
  v_telefone text;
begin
  if p_aviso is null or p_aviso not in ('comprovante', 'na_loja', 'orcamento', 'entrega') then -- L12b: + orcamento; L12c: + entrega
    raise exception 'Aviso desconhecido' using errcode = '22023';
  end if;
  select * into os from public.ordens_servico o where o.id = p_os;
  if os.id is null or os.unidade_id is distinct from v_unidade or not (select public.tem_permissao('os.abrir', v_unidade)) then
    raise exception 'Ordem de serviço não encontrada' using errcode = 'P0002';
  end if;
  -- L12c: o comprovante da entrega é depois dela, com a OS já encerrada como entregue.
  if os.situacao <> 'aberta' and not (p_aviso = 'entrega' and os.situacao = 'entregue') then
    raise exception 'A ordem de serviço já foi encerrada' using errcode = '22023';
  end if;
  if p_aviso = 'entrega' and os.situacao <> 'entregue' then
    raise exception 'O comprovante da entrega é depois de registrar a entrega' using errcode = '22023';
  end if;
  if p_aviso = 'na_loja' and (os.local <> 'loja' or not exists (select 1 from public.os_eventos e where e.os_id = os.id and e.tipo = 'recebida_na_loja')) then
    raise exception 'O aviso de chegada é depois que o aparelho volta do técnico para a loja' using errcode = '22023';
  end if;
  -- L12b: o orçamento vai ao cliente enquanto espera a resposta dele.
  if p_aviso = 'orcamento' and os.servico <> 'aguardando_cliente' then
    raise exception 'O aviso do orçamento é enquanto ele espera a resposta do cliente' using errcode = '22023';
  end if;
  select d.telefone into v_telefone from privado.cliente_dados d where d.cliente_id = os.cliente_id;
  if v_telefone is null then
    raise exception 'O cliente não tem WhatsApp no cadastro: complete o cadastro' using errcode = '22023';
  end if;
  perform privado.os_evento(os, 'aviso_whatsapp', null, null, case p_aviso when 'comprovante' then 'Comprovante' when 'orcamento' then 'Orçamento' when 'entrega' then 'Entrega' else 'Aparelho de volta na loja' end, false, v_unidade);
  insert into public.auditoria (usuario_id, unidade_id, organizacao_id, acao, alvo_tipo, alvo_id, depois, origem)
  values ((select auth.uid()), v_unidade, os.organizacao_id, 'os.contato_whatsapp', 'ordem_servico', os.id::text,
          jsonb_build_object('aviso', p_aviso), 'aplicacao');
  return v_telefone;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Permissões das funções
-- -----------------------------------------------------------------------------
revoke all on function privado.venda_item_reservado(), privado.produto_reservado_fixo(), privado.os_variante_do_conserto(uuid),
  privado.os_orcamento_aprovado(uuid), privado.os_da_venda_cancelada() from public, anon, authenticated;
revoke all on function public.os_cobrar(uuid, uuid, text), public.os_entregar(uuid, text) from public, anon;
grant execute on function public.os_cobrar(uuid, uuid, text), public.os_entregar(uuid, text) to authenticated;
