-- Reversão de 20261118194259_deposito_nao_vende (lote CD-a): o depósito volta a poder vender, como antes da D-043 ter
-- o padrão em uso. Se o proprietário decidir que o depósito vende, os painéis do estoque (G3 e G3b) passam a contá-lo
-- entre os locais que vendem, num lote próprio.
drop trigger if exists reservas_fora_do_deposito on public.estoque_reservas;
drop trigger if exists vendas_fora_do_deposito on public.vendas;
drop function if exists privado.deposito_nao_vende();
