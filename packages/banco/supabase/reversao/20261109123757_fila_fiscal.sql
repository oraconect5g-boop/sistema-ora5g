-- Reversão de fila_fiscal. SOMENTE em banco sem dados reais: apaga pedidos de nota, eventos,
-- destinatários e a política de prazo, e o gatilho que liga a fila ao cancelamento da venda.
-- A auditoria fica.
drop trigger if exists vendas_notas on public.vendas;
drop function if exists public.fiscal_definir_politica(int, text), public.notas_cancelar(uuid, text),
  public.notas_registrar_emissao(uuid, text, text), public.notas_corrigir(uuid, jsonb), public.notas_decidir(uuid, boolean, text),
  public.notas_solicitar(uuid, jsonb, text);
drop function if exists privado.notas_da_venda_cancelada(), privado.nota_para_aprovar(uuid), privado.mascarar_documento(text),
  privado.nota_documento(jsonb), privado.nota_evento(public.notas_pedidos, text, text);
drop table if exists public.notas_eventos, privado.notas_destinatarios, public.notas_pedidos, public.fiscal_politicas;
drop function if exists privado.chave_de_acesso_valida(text);
