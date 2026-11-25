-- Reversão de 20261125141320_consultas_da_nogle (lote CONNECT-g): tira as quatro funções e a tabela das consultas. As
-- consultas não mudaram nada na Nogle; o registro de quem consultou o quê se perde com a tabela.
drop function public.connect_worker_limpar_consultas(uuid);
drop function public.connect_worker_registrar_resposta_da_consulta(uuid, jsonb);
drop function public.connect_worker_consultas_a_fazer(uuid, int);
drop function public.connect_consultar(text, text, text);
drop table public.connect_consultas;
