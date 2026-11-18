# Revisão técnica do planejamento — 17/11/2026

> **Publicação integral solicitada pelo proprietário após a entrega da auditoria.** Este documento preserva o corte de 17/11/2026, commit `03123d0`; não representa uma nova auditoria dos commits posteriores. O bloqueio inicial de divulgação foi seguido de autorização expressa para adicionar os materiais completos ao GitHub. Planilha original e credenciais continuam fora do pacote.

**Rascunho reduzido preservado como histórico. O proprietário posteriormente solicitou a publicação do pacote integral.** Este texto omite dados operacionais consultados no Supabase, arquivo original de estoque, seu hash, saldos, informações fiscais/cadastrais e configuração privada de fornecedores.

Corte de código: `03123d042f0d51493a17eec449967a5a48124a59`. O status versionado registra 63 requisitos testados, 69 parciais, 42 não iniciados, 3 bloqueados e 2 regras respeitadas, de um total de 179. “Testado” deve permanecer distinto de configuração, publicação e homologação.

O [CI desse commit](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/44139567980) passou com 2.720 testes, 1 TODO, 293 E2E aprovados e 13 pulados. Esses resultados não substituem uma jornada com dados de entrada representativos e contratos externos verificados.

## Revisões técnicas a concluir

1. **Importador:** `linhaDeTotal`, em `apps/plataforma/src/lib/importacao/catalogo.ts`, exige uma célula começando por “Total”. Acrescentar cobertura para o layout que tenha rodapé numérico sem esse rótulo. A prévia deve distinguir totalização e cadastro inválido, registrando qualquer exclusão explicitamente. Não descartar genericamente toda linha sem SKU/nome.
2. **Transferência:** a solicitação, a separação e o envio têm efeitos distintos. A interface e o aceite precisam deixar claro quando o disponível é reservado e quando o físico é baixado. Garantir idempotência e preservação do saldo da rede, incluindo trânsito.
3. **Integrações:** o código atual mantém `ADAPTADOR_DA_META_PRONTO=false` e canal WhatsApp nulo. O adapter precisa ser entregue; cadastrar variáveis não encerra esse requisito. Aplicar a mesma distinção entre código, configuração e homologação aos demais fornecedores.
4. **Escopo:** reconciliar os pedidos recentes de checkout completo, APIs financeiras e atualização da demo com os ADRs e documentos históricos. Menus e mocks não contam como operações externas realizadas.
5. **Demonstração:** revisar dados fictícios e textos antigos de lojas e manter uma matriz de paridade das jornadas. A demo deve continuar isolada de dados/transações comerciais.
6. **Publicação:** registrar SHA, CI, versão de migrations e prova de jornada por lote. O checkpoint é documentação; a conferência independente do domínio comprova o build servido.
7. **Dependências:** explicitar que o audit de produção usa `--omit=dev`. A cadeia de desenvolvimento também precisa de acompanhamento; verificar a advisory pública [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) e atualizar com compatibilidade.

Recomendação de arquitetura: manter TypeScript/Next.js/Node.js/Supabase/PostgreSQL. Node já é utilizado. Priorizar fechamento de jornadas, contratos de dados, adapters, testes representativos e evidência de entrega; não iniciar reescrita para contornar pendências funcionais.

O diagnóstico operacional detalhado foi entregue separadamente ao proprietário. Não anexar a este comentário a planilha original nem o pacote privado de evidências.
