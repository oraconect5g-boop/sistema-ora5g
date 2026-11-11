-- Reversão de 20261111200054_pdv_nota_do_cliente (só em banco sem dados reais).
-- Volta o texto de notas_solicitar aplicado em 20261109123757_fila_fiscal.
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
  if nome is not null and length(nome) not between 3 and 120 then
    raise exception 'Nome do destinatário inválido' using errcode = '22023';
  end if;
  documento := privado.nota_documento(p_destinatario);
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
