# Funções e tabelas efetivas após as 51 migrations

Inventário obtido de banco PGlite descartável pela aplicação do SQL da base final 51417a8. Não é leitura do projeto remoto. EXECUTE concedido não dispensa a guarda de autorização da RPC; as regressões do projeto percorrem os cenários de acesso.

| Função | Schema | SECURITY DEFINER | EXECUTE authenticated | EXECUTE anon |
|---|---|---|---|---|
| privado.abaixo_do_custo(venda_itens) | privado | True | False | False |
| privado.atualizar_espera_de_aprovacao(uuid) | privado | True | False | False |
| privado.atualizar_saldo() | privado | True | False | False |
| privado.auditar_mudanca() | privado | True | False | False |
| privado.auditoria_completar_organizacao() | privado | False | True | True |
| privado.auditoria_imutavel() | privado | False | True | False |
| privado.chave_de_acesso_valida(text) | privado | False | False | False |
| privado.cliente_compras(uuid) | privado | True | False | False |
| privado.cliente_consultas_recentes() | privado | True | False | False |
| privado.cliente_contexto(text) | privado | True | False | False |
| privado.cliente_explicacao(integer,integer,timestamp with time zone) | privado | False | False | False |
| privado.cliente_mesclado_fixo() | privado | False | False | False |
| privado.cliente_pode_contatar(uuid,text,text) | privado | True | False | False |
| privado.cliente_registrar_acesso(text,uuid,uuid,uuid,jsonb) | privado | True | False | False |
| privado.cliente_resumo(uuid,text,text) | privado | True | False | False |
| privado.cliente_segmento(integer,integer,timestamp with time zone,timestamp with time zone) | privado | False | False | False |
| privado.cnpj_valido(text) | privado | False | True | False |
| privado.configuracao_vigente(uuid) | privado | True | False | False |
| privado.connect_evento(connect_operacoes,text,text,text,integer,text,jsonb) | privado | True | False | False |
| privado.connect_operacao_travada(uuid) | privado | True | False | False |
| privado.connect_resumo_titular(uuid,jsonb) | privado | True | False | False |
| privado.connect_texto(jsonb,text,text,integer,boolean) | privado | False | False | False |
| privado.contas_pagar_categorias_da_organizacao() | privado | True | False | False |
| privado.contas_pagar_semear_categorias(uuid) | privado | True | False | False |
| privado.conteudo_do_item(venda_itens) | privado | False | False | False |
| privado.cpf_valido(text) | privado | False | False | False |
| privado.crm_atende_na_loja(uuid,uuid) | privado | True | False | False |
| privado.crm_criar_segredo() | privado | True | False | False |
| privado.crm_evento(uuid,uuid,text,text,text,text) | privado | True | False | False |
| privado.crm_pode_conduzir(uuid,uuid) | privado | True | False | False |
| privado.crm_proximo_passo(jsonb,timestamp with time zone) | privado | False | False | False |
| privado.custo_atual(uuid) | privado | True | False | False |
| privado.custo_vigente(uuid) | privado | True | False | False |
| privado.dinheiro_no_caixa(uuid) | privado | True | False | False |
| privado.divergencias_estoque(uuid) | privado | True | False | False |
| privado.dono_da_organizacao(uuid) | privado | True | False | False |
| privado.encerrar_reserva(uuid,text,boolean) | privado | True | False | False |
| privado.entrada_em_json(uuid,boolean,boolean) | privado | True | False | False |
| privado.exigir_motivo(text) | privado | False | False | False |
| privado.expirar_reservas(uuid,uuid) | privado | True | False | False |
| privado.fim_do_turno(timestamp with time zone) | privado | False | False | False |
| privado.gere_catalogo(uuid) | privado | True | False | False |
| privado.gere_lojas_da_organizacao(uuid) | privado | True | False | False |
| privado.gere_organizacao(uuid) | privado | True | False | False |
| privado.horarios_validos(jsonb) | privado | False | False | False |
| privado.iccid_valido(text) | privado | False | False | False |
| privado.imei_valido(text) | privado | False | False | False |
| privado.importacao_comparar(uuid,jsonb) | privado | True | False | False |
| privado.importacao_conferir_travas(uuid,text) | privado | True | False | False |
| privado.importacao_recomparar(uuid) | privado | True | False | False |
| privado.importacao_totais(uuid) | privado | True | False | False |
| privado.item_saiu_por_estorno_de_entrada(uuid) | privado | True | False | False |
| privado.item_so_teve_recebimentos(uuid) | privado | True | False | False |
| privado.lancar_movimento(uuid,uuid,integer,text,uuid,text,text,text,text,uuid) | privado | True | False | False |
| privado.linha_valida(text) | privado | False | False | False |
| privado.livro_imutavel() | privado | False | False | False |
| privado.local_de_excecao_nao_vende() | privado | True | False | False |
| privado.loja_ativa_para_movimento() | privado | False | False | False |
| privado.luhn_valido(text) | privado | False | False | False |
| privado.mascara_documento(text) | privado | False | False | False |
| privado.mascara_email(text) | privado | False | False | False |
| privado.mascara_telefone(text) | privado | False | False | False |
| privado.mascarar_documento(text) | privado | False | False | False |
| privado.maximo_sem_aprovacao(venda_itens) | privado | True | False | False |
| privado.meio_com_comprovante(text) | privado | False | False | False |
| privado.meio_financeira(text) | privado | False | False | False |
| privado.meio_liquidavel(text) | privado | False | False | False |
| privado.meio_provedor(text) | privado | False | False | False |
| privado.meio_valido(text) | privado | False | False | False |
| privado.meu_caixa_aberto() | privado | True | False | False |
| privado.minha_venda_aberta(uuid) | privado | True | False | False |
| privado.nota_documento(jsonb) | privado | False | False | False |
| privado.nota_evento(notas_pedidos,text,text) | privado | True | False | False |
| privado.nota_para_aprovar(uuid) | privado | True | False | False |
| privado.notas_da_venda_cancelada() | privado | True | False | False |
| privado.organizacoes_com_permissao(text) | privado | True | True | False |
| privado.organizacoes_do_catalogo() | privado | True | True | False |
| privado.organizacoes_que_enviam_fotos() | privado | True | True | False |
| privado.papel_de_direcao(text) | privado | False | False | False |
| privado.perfis_que_gero() | privado | True | True | False |
| privado.pessoa_gere_equipe(uuid,uuid,text) | privado | True | False | False |
| privado.pode_alterar_preco(uuid,uuid) | privado | True | False | False |
| privado.pode_gerir_conta_pagar(uuid,uuid) | privado | True | True | False |
| privado.preco_geral_aberto(uuid) | privado | True | False | False |
| privado.preco_vigente_linha(uuid,uuid,text,timestamp with time zone) | privado | True | False | False |
| privado.precos_protegidos() | privado | False | False | False |
| privado.proteger_chip_com_ativacao() | privado | True | False | False |
| privado.proteger_posicao_item() | privado | False | False | False |
| privado.proteger_venda_com_connect() | privado | True | False | False |
| privado.proteger_venda_com_devolucao() | privado | True | False | False |
| privado.reconciliar_identidades_do_catalogo() | privado | True | False | False |
| privado.registrar_identificadores() | privado | True | False | False |
| privado.registrar_item_serializado(uuid,uuid,text,text,text,text,text,uuid,text,text) | privado | True | False | False |
| privado.sessao_atual() | privado | False | True | False |
| privado.sessao_no_turno() | privado | True | False | False |
| privado.situacao_do_dinheiro(venda_pagamentos) | privado | False | False | False |
| privado.so_desfecho_do_pendente() | privado | False | False | False |
| privado.so_insercao() | privado | False | False | False |
| privado.telefone_normalizado(text) | privado | False | False | False |
| privado.terminal_do_pagamento(uuid,text,text) | privado | True | False | False |
| privado.tipo_da_variante(uuid) | privado | True | False | False |
| privado.transferencia_travada(uuid) | privado | True | False | False |
| privado.trava_da_chave(text,uuid,text) | privado | False | False | False |
| privado.travar_preco(uuid,uuid,uuid,text) | privado | False | False | False |
| privado.trocar_preco_geral(uuid,uuid,bigint,text) | privado | True | False | False |
| privado.turno_valido(timestamp with time zone,timestamp with time zone) | privado | False | False | False |
| privado.unidades_com_permissao(text) | privado | True | True | False |
| privado.unidades_visiveis() | privado | True | True | False |
| privado.usuario_ativo() | privado | True | True | False |
| privado.vale_no_pagamento() | privado | True | False | False |
| privado.validar_item_serializado() | privado | False | False | False |
| privado.validar_movimento() | privado | True | False | False |
| privado.validar_unidade() | privado | False | True | False |
| privado.validar_vinculo() | privado | False | True | False |
| privado.variante_com_estoque(uuid) | privado | True | False | False |
| privado.variante_usada(uuid) | privado | True | False | False |
| privado.vinculos_vigentes() | privado | True | True | False |
| abrir_caixa(bigint,text) | public | True | True | False |
| adicionar_item(uuid,uuid,uuid,integer,text) | public | True | True | False |
| alterar_situacao_pessoa(uuid,text,text) | public | True | True | False |
| aplicar_desconto(uuid,bigint) | public | True | True | False |
| atividade_criar(jsonb,text) | public | True | True | False |
| atividade_encerrar(uuid,boolean,text) | public | True | True | False |
| caixa_cancelar_saida(uuid) | public | True | True | False |
| caixa_decidir_saida(uuid,boolean,text) | public | True | True | False |
| caixa_pedir_saida(bigint,text,text) | public | True | True | False |
| cancelar_convite(uuid,text) | public | True | True | False |
| cancelar_venda(uuid,text) | public | True | True | False |
| catalogo_definir_politica_desconto(uuid,integer,integer,text) | public | True | True | False |
| catalogo_salvar_categoria(uuid,uuid,text,boolean,text) | public | True | True | False |
| catalogo_salvar_marca(uuid,uuid,text,text) | public | True | True | False |
| catalogo_salvar_produto(uuid,uuid,text,text,uuid,uuid,text,text,boolean,boolean,text,text) | public | True | True | False |
| catalogo_salvar_variante(uuid,uuid,text,text,text,text,text,integer,boolean,text) | public | True | True | False |
| cliente_buscar(text,text) | public | True | True | False |
| cliente_consentir(uuid,text,text,boolean,text) | public | True | True | False |
| cliente_ficha(uuid) | public | True | True | False |
| cliente_revelar(uuid,text) | public | True | True | False |
| cliente_salvar(uuid,jsonb,text,text) | public | True | True | False |
| clientes_duplicados() | public | True | True | False |
| clientes_marcar_diferentes(uuid,uuid,text) | public | True | True | False |
| clientes_mesclar(uuid,uuid,text) | public | True | True | False |
| clientes_segmentos() | public | True | True | False |
| concluir_venda(uuid,jsonb,jsonb,text) | public | True | True | False |
| conferir_caixa(uuid,text) | public | True | True | False |
| conferir_item(uuid) | public | True | True | False |
| conferir_retorno(uuid,boolean,text,text,text) | public | True | True | False |
| confirmar_estorno_externo(uuid,text,text) | public | True | True | False |
| connect_cancelar(uuid,text) | public | True | True | False |
| connect_habilitar(text,boolean,text) | public | True | True | False |
| connect_painel(timestamp with time zone,timestamp with time zone,uuid,uuid) | public | False | True | False |
| connect_registrar(text,jsonb,text) | public | True | True | False |
| connect_resolver(uuid,text,text) | public | True | True | False |
| connect_worker_atualizar_referencias(uuid,text,jsonb) | public | True | False | False |
| connect_worker_operacoes_a_consultar(uuid,text[],integer) | public | True | False | False |
| connect_worker_registrar_consulta(uuid,jsonb) | public | True | False | False |
| connect_worker_registrar_envio(uuid,jsonb) | public | True | False | False |
| connect_worker_reivindicar_envios(uuid,text[],integer) | public | True | False | False |
| conta_pagar_cancelar(uuid,text,boolean) | public | True | True | False |
| conta_pagar_categoria_salvar(uuid,text,boolean,boolean) | public | True | True | False |
| conta_pagar_corrigir(uuid,jsonb,text) | public | True | True | False |
| conta_pagar_desfazer_pagamento(uuid,text) | public | True | True | False |
| conta_pagar_lancar(jsonb,text) | public | True | True | False |
| conta_pagar_pagar(uuid,date,bigint,text) | public | True | True | False |
| contas_a_pagar_resumo(uuid,boolean) | public | False | True | False |
| convidar_pessoa(uuid,text,text,text,uuid[],text) | public | True | True | False |
| criar_venda(text) | public | True | True | False |
| crm_agenda() | public | True | True | False |
| crm_funil() | public | True | True | False |
| decidir_aprovacao(uuid,boolean,text) | public | True | True | False |
| devolver_itens(uuid,jsonb,jsonb,text,text) | public | True | True | False |
| disponibilidade_na_rede(uuid) | public | True | True | False |
| encerrar_vinculo(uuid,text) | public | True | True | False |
| equipe_por_papel(uuid) | public | False | True | False |
| estoque_entrada(uuid,uuid,bigint) | public | True | True | False |
| estoque_entradas(uuid,bigint,integer) | public | True | True | False |
| estoque_estornar_entrada(uuid,text) | public | True | True | False |
| estoque_na_rede(uuid) | public | True | True | False |
| estoque_painel(uuid) | public | False | True | False |
| estoque_registrar_entrada(uuid,text,uuid,text,jsonb,text,text) | public | True | True | False |
| fechar_caixa(bigint,text) | public | True | True | False |
| financeira_desfazer_recebimento(uuid,text) | public | True | True | False |
| financeira_receber(uuid,text,bigint,date) | public | True | True | False |
| financeiras_a_receber() | public | True | True | False |
| financeiro_painel(timestamp with time zone,timestamp with time zone,uuid,boolean) | public | False | True | False |
| fiscal_definir_politica(integer,text) | public | True | True | False |
| fornecedor_salvar(uuid,uuid,text,text,text,boolean,text) | public | True | True | False |
| identidade_bloqueios_a_aplicar() | public | True | False | False |
| identidade_concluir_convite(uuid,uuid,boolean) | public | True | False | False |
| identidade_convites_a_processar(integer) | public | True | False | False |
| identidade_falha_convite(uuid,text) | public | True | False | False |
| identidade_usuario_por_email(text) | public | True | False | False |
| importacao_aplicar(uuid,text,integer) | public | True | True | False |
| importacao_catalogo_previa(uuid,text,text,jsonb,jsonb) | public | True | True | False |
| importacao_descartar(uuid,text) | public | True | True | False |
| importacao_desfazer(uuid,text) | public | True | True | False |
| inventario_abrir(uuid,uuid[],text,text) | public | True | True | False |
| inventario_cancelar(uuid,text) | public | True | True | False |
| inventario_contar(uuid,uuid,integer,text[]) | public | True | True | False |
| inventario_decidir(uuid,boolean,text) | public | True | True | False |
| inventario_enviar(uuid,text) | public | True | True | False |
| liberar_reserva(uuid) | public | True | True | False |
| loja_atualizar(uuid,text,text,text,text,text) | public | True | True | False |
| loja_criar(uuid,text,text,text,text,text,text,uuid,text) | public | True | True | False |
| loja_definir_configuracao(uuid,jsonb,timestamp with time zone,text) | public | True | True | False |
| loja_definir_situacao(uuid,text,text) | public | True | True | False |
| loja_historico(uuid) | public | True | True | False |
| lojas_da_rede() | public | True | True | False |
| margem_itens(timestamp with time zone,timestamp with time zone,uuid,integer,integer) | public | False | True | False |
| margem_painel(timestamp with time zone,timestamp with time zone,uuid) | public | False | True | False |
| metas_definir(uuid,uuid,date,jsonb,text) | public | True | True | False |
| metas_equipe(uuid,date) | public | True | True | False |
| metas_lojas(date,uuid) | public | False | True | False |
| metas_painel(date,uuid) | public | False | True | False |
| movimentar_caixa(text,bigint,text,text) | public | True | True | False |
| notas_cancelar(uuid,text) | public | True | True | False |
| notas_corrigir(uuid,jsonb) | public | True | True | False |
| notas_decidir(uuid,boolean,text) | public | True | True | False |
| notas_registrar_emissao(uuid,text,text) | public | True | True | False |
| notas_solicitar(uuid,jsonb,text) | public | True | True | False |
| oportunidade_anotar(uuid,text) | public | True | True | False |
| oportunidade_atribuir(uuid,uuid,text) | public | True | True | False |
| oportunidade_detalhe(uuid) | public | True | True | False |
| oportunidade_mover(uuid,text,jsonb) | public | True | True | False |
| oportunidade_registrar(uuid,jsonb,text) | public | True | True | False |
| pagamento_conciliar(uuid,text,bigint,date) | public | True | True | False |
| pagamento_desconciliar(uuid,text) | public | True | True | False |
| pagamentos_do_periodo(date,date) | public | True | True | False |
| pedir_aprovacao(uuid,text) | public | True | True | False |
| pendencias_de_foto() | public | True | True | False |
| preco_campanha(uuid,uuid,text,bigint,timestamp with time zone,timestamp with time zone,text) | public | True | True | False |
| preco_cancelar(uuid,text) | public | True | True | False |
| preco_definir(uuid,uuid,text,bigint,timestamp with time zone,text) | public | True | True | False |
| preco_vigente(uuid,uuid,text,timestamp with time zone) | public | True | True | False |
| precos_por_loja(uuid,text) | public | True | True | False |
| previsao_de_caixa(integer,uuid) | public | False | True | False |
| ranking_nomes(uuid[]) | public | True | True | False |
| registrar_foto(uuid,uuid,text,integer,integer,boolean) | public | True | True | False |
| remover_item(uuid) | public | True | True | False |
| repetir_convite(uuid) | public | True | True | False |
| reservar_estoque(uuid,integer,uuid,text,text,integer) | public | True | True | False |
| resultado_do_mes(date,uuid,integer) | public | False | True | False |
| selecionar_unidade(uuid) | public | True | True | False |
| situacao_da_sessao() | public | True | True | False |
| tem_permissao(text,uuid) | public | True | True | False |
| terminal_salvar(uuid,uuid,text,text,text,boolean,text) | public | True | True | False |
| transferencia_encerrar(uuid,text,text) | public | True | True | False |
| transferencia_enviar(uuid) | public | True | True | False |
| transferencia_receber(uuid,text[],integer,text) | public | True | True | False |
| transferencia_separar(uuid,uuid[]) | public | True | True | False |
| transferencia_solicitar(uuid,uuid,uuid,integer,text,text) | public | True | True | False |
| unidade_atual() | public | True | True | False |
| venda_vincular_cliente(uuid,uuid,text) | public | True | True | False |
| vendas_painel(timestamp with time zone,timestamp with time zone,uuid,boolean,uuid) | public | False | True | False |
| vincular_pessoa(uuid,uuid,text,uuid,text) | public | True | True | False |

## Tabelas

| Schema / tabela | RLS | SELECT authenticated | SELECT anon |
|---|---|---|---|
| privado.cliente_dados | True | False | False |
| privado.connect_dados_envio | True | False | False |
| privado.connect_segredos | True | False | False |
| privado.crm_segredos | True | False | False |
| privado.identificadores_itens | False | False | False |
| privado.notas_destinatarios | True | False | False |
| public.aprovacoes_desconto | True | True | False |
| public.atividades | True | True | False |
| public.auditoria | True | True | False |
| public.caixa_movimentos | True | True | False |
| public.caixa_saidas | True | True | False |
| public.caixas | True | True | False |
| public.categorias | True | True | False |
| public.cliente_consentimentos | True | True | False |
| public.cliente_nao_duplicados | True | True | False |
| public.clientes | True | True | False |
| public.connect_eventos | True | True | False |
| public.connect_habilitacoes | True | True | False |
| public.connect_operacoes | True | True | False |
| public.connect_operacoes_custos | True | True | False |
| public.connect_producao | True | True | False |
| public.connect_referencias | True | True | False |
| public.contas_a_pagar | True | True | False |
| public.contas_a_receber | True | True | False |
| public.contas_pagar_categorias | True | True | False |
| public.contexto_sessao | True | True | False |
| public.convites | True | True | False |
| public.custos | True | True | False |
| public.empresas | True | True | False |
| public.entrada_itens | True | False | False |
| public.entradas_estoque | True | False | False |
| public.estoque_movimentos | True | True | False |
| public.estoque_reservas | True | True | False |
| public.estoque_saldos | True | True | False |
| public.estornos_externos | True | True | False |
| public.fiscal_politicas | True | True | False |
| public.fornecedores | True | True | False |
| public.fotos_produto | True | True | False |
| public.importacao_linhas | True | True | False |
| public.importacoes | True | True | False |
| public.inventario_itens | True | True | False |
| public.inventarios | True | True | False |
| public.itens_serializados | True | True | False |
| public.marcas | True | True | False |
| public.metas | True | True | False |
| public.notas_eventos | True | True | False |
| public.notas_pedidos | True | True | False |
| public.oportunidade_eventos | True | True | False |
| public.oportunidades | True | True | False |
| public.organizacoes | True | True | False |
| public.papeis | True | True | False |
| public.papel_permissoes | True | True | False |
| public.perfis_usuario | True | True | False |
| public.permissoes | True | True | False |
| public.precos | True | True | False |
| public.produtos | True | True | False |
| public.terminais | True | True | False |
| public.transferencia_itens | True | True | False |
| public.transferencias | True | True | False |
| public.unidade_configuracoes | True | True | False |
| public.unidades | True | True | False |
| public.vales_troca | True | True | False |
| public.vales_troca_usos | True | True | False |
| public.variantes | True | True | False |
| public.venda_devolucao_itens | True | True | False |
| public.venda_devolucao_reembolsos | True | True | False |
| public.venda_devolucoes | True | True | False |
| public.venda_itens | True | True | False |
| public.venda_itens_custos | True | True | False |
| public.venda_pagamentos | True | True | False |
| public.venda_retornos | True | True | False |
| public.vendas | True | True | False |
| public.vinculos | True | True | False |
