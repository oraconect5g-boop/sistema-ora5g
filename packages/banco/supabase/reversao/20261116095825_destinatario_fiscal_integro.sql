-- Reversão de 20261116095825_destinatario_fiscal_integro (lote INTEG-a): as quatro funções voltam às versões de antes e o
-- cliente do pedido sai (os pedidos feitos depois perdem esse dado; o envio volta a usar o cliente da venda de agora).

-- public.notas_solicitar: de volta à de 20261114145952_notas_destinatario_completo.sql.
create or replace function public.notas_solicitar(p_venda uuid, p_destinatario jsonb, p_chave text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  venda public.vendas;
  existente public.notas_pedidos;
  documento text;
  nome text := nullif(trim(coalesce(p_destinatario ->> 'nome', '')), '');
  novo public.notas_pedidos;
  documento_do_cliente text; -- L6a
  nome_do_cliente text; -- L6a
  endereco_do_cliente jsonb; -- K1b
  versao_do_cliente timestamptz; -- K1b
begin
  if p_chave is null or length(trim(p_chave)) = 0 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  select * into venda from public.vendas v where v.id = p_venda for share;
  if not found or venda.unidade_id is distinct from (select public.unidade_atual())
     or not (select public.tem_permissao('nota.solicitar', venda.unidade_id))
     or not (venda.vendedor_id = usuario or (select public.tem_permissao('nota.aprovar', venda.unidade_id))) then
    raise exception 'Venda não encontrada' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(privado.trava_da_chave('notas', venda.organizacao_id, p_chave));
  select * into existente from public.notas_pedidos p where p.organizacao_id = venda.organizacao_id and p.chave = p_chave;
  if found then
    if existente.venda_id <> venda.id or existente.solicitado_por <> usuario then
      raise exception 'Chave de idempotência já usada em outra operação' using errcode = 'OR004';
    end if;
    return existente.id;
  end if;
  if venda.situacao <> 'concluida' then
    raise exception 'A nota é pedida depois de a venda ser concluída' using errcode = '22023';
  end if;
  -- L6a: nota no nome do cliente da venda. O banco copia o nome e o documento do cadastro (quem vende não
  -- digita nem vê o CPF); o cadastro passa a ter a finalidade "nota fiscal" (o cliente pediu a nota no nome dele).
  if nullif(p_destinatario ->> 'cliente', '') is not null then
    if venda.cliente_id is null or (p_destinatario ->> 'cliente') <> venda.cliente_id::text then
      raise exception 'Só o cliente ligado à venda vai na nota por aqui' using errcode = '22023';
    end if;
    select c.nome, d.documento, d.endereco, coalesce(c.atualizado_em, c.criado_em)
      into nome_do_cliente, documento_do_cliente, endereco_do_cliente, versao_do_cliente
    from public.clientes c join privado.cliente_dados d on d.cliente_id = c.id
    where c.id = venda.cliente_id and c.situacao = 'ativo';
    if documento_do_cliente is null then
      raise exception 'O cliente não tem CPF/CNPJ no cadastro: corrija o cadastro ou informe o documento aqui' using errcode = '22023';
    end if;
    -- K1b (#76): a nota no nome do cliente leva o endereço completo do cadastro, que fica guardado no pedido.
    if endereco_do_cliente is null then
      raise exception 'O cliente não tem o endereço completo no cadastro: complete o cadastro (CEP, rua, número, bairro, cidade e UF) para a nota no nome dele' using errcode = '22023';
    end if;
    nome := case when length(nome_do_cliente) between 3 and 120 then nome_do_cliente end;
    update public.clientes c set finalidades = array(select distinct x from unnest(c.finalidades || array['nota_fiscal']) x order by x),
      atualizado_por = usuario, atualizado_em = now()
    where c.id = venda.cliente_id and not ('nota_fiscal' = any (c.finalidades));
    if found then
      insert into public.auditoria (usuario_id, unidade_id, organizacao_id, acao, alvo_tipo, alvo_id, depois, motivo, origem)
      values (usuario, venda.unidade_id, venda.organizacao_id, 'cliente.alterado', 'cliente', venda.cliente_id::text,
              jsonb_build_object('campos', jsonb_build_array('finalidades')), format('Nota fiscal pedida no nome do cliente (venda nº %s)', venda.numero), 'aplicacao');
    end if;
    insert into public.auditoria (usuario_id, unidade_id, organizacao_id, acao, alvo_tipo, alvo_id, depois, origem)
    values (usuario, venda.unidade_id, venda.organizacao_id, 'cliente.documento_na_nota', 'cliente', venda.cliente_id::text,
            jsonb_build_object('venda', venda.id), 'aplicacao');
  end if;
  if nome is not null and length(nome) not between 3 and 120 then
    raise exception 'Nome do destinatário inválido' using errcode = '22023';
  end if;
  documento := coalesce(documento_do_cliente, privado.nota_documento(p_destinatario)); -- L6a
  begin
    insert into public.notas_pedidos (organizacao_id, unidade_id, venda_id, venda_concluida_em, solicitado_por, chave,
                                      destinatario_nome, destinatario_mascarado)
    values (venda.organizacao_id, venda.unidade_id, venda.id, venda.concluida_em, usuario, p_chave, nome,
            privado.mascarar_documento(documento))
    returning * into novo;
  exception when unique_violation then
    raise exception 'Esta venda já tem pedido de nota em aberto ou nota emitida' using errcode = 'OR014';
  end;
  if documento is not null then
    -- K1b: o destinatário guardado com o endereço, o cadastro e a versão dele: corrigir o cadastro depois não muda
    -- o pedido (quem emite usa estes dados).
    insert into privado.notas_destinatarios (pedido_id, documento, cliente_id, endereco, dados_de)
    values (novo.id, documento, case when documento_do_cliente is not null then venda.cliente_id end, endereco_do_cliente, versao_do_cliente);
  end if;
  perform privado.nota_evento(novo, 'pedida');
  return novo.id;
end;
$$;

-- public.notas_corrigir: de volta à de 20261109123757_fila_fiscal.sql.
create or replace function public.notas_corrigir(p_pedido uuid, p_destinatario jsonb)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  pedido public.notas_pedidos;
  documento text;
  nome text := nullif(trim(coalesce(p_destinatario ->> 'nome', '')), '');
begin
  select * into pedido from public.notas_pedidos p where p.id = p_pedido for update;
  if not found or pedido.unidade_id is distinct from (select public.unidade_atual())
     or not (pedido.solicitado_por = (select auth.uid()) or (select public.tem_permissao('nota.aprovar', pedido.unidade_id))) then
    raise exception 'Pedido de nota não encontrado' using errcode = 'P0002';
  end if;
  if pedido.situacao <> 'correcao_solicitada' then
    raise exception 'Este pedido não está em correção (%)', pedido.situacao using errcode = '22023';
  end if;
  if nome is not null and length(nome) not between 3 and 120 then
    raise exception 'Nome do destinatário inválido' using errcode = '22023';
  end if;
  documento := privado.nota_documento(p_destinatario);
  update public.notas_pedidos p
  set situacao = 'aguardando_aprovacao', destinatario_nome = nome, destinatario_mascarado = privado.mascarar_documento(documento), atualizado_em = now()
  where p.id = pedido.id;
  delete from privado.notas_destinatarios d where d.pedido_id = pedido.id;
  if documento is not null then
    insert into privado.notas_destinatarios (pedido_id, documento) values (pedido.id, documento);
  end if;
  perform privado.nota_evento(pedido, 'corrigida');
  return true;
end;
$$;

-- public.nota_enviar_whatsapp e public.whatsapp_worker_reivindicar: de volta às de 20261114150135_whatsapp_envio_da_nota.sql.
create or replace function public.nota_enviar_whatsapp(p_pedido uuid, p_chave text, p_motivo text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  pedido public.notas_pedidos;
  venda public.vendas;
  v_documento uuid;
  v_telefone text;
  existente public.whatsapp_envios;
  v_motivo text := nullif(regexp_replace(trim(coalesce(p_motivo, '')), '\s+', ' ', 'g'), '');
  novo public.whatsapp_envios;
begin
  if p_chave is null or length(trim(p_chave)) not between 8 and 80 then
    raise exception 'Chave do formulário obrigatória' using errcode = '22023';
  end if;
  select * into pedido from public.notas_pedidos p where p.id = p_pedido;
  select * into venda from public.vendas v where v.id = pedido.venda_id for share;
  if pedido.id is null or venda.id is null or venda.unidade_id is distinct from (select public.unidade_atual())
     or not (select public.tem_permissao('nota.solicitar', venda.unidade_id))
     or not (venda.vendedor_id = usuario or (select public.tem_permissao('nota.aprovar', venda.unidade_id))) then
    raise exception 'Nota não encontrada' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(privado.trava_da_chave('whatsapp_envios', pedido.organizacao_id, pedido.id::text));
  select * into existente from public.whatsapp_envios e where e.organizacao_id = pedido.organizacao_id and e.chave = trim(p_chave);
  if found then
    if existente.pedido_id <> pedido.id then
      raise exception 'Chave de idempotência já usada em outro envio' using errcode = 'OR004';
    end if;
    return existente.id;
  end if;
  if pedido.tipo <> 'venda' or pedido.situacao <> 'emitida' then
    raise exception 'Só a nota emitida vai ao cliente pelo WhatsApp' using errcode = '22023';
  end if;
  select d.id into v_documento from public.notas_documentos d where d.pedido_id = pedido.id and d.tipo = 'pdf' and d.substituido_em is null;
  if v_documento is null then
    raise exception 'Guarde o PDF da nota antes de enviar pelo WhatsApp' using errcode = '22023';
  end if;
  if venda.cliente_id is null then
    raise exception 'Ligue a venda ao cliente da rede antes de enviar a nota pelo WhatsApp' using errcode = '22023';
  end if;
  select d.telefone into v_telefone from public.clientes c join privado.cliente_dados d on d.cliente_id = c.id
  where c.id = venda.cliente_id and c.situacao = 'ativo';
  if v_telefone is null then
    raise exception 'O cliente da venda não tem WhatsApp no cadastro: complete o cadastro' using errcode = '22023';
  end if;
  -- O último envio desta nota decide: em andamento devolve ele mesmo; desconhecido espera a conferência; terminado,
  -- reenviar pede motivo (fica no histórico).
  select * into existente from public.whatsapp_envios e where e.pedido_id = pedido.id order by e.pedido_em desc, e.numero desc limit 1;
  if found then
    if existente.situacao in ('na_fila', 'enviando') then
      return existente.id;
    end if;
    if existente.situacao = 'desconhecido' then
      raise exception 'O último envio está com resultado desconhecido: aguarde a conferência com o WhatsApp antes de reenviar' using errcode = '22023';
    end if;
    if v_motivo is null or length(v_motivo) not between 3 and 200 then
      raise exception 'Para reenviar a nota, informe o motivo (de 3 a 200 letras)' using errcode = '22023';
    end if;
  end if;
  perform set_config('ora.motivo', coalesce(v_motivo, 'Envio da nota ao cliente pelo WhatsApp'), true);
  insert into public.whatsapp_envios (organizacao_id, unidade_id, pedido_id, documento_id, venda_id, cliente_id, destino_mascarado, motivo, chave, pedido_por)
  values (pedido.organizacao_id, pedido.unidade_id, pedido.id, v_documento, venda.id, venda.cliente_id, privado.mascara_telefone(v_telefone),
          case when existente.id is not null then v_motivo end, trim(p_chave), usuario)
  returning * into novo;
  insert into privado.whatsapp_destinos (envio_id, telefone) values (novo.id, v_telefone);
  perform privado.whatsapp_evento(novo, 'na_fila', case when existente.id is not null then 'Reenvio: ' || v_motivo end, 'pedido');
  return novo.id;
end;
$$;

create or replace function public.whatsapp_worker_reivindicar(p_limite int)
returns table (envio_id uuid, organizacao_id uuid, telefone text, documento_caminho text, nota_numero bigint, nota_serie int, chave_acesso text, cliente_nome text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  envio public.whatsapp_envios;
begin
  -- Envio que não terminou (o worker parou entre pegar e registrar): a Meta pode ter recebido.
  for envio in
    select * from public.whatsapp_envios e where e.situacao = 'enviando' and e.enviando_desde < now() - interval '5 minutes'
    for update skip locked
  loop
    update public.whatsapp_envios e set situacao = 'desconhecido', enviando_desde = null, atualizado_em = now() where e.id = envio.id;
    perform privado.whatsapp_evento(envio, 'desconhecido', 'O envio não terminou: conferir com a Meta antes de reenviar', 'worker');
  end loop;
  for envio in
    select * from public.whatsapp_envios e where e.situacao = 'na_fila'
    order by e.pedido_em, e.id
    limit greatest(1, least(coalesce(p_limite, 5), 20))
    for update skip locked
  loop
    update public.whatsapp_envios e set situacao = 'enviando', enviando_desde = now(), tentativas = e.tentativas + 1, atualizado_em = now()
    where e.id = envio.id;
    perform privado.whatsapp_evento(envio, 'enviando', null, 'worker');
    return query
      select envio.id, envio.organizacao_id, d.telefone, doc.caminho, p.numero_documento, p.serie, p.chave_acesso, c.nome
      from privado.whatsapp_destinos d
      join public.notas_documentos doc on doc.id = envio.documento_id
      join public.notas_pedidos p on p.id = envio.pedido_id
      join public.clientes c on c.id = envio.cliente_id
      where d.envio_id = envio.id;
  end loop;
end;
$$;

drop index if exists public.notas_pedidos_cliente;
alter table public.notas_pedidos drop column if exists cliente_id;
