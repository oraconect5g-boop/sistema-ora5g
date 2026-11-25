-- Reversão de 20261125172755_acoes_na_nogle (lote CONNECT-j): tira as funções e as tabelas das ações na Nogle. O que a Nogle já
-- fez (o bloqueio, o PDV criado, a compra) não volta; o registro dos pedidos se perde com a tabela.
drop function public.connect_worker_registrar_acao(uuid, jsonb);
drop function public.connect_worker_acoes_a_enviar(uuid, int);
drop function public.connect_cancelar_acao(uuid, text);
drop function public.connect_pedir_acao(text, text, text, jsonb, jsonb);
drop function privado.connect_cliente_da_acao(uuid, jsonb, boolean);
drop table privado.connect_acoes_dados;
drop table public.connect_acoes;
