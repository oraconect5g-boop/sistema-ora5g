-- Reversão de 20261123221242_financeiro_conferencia_do_desfeito (lote FIN-001b): tira a conferência do que foi desfeito e o
-- índice do livro do estoque pela referência. Nada se perde: a função só lê; o cartão do Financeiro volta a mostrar só a
-- conta das vendas concluídas (FIN-001a), dizendo que o desfeito ainda não é conferido.
drop function if exists public.financeiro_conferencia_do_desfeito(timestamptz, timestamptz, uuid);
drop index if exists public.estoque_movimentos_referencia;
