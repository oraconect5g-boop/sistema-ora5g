# Pedidos adicionais e configurações — corte 03123d0, 17/11/2026

Complementa os 179 requisitos sem alterar seus IDs. “Parcial” inclui situações com código disponível e dados/configuração ainda ausentes. “Não comprovado” não deve ser automaticamente convertido em “não configurado”: a auditoria não acessou a VPS nem os valores de `.env`.

## Critérios A01–A20 do pedido de loja/canais/publicação

| Aceite | Pedido | Estado verificado e pendência |
|---|---|---|
| A01 | `/loja` e botão Comprar | Implementado/publicado; rota HTTP 200 e link no código do cabeçalho. Não equivale a comprar/pagar. |
| A02 | Catálogo comprável com foto | Parcial; vitrine existe, mas zero produtos marcados para publicar e zero fotos. Faltam oferta e base elegíveis. |
| A03 | Carrinho e checkout | Não implementado integralmente. Reserva com retirada não substitui carrinho/pedido pago. |
| A04 | Pagamento online confirmado | Pendente. Exige gateway, webhook autenticado, reconsulta e estados financeiro/fiscal/estoque coerentes. |
| A05 | Frete, CEP, entrega e rastreio | Parcial; retirada está prevista. Cotação, expedição e acompanhamento por parceiro não comprovados. |
| A06 | Estoque compartilhado e concorrência | Parcial; reservas/expiração/travas e correção da cota estão implementadas/testadas. Falta integração efetiva com todos os canais e carga operacional. |
| A07 | Pós-venda online | Pendente. O núcleo de devolução do PDV ajuda, mas não implementa todo o ciclo web automaticamente. |
| A08 | Telecom online via Nogle | Pendente para operação real; sem habilitações/operações no banco consultado. |
| A09 | Autenticação Mercado Livre/TikTok/Shopee | Pendente; não basta criar nomes de variáveis. |
| A10 | Importação automática de canais | Pendente; distinguir importação por arquivo da Rein e ingestão de API dos marketplaces. |
| A11 | Sincronização de estoque/preço/anúncios | Pendente nos canais externos; definir autoridade do saldo e prevenção de loops. |
| A12 | Ciclo de pedido do marketplace | Pendente; guardar IDs externos e tratar cancelamento/entrega/reembolso. |
| A13 | Contabilidade gerencial dos canais | Pendente; bruto, taxas, comissão, líquido previsto/recebido e divergências por pedido/repasse. |
| A14 | Custos/insights/atribuição Meta | Não iniciado nos seis requisitos META. |
| A15 | Leads e eventos Meta | Não iniciado; consentimento e deduplicação entram no contrato. |
| A16 | Demo atualizada | Parcial e divergente: nomes genéricos e instrução de 13 lojas restantes. Não foi identificado delta de funções específicas da demo nos lotes auditados. |
| A17 | Publicar cada etapa real | Publicação dos cortes TRF-a e REIN-a confirmada no domínio. Não comprovada para toda etapa histórica; banco está uma migration à frente do corte Git. |
| A18 | Acompanhar entregas e versão | Parcial: `/entregas` e `/saude/versao` existem; a primeira lê checkpoint e não verifica sozinha a saúde de APIs. O checkpoint está um lote atrás do build servido. |
| A19 | Dependências por API objetivas | Parcial: catálogo existe, mas contratos/configuração/testes ainda pendentes. Separar falta de documentação, código, credencial e homologação. |
| A20 | Conclusão comprovada | Não atingido: zero requisitos homologados no checkpoint e uma prova nova do importador falhou. |

## Outros pedidos explícitos desta conversa

| Pedido | Situação | Critério para concluir |
|---|---|---|
| Mesma linguagem/stack | Respeitado no código consultado | Manter TypeScript/Next/React/Node/Supabase/PostgreSQL; não introduzir Firebase como substituto |
| 11 lojas e DEFEITOS | Cadastro agora existe | Exibir nomes reais na real/demo; completar dados necessários; DEFEITOS sem venda |
| Estoque do arquivo de 10/11 às 13:20 | Não carregado | Prévia/carga histórica conciliada, 12 locais, seriais, relatório e idempotência |
| Produto com foto, incluindo variante visual | Código parcial, zero fotos reais | Foto principal visível na busca, catálogo, estoque, PDV e loja conforme permissão |
| Filtro por loja e saldos compreensíveis | Leitura/fluxos existem; teste real pendente | Demonstrar físico/reservado/disponível/em trânsito por loja/produto |
| Vários produtos na transferência | Implementado no TRF-a | Aceitar a semântica de separar/enviar; testar origem/destino, cancelamento e replay |
| Reduzir estoque quando entra em transferência | Parcialmente aderente | Hoje reduz disponível ao separar, físico ao enviar; solicitação não reserva. Resolver divergência de expectativa |
| Dono, gerente e vendedor de teste | Só dono provisionado | Entrar com cada papel e comprovar permissões/escopo, sem compartilhar uma conta privilegiada |
| Cliente rápido: nome e WhatsApp; e-mail opcional | Implementado no contrato atual | Teste real de cadastro/venda/nota sem e-mail; endereço completo no contexto fiscal |
| Nota enviada diretamente pelo WhatsApp oficial | Não operacional | Adaptador Meta + template + autenticação + retorno de envio/entrega e destinatário correto |
| Gráficos reais como na demo | Código real disponível | Dados e período/loja corretos; conferir cada painel com seus fatos de origem e perfil |
| Nogle registra oficialmente toda a operação telecom | Não homologado/sem uso registrado | Ativação, chip, recorrência, pagamento e repasse reconciliáveis com a Nogle |
| PayJoy/Aiva via API | Requisito final preservado; implementação operacional ainda manual | Contrato e adaptadores, aprovação, confirmação, taxas, parcelas, liquidação e estorno |
| J7/QI Tech preparadas | Previsão de extensão | Confirmar empresa/parceria/documentação; não apresentar aprovação fictícia como integração |
| Sair da dependência operacional da Rein | Ainda não viável com a base encontrada | Piloto completo, cargas reconciliadas, fechamento, fiscal e telecom, sem API Rein |
| Demo e real atualizadas por etapa | Parcial | Matriz de paridade e prova do domínio; não só merge de código ou mensagem de “publicado” |

## Configuração: presente, ausente e não verificável

| Camada | Evidência | Próxima verificação/entrega |
|---|---|---|
| GitHub → Supabase | Novas migrations aplicadas; diretório `packages/banco` coerente com a estrutura | Igualar catálogo de migrations ao commit final e registrar sua origem |
| Aplicação no domínio | `/saude/versao` confirma 03123d0 e homologacao; rotas públicas 200 | Jornada autenticada e histórico de publicação por lote |
| Ambiente comercial | Domínio atual declara homologacao | Não classificar como produção comercial somente por usar domínio principal |
| Banco | Ativo/saudável; funções, RLS e rotinas examinadas | Resolver migration extra e testar replay/compatibilidade na revisão correspondente |
| `.env.example` | Dois modelos encontrados, raiz e plataforma | Reconciliar comentários históricos, domínio `/loja`, bucket e demo em produção |
| `.env` preenchido | Não lido, conforme AGENTS.md | Executor autorizado verifica presença/validação, sem imprimir valores |
| URL/chave pública Supabase | Aplicação consulta banco e há configuração suportada | Conferir URL/ambiente correto no processo, sem copiar chave secreta para `NEXT_PUBLIC_*` |
| Secret key/SMTP/Auth | Não foi possível certificar configuração da VPS | Provisionar perfis e validar convite, recuperação, redirect URLs, expiração/revogação |
| Proteção de senha vazada | Desativada no advisor | Habilitar se suportado pelo plano/política e validar efeito |
| MFA | Fluxo parcial | Política obrigatória para privilegiados, recuperação e teste de negação |
| Storage | Cinco buckets privados, zero objetos | Upload/uso/remoção por papéis e links temporários; não liberar bucket publicamente para contornar autorização |
| Bucket do modelo raiz | `documentos-privados` consta no modelo; bancos atuais usam buckets específicos | Revisar comentário/uso antes de copiar modelo antigo; não foi encontrado consumo desse nome no código atual pesquisado |
| Reservas vencidas | Job ativo a cada 5 min e execuções OK | Alertar atraso/falha e validar efeito sobre reservas elegíveis |
| Limpeza diária | Job ativo às 03:30 de Brasília | Conferir primeira execução após agendamento e retenção autorizada |
| Nogle | Zero habilitações e operações | Confirmar contrato/tipo de chave e permissões; configuração e homologação por operação |
| Fiscal | Fila interna existe; políticas e documentos sem base operacional | Provedor, certificado, CNPJ/UF, regime, ambientes e cenários com contador |
| WhatsApp | Executável preparado, adaptador hardcoded false | Implementar contrato oficial e validar conta/template antes de ligar agendamento |
| Marketplaces/Meta | Não há implementação operacional comprovada | Aplicativos/contas, OAuth/escopos, tokens protegidos, assinatura, fila, reconsulta e reconciliação |
| Push/PWA | Instalável e página offline | Web Push e transações offline não foram entregues pelo lote inicial |
| Backup/restauração | Procedimentos parciais | Ensaio verificável de restauração de banco e objetos, prazo de recuperação e responsáveis |
| GitHub gate | Branch sem proteção e rulesets vazios na consulta | Checks obrigatórios, política de revisão e prevenção de merge com falhas |

`packages/banco/supabase/config.toml` não consta no corte. Sua ausência não explica, por si só, os cadastros vazios: as migrations existem e estão aplicadas. Documentar/testar o fluxo de CLI/integração realmente usado, sem adicionar arquivo genérico que aponte para outro ambiente.

## Checklist objetivo para cada API externa

Registrar fornecedor/produto exato, documentação e versão, parceria/conta autorizada, escopos, ambiente de teste, nomes das credenciais, política de expiração/renovação, limites e timeouts, assinatura de webhook, eventos fora de ordem, idempotência/reconsulta, reconciliação/repasse, responsável pela pendência e prova de ponta a ponta faltante. Nunca colocar valores secretos no relatório.

Para Nogle, incluir explicitamente chip/ICCID, ativação, portabilidade, recarga, planos/eSIM, pagamento por LINK/SALDO conforme contrato, recorrência, extrato e atribuição ao vendedor. Não presumir que o gateway telecom processe a compra de acessórios/aparelhos sem confirmação do fornecedor.

Para as financeiras, incluir elegibilidade/parceria, simulação, aprovação, consentimentos/documentos, formalização, confirmação/liberação, taxas/parcelas, repasse e cancelamento. Um campo “aprovado” preenchido manualmente não é aprovação recebida da API.

Para WhatsApp, validar conta/número, token, versão Graph, template de utilidade, janela de atendimento, assinatura, identificador de mensagem, estados de entrega, erro/retentativa e consentimento. O link do PDF deve expirar e alcançar somente o destinatário correto.
