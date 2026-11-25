-- Reversão de 20261125094000_transferencia_de_chips (lote CONNECT-e): tira as quatro funções e a tabela dos pedidos de
-- transferência de chips. O que já foi transferido na Nogle não volta (a reversão não chama a Nogle); o estoque de chips
-- lido (CONNECT-d) fica como está. Os eventos de auditoria dos pedidos ficam como histórico.
drop function public.connect_worker_registrar_transferencia(uuid, jsonb);
drop function public.connect_worker_transferencias_a_enviar(uuid, int);
drop function public.connect_cancelar_transferencia(uuid, text);
drop function public.connect_transferir_chips(text, int, text, text, text, int, text);
drop table public.connect_transferencias_chips;
