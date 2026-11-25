-- Reversão de 20261125015559_estoque_de_chips_da_nogle (lote CONNECT-d): tira as duas funções e as três tabelas do
-- estoque de chips da Nogle. Nada fora delas muda: a leitura nunca mexeu no livro de estoque da Ora nem na Nogle. Os
-- eventos de auditoria das ligações (connect_pdvs.alterado) ficam como histórico.
drop function public.connect_ligar_pdv(int, uuid);
drop function public.connect_worker_gravar_estoque(uuid, jsonb);
drop table public.connect_chips_nogle;
drop table public.connect_leituras_nogle;
drop table public.connect_pdvs;
