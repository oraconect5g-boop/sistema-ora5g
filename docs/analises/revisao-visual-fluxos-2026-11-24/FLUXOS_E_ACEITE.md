# Fluxos, contratos e aceite por jornada

Esta matriz define o que precisa ser demonstrado; não afirma que cada cenário abaixo foi executado pelo revisor. O inventário de rotas traz ações/RPCs detectadas diretamente na página; chamadas delegadas a bibliotecas exigem seguir os imports. Os fluxos devem ligar UI → action/route → domínio → RPC/transação → worker/fornecedor quando houver → consulta atualizada → auditoria.

| Jornada | Caminho completo esperado | Casos de falha/limite e prova de encerramento |
|---|---|---|
| J01 Acesso e loja | Entrar → vínculo ativo → escolher loja → turno → menu do perfil → sair | Conta bloqueada, turno vencido, acesso direto a URL, troca de loja, revogação; vendedor não enxerga função de dono. Recuperação/convite depende de SMTP, não de layout |
| J02 Catálogo e fotos | Importar/editar → prévia → validar código/preço/tipo → aplicar com responsável distinto → buscar no PDV/estoque/site → foto/variação | Duplicado, preço inválido, produto sem foto, foto incorreta, lote repetido, carga rejeitada. 2.271 importados não prova cobertura de imagens/IMEI |
| J03 Estoque inicial e inventário | Arquivo com corte → reconciliação → aprovação → livro → saldo por loja → contagem → ajuste aprovado | Estoque antigo não vira saldo de hoje; diferença físico/disponível não é apagada; duas aprovações não duplicam a carga; aparelho exige IMEI |
| J04 Transferência | Escolher origem/destino → solicitar e reservar → separar → enviar → receber → saldo e auditoria | Estoque insuficiente, duplicidade, cancelamento, falta/avaria, DEFEITOS, concorrência com venda, mais de 50 posteriores e mais de 50 abertas. Solicitar reduz disponível; enviar reduz físico; receber soma uma vez no destino |
| J05 Venda presencial | Abrir caixa → buscar produto → reservar item/IMEI → cliente → desconto autorizado → pagamentos → concluir → comprovante | Pagamento misto, troco somente no dinheiro, desconto negado, clique duplo, timeout, falta de rede e disputa pelo último item; estoque e caixa conciliam com uma única venda |
| J06 Cliente e fiscal | Cadastro rápido com nome/WhatsApp → reutilizar cliente → completar documento/endereço para emissão → pedido/aprovação → emissor → XML/PDF → envio | E-mail ausente permitido, telefone normalizado, duplicidade, dados sensíveis por perfil, fornecedor indisponível. WhatsApp aberto no navegador não equivale a envio por API oficial |
| J07 Devolução/troca | Localizar venda → selecionar itens → definir retorno/avaria → registrar vale/estorno → confirmar externo → livro/caixa | Parcial, dupla devolução, estorno sem prova, um débito de extrato usado duas vezes, item já transferido; não confundir solicitação e liquidação |
| J08 Caixa e financeiro | Abrir caixa → receber → sangria/suprimento → fechar → conferir → conciliar recebíveis/extrato → Resultado/Previsão | Dois operadores, diferença justificada, transação duplicada, repasse parcial, taxa, chargeback, depósito agrupado e desfazer; números do gráfico batem com registros do mesmo filtro |
| J09 Site → retirada | Vitrine → carrinho por loja → nome/WhatsApp → reserva → pedido recuperável → Pix se habilitado → confirmação por reconsulta → retirada no PDV | Expiração, perda de conexão, clique duplo, webhook repetido/fora de ordem, pago sem dupla cobrança, cancelamento/estorno, desistência. PAY-014b é bloqueador antes de habilitar pagamento real |
| J10 Ora Connect | Elegibilidade/chip/cliente → operação → fila worker → Nogle → confirmação/reconsulta → produção → repasse oficial | Timeout ambíguo não reenvia cegamente; pagamento na modalidade correta; habilitação desligada impede operação; contabilidade e comissão exigem fonte oficial |
| J11 Financeiras | Cliente → aprovação oficial → entrada + financiado → venda → recebível → prazo → repasse/taxa → resultado | Contrato e API necessários para aprovação automática; alternativa manual identificada; valor financiado não é nova receita ao receber; inadimplência sem prazo não pode ser inventada |
| J12 Marketplaces/Meta | Conectar conta → produto/estoque → pedido → reserva/baixa → entrega → tarifa/repasse → conciliação; Ads → custo/atribuição | OAuth, duplicidade, reprocessamento, cancelamento e conflito de estoque. Arquivo é caminho assistido distinto. J7/QI continuam preparadas para integração futura, sem contrato fictício |
| J13 Assistência | Cliente/aparelho → OS/fotos → orçamento → aprovação → serviço/peça → recebimento → entrega/garantia | Recusa de orçamento, peça retirada uma vez, técnico sem dados financeiros indevidos, devolução e prazo; avisos oficiais dependem do canal |
| J14 Metas e bônus | Definir regra/faixas → eventos de venda/telecom/OS → estornos → apuração → revisão → fechamento | Não inventar comissão por venda quando a decisão é bônus mensal; regra pendente gera estado explicativo, não ganho fictício |
| J15 Operação e publicação | Commit → CI → migration compatível → deploy → domínio/SHA → smoke → monitoramento → recuperação | Ambiente identificado, secrets só no worker, falha de migration, worker parado, rollback/compensação e restauração ensaiada. Monitor interno não detecta sozinho queda total do servidor |

## Contratos transversais que nenhuma unificação visual pode quebrar

- Autorização no servidor e no banco por organização, unidade, perfil e sessão. Menu oculto não protege RPC.
- Valores em centavos e quantidades inteiras; invariantes de saldo/IMEI, livro e exclusividade de referência externa.
- Transação atômica para cada mudança de estado, idempotência em reenvio e controle de concorrência nos casos críticos.
- Segredos fora do browser; webhooks validados e persistidos antes de ACK; reconsulta confirma pagamento.
- Erro explícito, registro correlacionável sem dados pessoais desnecessários, e caminho para resolver pendências antigas.
- Mudanças de schema por migration nova; não editar migration já aplicada nem retirar testes para obter verde.

## Registro de aceite consolidado

Para cada jornada registrar: IDs dos requisitos e lotes; SHA do código e do domínio; ambiente; versão de migration; perfil/loja fictícia usada; passos e resultado; saldos antes/depois; casos negativos; logs/capturas sem segredo; pendências; parecer do revisor; decisão do proprietário. Um aceite apresentado pode cobrir vários lotes quando a prova cobre todos; não multiplicar perguntas sobre a mesma jornada. Parcial permanece parcial enquanto houver parte ausente.
