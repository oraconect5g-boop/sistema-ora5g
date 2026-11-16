# Estado verificado para retomar — 14/11/2026

Base `dd31e91465335b7ad4a4f1ff59e80f7981ddd78d`, comparada com `51417a8`: oito commits e 47 arquivos alterados. Snapshot pelo GitHub, sem checkout Git local independente. Não foi alegado git status limpo.

## O que mudou desde o relatório anterior

- **L9a:** regras de bônus por meta, faixas/versões, cartão e extrato fato a fato do vendedor.
- **L9b:** conferência/contestação da gerência, aprovação do dono, valor aprovado por vendedor e fechamento mensal imutável, com tela/planilha/impressão.
- **D-014:** modelo vigente é bônus por meta, **sem comissão por venda**. Esta decisão deve prevalecer sobre redação histórica de alguns IDs e pesquisas.
- **D-039:** bônus aprovado ainda não vira automaticamente conta a pagar nem comprova pagamento. Forma, vencimento e competência permanecem decisão específica; não fingir que a folha foi paga nem implementar outra regra por suposição.
- **53 migrations** e 53 MD5 do registro do programador coincidem com os arquivos. A consulta foi ao registro versionado, não ao banco remoto. Migrations L9: `20261114092832_bonus_por_meta.sql` e `20261114104004_bonus_fechamento.sql`.
- Site conferido às **09:38 de 14/11**, São Paulo: `dd31e91`, build **07:50**. As novas rotas de bônus/extrato/fechamento respondem 307 para login; isso não é jornada autenticada.

## Planejamento atual

| Estado declarado | Quantidade |
|---|---:|
| Testado em desenvolvimento | 38 |
| Parcial | 65 |
| Não iniciado | 73 |
| Bloqueado | 2 |
| Restrição respeitada | 1 |
| Total | 179 |
| Homologado | 0 |

Os 179 IDs estão em `FILA_INTEGRAL_179.md`, com aceite, nota/evidência e próxima ação. Não usar esses totais como percentual de prontidão. O usuário autorizou continuar todo o escopo; não concluir só o piloto, financeiro ou mockup.

## Erros ainda reproduzíveis

| Issue | Resultado observado na base atual | Resultado seguro exigido |
|---|---|---|
| #78 | Autor da contagem consegue aprovar o próprio ajuste quando outro usuário abriu/enviou | Segregação considerando o contador efetivo, inclusive recontagem/múltiplos contadores |
| #79 | IMEI e IMEI2 do mesmo aparelho inflam quantidade contada | Uma contagem por identidade física; desconhecidos/fora do escopo separados |
| #80 | 501 itens, primeiros 500 conferidos e último pendente: Tudo conferido | Totais completos autorizados no banco e lista paginada |
| #82 | Reembolso Pix pendente é descontado como já pago na base da previsão | Somente saída efetiva, na data da confirmação, sem duplicar |
| #83 | Desfazer repasse depois de cancelar a venda reabre crédito e aceita novo recebimento | Transição compatível com cancelamento, sem criar novo crédito exigível e com histórico preservado |

Adicional condicionado à configuração: com teto simulado de API 1.000, a exportação de 1.001 contas retorna 1.000 e `mais:false`, embora peça 5.001. O teto remoto não foi medido; implementar paginação/completude e conferir no destino.

As reproduções passam por observar o bug; não aprovam esse comportamento. Quatro casos antigos de R1/R2 foram retestados com resultado seguro (#69–#72). Não tratar todas as issues abertas históricas como bugs persistentes.

## Configuração e operação que ainda precisam de prova

- #76/PR #77 ainda não implementados: nome/WhatsApp no rápido, e-mail opcional, endereço fiscal e nota por WhatsApp oficial. As áreas afetadas não foram corrigidas pelos lotes L9.
- J1 com dono/gerente/vendedor continua pendente. A criação dos três usuários já foi solicitada/autorizada; falta executar/vincular/testar e entregar acesso por canal privado, sem publicar credenciais.
- #84 acompanha prova do ambiente: registro de 53 aplicadas não substitui login/RPC/Storage/rotinas reais. Não repetir o bloqueio antigo de 12 migrations ausentes nem reaplicar SQL às cegas.
- Nogle C1/C2, emissão fiscal e WhatsApp precisam de contratos/habilitação e código/homologação. Configuração por nomes não comprova integração operacional. Valores de ambiente não foram lidos pelo revisor.
- O arquivo de estoque já fornecido é histórico; carga do piloto e conciliação de movimentos/fotos/dados definitivos ainda não foram homologadas.

## Verificações executadas

- Inventário: 169 diretórios, 778 arquivos, 766 textos com SHA de blob validado, 111 Markdown e 12 binários somente inventariados. Revisão do delta e do planejamento, reaproveitando auditorias anteriores dos arquivos preservados; não é certificação linha por linha de todo o histórico.
- Dependências locais reaproveitadas da instalação limpa anterior por hardlinks, com **package-lock idêntico**. Links dos workspaces resolvem para o snapshot atual; não houve troca de dependência.
- Lint, tipos, build e geradores passaram.
- Testes selecionados atuais: **141 de banco/autorização/novos bônus + 132 de UI/regras + 2 de tipos gerados = 275**, todos passaram; **11 provas independentes** também passaram, com a natureza acima.
- E2E local: **243 passaram, 11 ignorados**. A primeira tentativa local não iniciou por falta de build; após gerar a build, a suíte foi repetida e passou. Isso foi uma pré-condição local, não um bug do produto.
- CI exato do topo: [run 43587125655, tentativa 2](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/43587125655) **aprovada** após a reexecução solicitada pelo Codex. Nos logs: **1.729 testes passaram**, um TODO; **243 E2E passaram, 11 ignorados**; audit de produção sem vulnerabilidades reportadas. A tentativa inicial havia sido cancelada no E2E.

## Entrega desta rodada

O arquivo `PROMPT_CLAUDE_CONCLUSAO_TOTAL.md` é o texto completo de execução. Começa pelos bugs e pela jornada real, preserva L9a/L9b e percorre todos os domínios/IDs até os critérios de conclusão. `FONTES_OBRIGATORIAS.md` inclui as PRs documentais fora da main e os 111 Markdown. Evidências e limites estão em `evidencias/`.

Nenhum código de produto/migration foi alterado pelo Codex nesta rodada. Nenhum deploy, leitura de `.env`, acesso ao servidor, criação de usuário real, operação comercial ou chamada autenticada a fornecedor foi realizado pelo revisor. A única reexecução remota foi a do CI de verificações.
