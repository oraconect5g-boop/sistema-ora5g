-- Reversão de 20261111132503_lojas_cadastro_e_configuracao (só em banco sem dados reais).
-- As lojas criadas ou editadas pelas funções continuam (são dados); só saem as funções e a tabela de configurações.
drop function if exists public.loja_definir_configuracao(uuid, jsonb, timestamptz, text);
drop trigger if exists transferencias_loja_ativa on public.transferencias;
drop trigger if exists itens_serializados_loja_ativa on public.itens_serializados;
drop trigger if exists estoque_movimentos_loja_ativa on public.estoque_movimentos;
drop trigger if exists estoque_reservas_loja_ativa on public.estoque_reservas;
drop trigger if exists vendas_loja_ativa on public.vendas;
drop trigger if exists caixas_loja_ativa on public.caixas;
drop function if exists privado.loja_ativa_para_movimento();
drop function if exists public.loja_definir_situacao(uuid, text, text);
drop function if exists public.loja_atualizar(uuid, text, text, text, text, text);
drop function if exists public.loja_criar(uuid, text, text, text, text, text, text, uuid, text);
drop function if exists public.loja_historico(uuid);
drop function if exists public.lojas_da_rede();
drop function if exists privado.configuracao_vigente(uuid);
drop function if exists privado.gere_lojas_da_organizacao(uuid);
drop table if exists public.unidade_configuracoes;
drop function if exists privado.horarios_validos(jsonb);
