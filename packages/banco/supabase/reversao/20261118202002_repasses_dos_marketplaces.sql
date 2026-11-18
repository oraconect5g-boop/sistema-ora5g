-- Reversão de 20261118202002_repasses_dos_marketplaces (lote REPASSE-a): tira o painel, casar e desfazer, e a tabela dos
-- repasses casados. Os casamentos se perdem (a auditoria guarda o histórico); os pedidos e o extrato ficam como estão.
drop function if exists public.marketplace_repasses_painel(date, date);
drop function if exists public.marketplace_repasse_desfazer(text, date, text);
drop function if exists public.marketplace_repasse_casar(text, date, uuid, text);
drop function if exists privado.repasse_esperado(uuid, text, date);
drop function if exists privado.repasses_da_rede();
drop table if exists public.marketplace_repasses;
