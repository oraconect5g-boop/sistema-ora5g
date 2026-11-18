-- =============================================================================
-- Lote CD-a (D-043, ORA-INV-012; o pedido do proprietário de 18/11/2026: "feche todas as outras pendências dos outros
-- setores"): o depósito (o centro de distribuição) não vende. É o padrão reversível que a D-043 propôs, em uso até o
-- proprietário decidir: o depósito guarda o estoque e abastece as lojas pelo pedido de transferência; a venda da loja
-- sai da loja, e a do site, da loja que o site oferece.
--
--   * a venda e a reserva de venda (do PDV e do site) num local do tipo depósito são recusadas com OR043, como o local
--     de exceção (DEFEITOS) não vende e a loja física sem o CNPJ da filial também não (OR038);
--   * a reserva do pedido de transferência (origem 'transferencia', TRF-c) continua: o depósito manda para as lojas;
--   * os painéis do estoque já mostram o físico do depósito como fora da venda (G3 e G3b): nada muda neles.
-- O banco do servidor principal não tem depósito cadastrado hoje (conferido em 18/11): nenhuma venda ou reserva antiga.
-- Códigos: OR043 o depósito não vende.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create or replace function privado.deposito_nao_vende()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_table_name = 'vendas' or to_jsonb(new) ->> 'origem' in ('pdv', 'online'))
     and exists (select 1 from public.unidades u where u.id = new.unidade_id and u.tipo = 'deposito') then
    raise exception 'O depósito (centro de distribuição) não vende: transfira o item para uma loja antes' using errcode = 'OR043';
  end if;
  return new;
end;
$$;
comment on function privado.deposito_nao_vende() is
  'D-043 (lote CD-a): o depósito não vende; a venda e a reserva de venda (do PDV e do site) nele são recusadas com OR043.';
revoke all on function privado.deposito_nao_vende() from public, anon, authenticated;
create trigger vendas_fora_do_deposito before insert on public.vendas
  for each row execute function privado.deposito_nao_vende();
create trigger reservas_fora_do_deposito before insert on public.estoque_reservas
  for each row execute function privado.deposito_nao_vende();
