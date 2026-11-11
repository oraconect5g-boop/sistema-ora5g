-- =============================================================================
-- PDV: nota no nome do cliente da venda (lote L6a: ORA-POS-011)
--
-- Pedir a nota em poucos toques: com o cliente da rede ligado à venda (L5a), quem vende escolhe "no nome do
-- cliente" e o banco copia o nome e o CPF/CNPJ do cadastro protegido; ninguém digita nem vê o documento na
-- tela. O cadastro ganha a finalidade "nota fiscal" (o cliente pediu a nota no nome dele) e o uso do
-- documento fica na auditoria (sem o valor). O tipo de documento fiscal continua fora da escolha de quem
-- vende (ADR-006: a nota é registrada pela chave; a matriz por operação é do contador).
-- notas_solicitar recriada a partir do texto aplicado em 20261109123757_fila_fiscal, com as mudanças
-- marcadas "L6a". Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

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
    select c.nome, d.documento into nome_do_cliente, documento_do_cliente
    from public.clientes c join privado.cliente_dados d on d.cliente_id = c.id
    where c.id = venda.cliente_id and c.situacao = 'ativo';
    if documento_do_cliente is null then
      raise exception 'O cliente não tem CPF/CNPJ no cadastro: corrija o cadastro ou informe o documento aqui' using errcode = '22023';
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
    insert into privado.notas_destinatarios (pedido_id, documento) values (novo.id, documento);
  end if;
  perform privado.nota_evento(novo, 'pedida');
  return novo.id;
end;
$$;
