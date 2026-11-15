-- Reversão de 20261115193611_relatorio_do_titular (lote QUAL-011a): a função do relatório sai. As entradas da auditoria
-- (cliente.relatorio_do_titular) ficam: a auditoria não se apaga.
drop function if exists public.cliente_dados_do_titular(uuid, text);
