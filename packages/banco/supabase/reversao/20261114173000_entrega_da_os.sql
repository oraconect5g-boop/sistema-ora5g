-- Reversão de 20261114173000_entrega_da_os (só em banco sem dados reais). Tira a ligação das vendas com as OS; com OS entregue ou com
-- evento de cobrança ou de entrega na trilha, as restrições antigas não voltam e a reversão para, de propósito. O produto
-- do conserto, se já foi criado, fica como um serviço comum, sem preço.
-- public.concluir_venda volta ao texto do L7a (20261111201342_pagamentos_maquininhas_e_conciliacao), public.os_custodia
-- ao do L12a (20261114162103_ordem_de_servico) e public.os_contato_whatsapp ao do L12b (20261114162305_orcamento_da_os).
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

  for item in select * from public.venda_itens i where i.venda_id = venda.id order by i.criado_em, i.id loop
    if public.preco_vigente(item.variante_id, venda.unidade_id, case venda.canal when 'online' then 'online' else 'loja' end)
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
  return jsonb_build_object('venda', venda.id, 'numero', venda.numero, 'total', total, 'troco', troco,
                            'recebido', recebido - troco, 'a_receber', a_receber, 'repetida', false);
end;
$$;

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
  if p_aviso is null or p_aviso not in ('comprovante', 'na_loja', 'orcamento') then -- L12b: + orcamento
    raise exception 'Aviso desconhecido' using errcode = '22023';
  end if;
  select * into os from public.ordens_servico o where o.id = p_os;
  if os.id is null or os.unidade_id is distinct from v_unidade or not (select public.tem_permissao('os.abrir', v_unidade)) then
    raise exception 'Ordem de serviço não encontrada' using errcode = 'P0002';
  end if;
  if os.situacao <> 'aberta' then
    raise exception 'A ordem de serviço já foi encerrada' using errcode = '22023';
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
  perform privado.os_evento(os, 'aviso_whatsapp', null, null, case p_aviso when 'comprovante' then 'Comprovante' when 'orcamento' then 'Orçamento' else 'Aparelho de volta na loja' end, false, v_unidade);
  insert into public.auditoria (usuario_id, unidade_id, organizacao_id, acao, alvo_tipo, alvo_id, depois, origem)
  values ((select auth.uid()), v_unidade, os.organizacao_id, 'os.contato_whatsapp', 'ordem_servico', os.id::text,
          jsonb_build_object('aviso', p_aviso), 'aplicacao');
  return v_telefone;
end;
$$;

drop trigger if exists vendas_os_cobrada on public.vendas;
drop trigger if exists venda_itens_reservado on public.venda_itens;
drop trigger if exists produtos_reservado_fixo on public.produtos;
drop function if exists public.os_entregar(uuid, text);
drop function if exists public.os_cobrar(uuid, uuid, text);
drop function if exists privado.os_da_venda_cancelada();
drop function if exists privado.os_orcamento_aprovado(uuid);
drop function if exists privado.os_variante_do_conserto(uuid);
drop function if exists privado.produto_reservado_fixo();
drop function if exists privado.venda_item_reservado();
alter table public.os_eventos drop constraint os_eventos_tipo_check;
alter table public.os_eventos add constraint os_eventos_tipo_check
  check (tipo in ('aberta', 'enviada_ao_tecnico', 'recebida_pelo_tecnico', 'devolvida_pelo_tecnico', 'recebida_na_loja',
                  'devolvida_ao_cliente', 'cancelada', 'foto', 'aviso_whatsapp', 'orcamento', 'resposta_do_cliente', 'servico_concluido'));
alter table public.ordens_servico drop constraint os_cobranca;
alter table public.ordens_servico drop constraint ordens_servico_situacao_check;
alter table public.ordens_servico add constraint ordens_servico_situacao_check check (situacao in ('aberta', 'devolvida', 'cancelada'));
drop index if exists public.ordens_servico_venda;
alter table public.ordens_servico drop column if exists cobrada_em;
alter table public.ordens_servico drop column if exists venda_id;
alter table public.venda_itens drop constraint if exists venda_item_da_os;
drop index if exists public.venda_itens_os_uma_vez;
drop index if exists public.venda_itens_os;
alter table public.venda_itens drop column if exists os_id;
drop index if exists public.produtos_reservado_para;
alter table public.produtos drop column if exists reservado_para;
