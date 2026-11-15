-- Reversão de 20261115102358_conta_da_entrada.sql (antes 20261115070000; lote FIN-004a): a função, a coluna (com a ligação de cada conta) e a
-- chave única das entradas. As contas e as entradas continuam como estavam; só a ligação entre elas se perde.
drop function if exists public.conta_pagar_ligar_entrada(uuid, uuid, text);
drop index if exists public.contas_a_pagar_entrada;
alter table public.contas_a_pagar drop constraint if exists contas_a_pagar_entrada_fkey;
alter table public.contas_a_pagar drop column if exists entrada_id;
alter table public.entradas_estoque drop constraint if exists entradas_estoque_id_organizacao;
