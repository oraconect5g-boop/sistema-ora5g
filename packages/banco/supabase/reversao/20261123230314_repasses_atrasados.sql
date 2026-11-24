-- Reversão de 20261123230314_repasses_atrasados (lote FIN-007a): tira o prazo de repasse das financeiras, as cobranças
-- registradas e a leitura dos atrasados. PERDE os prazos definidos e o histórico das cobranças (a trilha de auditoria de
-- cada inserção fica). As contas a receber não mudam: a tela volta a mostrar só a idade de cada conta.
drop function if exists public.repasses_atrasados(uuid);
drop function if exists public.cobranca_de_repasse_registrar(uuid, text, text, text, date, text);
drop function if exists public.prazo_de_repasse_definir(text, integer, text);
drop table if exists public.cobrancas_de_repasse;
drop table if exists public.prazos_de_repasse;
