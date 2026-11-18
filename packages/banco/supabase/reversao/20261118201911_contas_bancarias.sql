-- Reversão de 20261118201911_contas_bancarias (lote CONTAS-a): tira as funções, a ligação do extrato com a conta e a
-- tabela das contas. Só sem conta de verdade cadastrada: as contas e a ligação dos extratos se perdem (a auditoria guarda
-- o histórico). Os extratos e as linhas ficam como estão.
drop function if exists public.contas_bancarias_saldos();
drop function if exists public.extrato_da_conta(uuid, uuid, text);
drop function if exists public.conta_bancaria_atualizar(uuid, text, text, text, text, bigint, date, boolean, text);
drop function if exists public.conta_bancaria_criar(uuid, text, text, text, text, bigint, date);
drop function if exists privado.conta_bancaria_conferir(text, text, text, text, bigint, date);
drop trigger if exists extratos_auditar_conta on public.extratos;
alter table public.extratos drop constraint if exists extrato_da_conta_e_do_banco;
alter table public.extratos drop constraint if exists extratos_conta_fk;
drop index if exists public.extratos_conta_idx;
alter table public.extratos drop column if exists conta_id;
drop table if exists public.contas_bancarias;
