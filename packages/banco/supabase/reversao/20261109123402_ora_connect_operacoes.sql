-- Reversão de ora_connect_operacoes. SOMENTE em banco sem dados reais: apaga operações, eventos,
-- produção, listas oficiais e habilitações da Ora Connect, os gatilhos que protegem chip e venda
-- com operação viva e as permissões connect.operar e connect.gerir. A auditoria fica.
drop trigger if exists vendas_com_connect on public.vendas;
drop trigger if exists itens_serializados_chip_com_ativacao on public.itens_serializados;
drop function if exists public.connect_worker_atualizar_referencias(uuid, text, jsonb),
  public.connect_worker_registrar_consulta(uuid, jsonb), public.connect_worker_operacoes_a_consultar(uuid, text[], int),
  public.connect_worker_registrar_envio(uuid, jsonb), public.connect_worker_reivindicar_envios(uuid, text[], int),
  public.connect_habilitar(text, boolean, text), public.connect_resolver(uuid, text, text),
  public.connect_cancelar(uuid, text), public.connect_registrar(text, jsonb, text);
drop function if exists privado.connect_operacao_travada(uuid), privado.connect_texto(jsonb, text, text, int, boolean),
  privado.connect_evento(public.connect_operacoes, text, text, text, int, text, jsonb),
  privado.proteger_venda_com_connect(), privado.proteger_chip_com_ativacao();
drop table if exists public.connect_producao, public.connect_eventos, privado.connect_dados_envio, public.connect_operacoes,
  public.connect_referencias, public.connect_habilitacoes;
drop function if exists privado.linha_valida(text), privado.cpf_valido(text);
do $$
begin
  perform set_config('ora.motivo', 'Reversão de ora_connect_operacoes', true);
  delete from public.papel_permissoes where permissao in ('connect.operar', 'connect.gerir');
  delete from public.permissoes where codigo in ('connect.operar', 'connect.gerir');
end;
$$;
