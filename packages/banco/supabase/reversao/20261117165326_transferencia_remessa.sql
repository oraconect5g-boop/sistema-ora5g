-- Reversão de 20261117165326_transferencia_remessa (lote TRF-a): tira as duas funções, a ligação da transferência com a
-- remessa e a tabela das remessas. As transferências ficam, cada uma como pedido avulso.
drop function public.transferencia_lojas();
drop function public.transferencia_remessa_enviar(uuid);
drop function public.transferencia_solicitar_remessa(uuid, uuid, jsonb, text, text);
drop index public.transferencias_remessa;
alter table public.transferencias drop column remessa_id;
drop table public.transferencia_remessas;
