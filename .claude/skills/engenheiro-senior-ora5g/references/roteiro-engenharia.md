# Roteiro de desenvolvimento e governança

## Estratégia geral

Construir processos **verticais ponta a ponta**, não telas soltas. Preservar a arquitetura modular atual. Cada história passa por: requisito → decisão de domínio/ADR → código + migration → testes de regra/banco/RLS/e2e → revisão independente → ambiente de homologação → aceite do proprietário → implantação controlada. Para fiscais, pagamentos e telecom, validar a operação com o especialista/provedor. Nenhum recurso "completo" sem evidência.

## Ciclo 0 — reconciliar repositório e documentos (imediato)

1. Buscar `git status`, SHA, branches, PR #33, mudanças não commitadas; ler `CLAUDE.md`, `AGENTS.md`, docs atuais e arquivos críticos.
2. Atualizar matriz de estados: `backlog.json` (179), `status-requisitos.json` (73 rastreados, ainda sem homologação), issues e código. Responder primeiro quais achados foram corrigidos de verdade (#55–#59, #45–#53), quais regressões continuam, e o que é teste pendente.
3. Confirmar desvio documental: 11 lojas atuais + DEFEITOS, piloto Santa Cândida, 14 alvo, importação de estoque via arquivos Rein, Nogle única.
4. Inspecionar risco de `main` sem proteção e reviews ausentes; propor política de branch+CI+PR+aprovação, nunca alterá-la sem autorização.
5. Reconciliar PR #33 (divergente) com `main`, trazer o que não está em `main` por cherry-pick/PR avaliada, não merge automático.

## Ciclo 1 — confiabilidade do núcleo do piloto

1. Acesso/Auth e equipe: e2e com usuário fictício real, sessão/revogação, organização/loja, gerente, vendedor; verificar #11, grants/RLS/RPCs.
2. Catálogo: fotos obrigatórias por item no piloto, busca paginada, preço, categorias, importador Rein CSV/XLSX com preview, aprovação, auditoria, idempotência e erros por linha (#26).
3. Estoque físico: saldos/Rein × inventário assinado, serial IMEI/ICCID, reserva/expiração, concorrência real, local DEFEITOS e transferências separação→envio→recebimento (#60).
4. PDV mobile: multiitem, combinação chip+recarga+acessório, descontos e aprovação, financiamento/entrada, caixa individual, Pix/PicPay/PagSeguro manual com comprovante, estornos pendentes, devoluções e vale-troca; E2E funcional em 360px e desktop.
5. Fiscal: pedido a partir da venda, gerência aprova/corrige, registro de chave da NF emitida manualmente, controle de prazo sem bloquear obrigação legal; emissor real só após contador.
6. Operação e infraestrutura: CI completo, scanner segredos, tipos, build, testes de recuperação e rollback da homologação, backups/restore, monitoramento e procedimento para falha de internet.

## Ciclo 2 — telecom Ora Connect oficial

1. Reconfirmar catálogo Postman Nogle de 62 funções/16 grupos, tipos de chave, perguntas pendentes, ambientes e limites; sem endpoints inventados.
2. Revisar worker, outbox, falhas de rede e estados, distinção de `LINK` e `SALDO`; corrigir/revalidar #54 e achados #55–#59 em HEAD, especialmente colisões de evidência e dados do titular.
3. Homologar **primeiro com linha/ICCID de teste autorizados** os três fluxos suportados (ativação, recarga, portabilidade). Nenhuma ativação real na loja sem aprovação.
4. Depois estender cobrança/gateway, carteira, repasse, recorrência e transferências oficiais, APENAS quando contratos/esquemas e critérios de conciliação forem confirmados pela Nogle.
5. Produção comercial/bonificações somente por eventos confirmados. Separar custo/repasse/margem de preço de face; não vazar custos ao vendedor.

## Ciclo 3 — piloto e corte operacional

1. Treinar gerente e vendedores da Santa Cândida, com celular real e internet da loja; registrar hardware/padrões de acesso e suporte.
2. Operar paralelo Rein e Ora (2 a 4 semanas como referência do documento de go/no-go): Rein permanece oficial; Ora replica/simula para comparar, sem duplicar emissão, comissão, caixa ou produção.
3. Conciliar diariamente vendas, IMEI/ICCID, recargas/ativações, pagamentos, caixa, notas e incidências. Toda exceção tem dono e plano de resolução.
4. Go/no-go escrito pelo proprietário, com contador quando envolver fiscal. Só após aprovação a Ora passa a ser oficial por assunto/loja.
5. Escalar por ondas 1→3→7→14, mas a carga atual deve refletir 11 comerciais + DEFEITOS; ondas adicionais exigem novas lojas concretas.

## Ciclo 4 — crescimento nacional e funcionalidades completas

Pós-núcleo estável, priorizar Ora Connect expandida, e-commerce nacional, integração de link de pagamento oficial, Mercado Livre/TikTok Shop e depois Shopee, CRM omnichannel/WhatsApp, Meta Ads, assistência técnica, gestão avançada de metas/finanças, analytics/IA. Esses itens entram no backlog desde já, mas não podem desviar recursos de correções P0 do piloto nem ser simulados como reais. Infra de filas, estoque por canal, contratos versionados e RBAC tornam o crescimento sustentável.

## Regras de colaboração Claude Code + Codex

| Passo | Executor | Evidência mínima |
|---|---|---|
| Requisitos / design / contrato | Claude Code (ou alternado) | Issue com ID, aceite, escopo, dependências |
| Implementação em branch isolada | Agente atribuído | Diff pequeno, testes e migrações incrementais |
| Revisão independente | Outro agente | Testes de casos negativos, concorrência, autorização, segurança, fiscal/dinheiro |
| Correções | Autor do PR | Casos reexecutados, sem regressões |
| Merge / homologação / publicação | Responsável autorizado | CI verde, revisão, aceite humano para impacto real |

Evitar instruções enormes repetidas dentro de `CLAUDE.md`: a skill carrega o processo ao ser chamada. Não modificar `AGENTS.md` ou `CLAUDE.md` existentes sem revisão; registrar decisões em ADRs e documentação de estado atual.

## Template de entrega obrigatória por issue

```text
Issue / ID requisito:
SHA base e branch:
Estado anterior comprovado:
Alterações realizadas e arquivos:
Impacto em esquema / migration / idempotência / RLS / concorrência:
Testes executados (comandos, resultado, evidências):
Testes não executados e motivo:
Contrato externo comprovado / bloqueio:
Riscos e rollback/compensação:
Review Codex/Claude:
Estado final: implementado em desenvolvimento | testado | homologado (só com aceite) | bloqueado
Pendências e próximo passo:
```

## Regras específicas para auditoria e validação

- Em migrações: reexecutar de zero com PostgreSQL local e testar RLS/funcões SECURITY DEFINER, grants, links CPF/IMEI/ICCID, locks, idempotência e dados legados. Não alterar migrations antigas já aplicadas; criar a próxima.
- Em pagamento: venda ≠ confirmação ≠ liquidação ≠ conciliação ≠ estorno; manual não é API e UI não é evidência do banco.
- Em telecom: não repetir pedido se resultado é incerto; usar consulta oficial ou revisão gerencial com prova e evitar evidência de uma recarga confirmando outra.
- Em fiscal: a fila interna não dispensa documento obrigatório nem transforma aprovação em autorização da SEFAZ.
- Em IA: auditoria de sugestões, conteúdo permitido, consentimento e aprovação para ações sensíveis.
- Em relatórios/metas: quantidades, receita, margem, repasse, custo e comissão separados; inverter/estornar performance quando negócio exigir.
- Não fazer promessas de "zero bugs", "zero migrações" ou "tudo pronto em seis meses".
