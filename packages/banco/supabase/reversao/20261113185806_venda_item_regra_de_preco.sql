-- Reversão de 20261113185806_venda_item_regra_de_preco. ATENÇÃO: apaga a regra de preço gravada nos
-- itens das vendas feitas depois deste lote (a coluna preco_id). As funções voltam às do L3b e do PDV.
create or replace function public.preco_vigente(
  p_variante uuid, p_unidade uuid, p_canal text default 'loja', p_momento timestamptz default now()
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select p.valor_centavos
  from public.precos p
  join public.unidades u on u.id = p_unidade and u.organizacao_id = p.organizacao_id
  where p.variante_id = p_variante
    and p.canal = p_canal
    and (p.unidade_id is null or p.unidade_id = p_unidade)
    and p.inicio <= p_momento and (p.fim is null or p.fim > p_momento)
    and p.cancelado_em is null
    and p_unidade in (select privado.unidades_visiveis())
  order by (p.origem = 'campanha') desc, (p.unidade_id is null), p.inicio desc
  limit 1;
$$;

create or replace function public.adicionar_item(p_venda uuid, p_variante uuid, p_item uuid, p_quantidade int, p_chave text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  venda public.vendas;
  existente public.venda_itens;
  tipo text;
  preco bigint;
  custo bigint;
  quantidade int;
  reserva uuid;
  novo uuid;
begin
  if p_chave is null or length(trim(p_chave)) = 0 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  venda := privado.minha_venda_aberta(p_venda);
  select * into existente from public.venda_itens i where i.venda_id = venda.id and i.chave = p_chave;
  if found then
    if existente.variante_id <> p_variante or existente.item_serializado_id is distinct from p_item
       or existente.quantidade <> coalesce(p_quantidade, 1) then
      raise exception 'Chave de idempotência já usada em outra operação' using errcode = 'OR004';
    end if;
    return existente.id;
  end if;
  select p.tipo into tipo
  from public.variantes v join public.produtos p on p.id = v.produto_id
  where v.id = p_variante and v.organizacao_id = venda.organizacao_id and v.ativa and p.ativo;
  if tipo is null then
    raise exception 'Produto não encontrado' using errcode = 'P0002';
  end if;
  preco := public.preco_vigente(p_variante, venda.unidade_id, case venda.canal when 'online' then 'online' else 'loja' end);
  if preco is null then
    raise exception 'Produto sem preço nesta loja' using errcode = 'P0002';
  end if;
  select c.valor_centavos into custo from public.custos c
  where c.variante_id = p_variante and c.inicio <= now() order by c.inicio desc limit 1;
  quantidade := case when tipo in ('aparelho', 'chip') then 1 else coalesce(p_quantidade, 1) end;
  if quantidade < 1 or (tipo in ('aparelho', 'chip') and coalesce(p_quantidade, 1) <> 1) then
    raise exception 'Quantidade inválida' using errcode = '22023';
  end if;
  if tipo in ('aparelho', 'chip', 'acessorio') then
    reserva := public.reservar_estoque(p_variante, quantidade, p_item, 'venda:' || venda.id || ':' || p_chave,
                                       case venda.canal when 'online' then 'online' else 'pdv' end, 30);
  elsif p_item is not null then
    raise exception 'Serviço não tem IMEI/ICCID' using errcode = '22023';
  end if;
  insert into public.venda_itens (organizacao_id, venda_id, chave, variante_id, item_serializado_id, tipo, quantidade, preco_unitario_centavos, reserva_id)
  values (venda.organizacao_id, venda.id, p_chave, p_variante, p_item, tipo, quantidade, preco, reserva)
  returning id into novo;
  if custo is not null then
    insert into public.venda_itens_custos (item_id, organizacao_id, unidade_id, custo_unitario_centavos)
    values (novo, venda.organizacao_id, venda.unidade_id, custo);
  end if;
  return novo;
end;
$$;

drop function if exists privado.preco_vigente_linha(uuid, uuid, text, timestamptz);
drop index if exists public.venda_itens_preco;
alter table public.venda_itens drop column if exists preco_id;
