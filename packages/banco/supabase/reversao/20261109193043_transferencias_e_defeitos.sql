-- Reversão de 20261109193043_transferencias_e_defeitos.sql (só em banco sem dados reais: apaga pedidos de transferência).
drop function public.estoque_na_rede(uuid);
drop function public.transferencia_encerrar(uuid, text, text);
drop function public.transferencia_receber(uuid, text[], int, text);
drop function public.transferencia_enviar(uuid);
drop function public.transferencia_separar(uuid, uuid[]);
drop function public.transferencia_solicitar(uuid, uuid, uuid, int, text, text);
drop function privado.transferencia_travada(uuid);
create or replace function privado.validar_movimento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tipo text := privado.tipo_da_variante(new.variante_id);
  item public.itens_serializados;
begin
  if tipo in ('aparelho', 'chip') then
    if new.item_serializado_id is null then
      raise exception 'Aparelho e chip movimentam pelo IMEI/ICCID' using errcode = '23514';
    end if;
    -- Trava do item: duas entradas (ou saídas) simultâneas do mesmo aparelho esperam uma pela
    -- outra, e a segunda vê a posição já mudada pela primeira.
    select * into item from public.itens_serializados i where i.id = new.item_serializado_id for update;
    if not found or item.variante_id <> new.variante_id or item.organizacao_id <> new.organizacao_id then
      raise exception 'O item não é desta variação' using errcode = '23514';
    end if;
    if new.quantidade = 1 then
      if item.em_estoque then
        raise exception 'Este IMEI/ICCID já está no estoque: a entrada não conta duas vezes' using errcode = 'OR005';
      end if;
      if item.unidade_id <> new.unidade_id and new.tipo not in ('transferencia_entrada', 'devolucao') then
        raise exception 'O item não está nesta loja' using errcode = '23514';
      end if;
      update public.itens_serializados
      set em_estoque = true, unidade_id = new.unidade_id, situacao = 'disponivel'
      where id = item.id;
    else
      if not item.em_estoque or item.unidade_id <> new.unidade_id then
        raise exception 'Este IMEI/ICCID não está no estoque desta loja' using errcode = 'OR005';
      end if;
      -- Item reservado só sai pela venda que consumiu a reserva (nunca com reserva ativa).
      if item.situacao = 'reservado' and (new.tipo <> 'venda' or exists (
           select 1 from public.estoque_reservas r
           where r.item_serializado_id = item.id and r.situacao = 'ativa')) then
        raise exception 'Este IMEI/ICCID está reservado: encerre a reserva antes' using errcode = 'OR002';
      end if;
      update public.itens_serializados
      set em_estoque = false,
          situacao = case new.tipo when 'venda' then 'vendido' when 'transferencia_saida' then 'em_transito' else 'baixado' end
      where id = item.id;
    end if;
  elsif tipo = 'acessorio' then
    if new.item_serializado_id is not null then
      raise exception 'Acessório movimenta por quantidade' using errcode = '23514';
    end if;
  else
    raise exception 'Este tipo de item não tem estoque' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop table public.transferencia_itens;
drop table public.transferencias;
drop trigger reservas_fora_da_excecao on public.estoque_reservas;
drop trigger vendas_fora_da_excecao on public.vendas;
drop function privado.local_de_excecao_nao_vende();
alter table public.estoque_reservas drop constraint estoque_reservas_origem_check;
alter table public.estoque_reservas add constraint estoque_reservas_origem_check check (origem in ('pdv', 'online'));
alter table public.unidades drop constraint unidades_tipo_check;
alter table public.unidades add constraint unidades_tipo_check check (tipo in ('loja_fisica', 'online', 'assistencia', 'deposito'));
do $$
begin
  perform set_config('ora.motivo', 'Reversão do ADR-007', true);
  delete from public.papel_permissoes where permissao = 'estoque.transferir';
  delete from public.permissoes where codigo = 'estoque.transferir';
end;
$$;
