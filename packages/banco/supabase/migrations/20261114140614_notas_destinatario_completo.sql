-- =============================================================================
-- Nota no nome do cliente: destinatário completo guardado no pedido e os dados para quem emite
-- (lote K1b; issue #76, decisão do proprietário de 12/11/2026)
--
-- * public.notas_solicitar (a do L6a, 20261111200054_pdv_nota_do_cliente): no nome do cliente, além do CPF/CNPJ, o
--   endereço completo do cadastro (CEP, rua, número, bairro, cidade e UF; complemento quando houver); sem ele, a
--   tela leva a pessoa a completar o MESMO cadastro. O pedido guarda o documento, o endereço, o cliente e a versão
--   do cadastro usados: corrigir o cadastro depois não muda o pedido.
-- * public.notas_dados_para_emitir (nova): quem aprova a nota na loja (nota.aprovar) vê o nome, o documento e o
--   endereço guardados no pedido, enquanto a nota espera a emissão, para digitar no emissor (sem emissor contratado,
--   ADR-006). Cada vez fica na auditoria, sem os valores. Depois da emissão os dados saem do pedido, como já era
--   (minimização): o documento emitido é o registro.
-- O tipo de documento fiscal continua com o contador (ADR-006); a nota sem cliente identificado segue igual.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

alter table privado.notas_destinatarios add column cliente_id uuid references public.clientes (id);
alter table privado.notas_destinatarios add column endereco jsonb check (endereco is null or jsonb_typeof(endereco) = 'object');
alter table privado.notas_destinatarios add column dados_de timestamptz;
create index notas_destinatarios_cliente on privado.notas_destinatarios (cliente_id);

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

create or replace function public.notas_dados_para_emitir(p_pedido uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  pedido public.notas_pedidos;
  destinatario privado.notas_destinatarios;
begin
  select * into pedido from public.notas_pedidos p where p.id = p_pedido;
  if not found or pedido.unidade_id is distinct from (select public.unidade_atual())
     or not (select public.tem_permissao('nota.aprovar', pedido.unidade_id)) then
    raise exception 'Pedido de nota não encontrado' using errcode = 'P0002';
  end if;
  if pedido.situacao not in ('aguardando_aprovacao', 'correcao_solicitada', 'aprovada') then
    raise exception 'Os dados do destinatário só aparecem enquanto a nota espera a emissão' using errcode = '22023';
  end if;
  select * into destinatario from privado.notas_destinatarios d where d.pedido_id = pedido.id;
  insert into public.auditoria (usuario_id, unidade_id, organizacao_id, acao, alvo_tipo, alvo_id, depois, origem)
  values ((select auth.uid()), pedido.unidade_id, pedido.organizacao_id, 'nota.dados_para_emitir', 'nota', pedido.id::text,
          jsonb_build_object('documento', destinatario.documento is not null, 'endereco', destinatario.endereco is not null), 'aplicacao');
  return jsonb_build_object('pedido', pedido.id, 'numero', pedido.numero, 'nome', pedido.destinatario_nome, 'documento', destinatario.documento,
    'endereco', destinatario.endereco, 'cliente', destinatario.cliente_id, 'dados_de', destinatario.dados_de);
end;
$$;
revoke all on function public.notas_dados_para_emitir(uuid) from public, anon;
grant execute on function public.notas_dados_para_emitir(uuid) to authenticated;
