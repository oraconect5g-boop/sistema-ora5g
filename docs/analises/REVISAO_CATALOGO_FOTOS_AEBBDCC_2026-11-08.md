# Conferência do catálogo real e fotos — aebbdcc — 08/11/2026

**Base:** `aebbdcc82b3f5de800d41200674fd6910a23c855`. **Comparação com 55d10af:** sete commits e 21 caminhos, incluindo merges. **Revisor:** Codex. **Stack preservada:** TypeScript/React/Next.js/Node.js/PostgreSQL/Supabase.

Esta entrega entrou depois da [rodada por setor](TESTES_E_ANALISE_POR_SETOR_2026-11-08.md), que fixava 55d10af. As observações anteriores de fotos “ainda fora da main” eram válidas naquele corte; agora o código está publicado. Não foi feita implantação nem operação real de Storage pelo Codex.

## 1. O que o Claude implementou

| Área | Implementação / conferência |
|---|---|
| Banco e Storage | Nona migration `20261108204536_fotos_dos_produtos`: bucket privado, JPEG/PNG/WebP, 5 MiB, tabela de fotos, arquivo por caminho estável, histórico de substituição, auditoria e pendências |
| Autorização | Leitura por organização com vínculo vigente; envio por `catalogo.fotos` (dono/gerente), conferido novamente na RPC; vendedor só vê; anon sem RPC |
| Produto / variante | Caminho e associação ao produto/variante validados; foto real em físico, ilustração permitida em item não físico; duas cores exigem fotos próprias |
| Frontend real | `/catalogo` protegido por sessão/loja, consulta ao banco, miniatura/ampliação e pendências; entrada de foto pelo arquivo/câmera, prévia e redução local |
| Arquivo / exibição | Lado maior limitado a 1600 px, validação do lado mínimo, WebP com fallback JPEG; links assinados de uma hora produzidos no servidor |
| Tipagem / dinheiro | Tipos regenerados e helper que recusa inteiros fora da faixa segura; catálogo usa validação para contagens |
| Integração de navegação | Atalho em /inicio e proxy SSR cobrindo /catalogo |
| Documentação e testes | Estado/fila/status atualizados; testes de fotos no domínio da aplicação e banco, incluindo RLS e histórico; reversão local |

O catálogo real não envia custo/margem nessa consulta e usa a sessão da pessoa para assinar URLs. A foto anterior só é substituída dentro da transação de registro. São acertos a preservar.

Ainda não é o PDV real completo, nem comprova a exibição de fotos em todas as buscas, estoque e comprovantes previstos na ORA-CAT-011. Homologação física da câmera/galeria e operação autenticada ponta a ponta continuam pendentes.

## 2. Verificação executada

- [CI da main aebbdcc](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/42535268839): **sucesso**.
- Suíte existente nessa base, local: **407 testes passaram, 4 TODO**. Plataforma 114, worker 4, banco 154 (+4 TODO), configuração 53, domínio 82.
- Lint da entrega passou. A combinação da nova main com os testes/documentos do PR #33 recebeu verificação de tipos e deve passar pelo CI do novo head.
- Testes adicionais específicos: **17 casos, oito passaram e nove reproduziram defeitos**, agrupados em quatro causas funcionais.
- Busca: três casos com página real e API simulada (um controle verde, duas falhas).
- Componentes: seis cenários em dois viewports (360/1280), React e componentes reais; somente Storage, registro e router são simulados (seis verdes, seis falhas).
- Banco: duas provas locais; uma confirmou índice existente e outra reproduziu repetição não idempotente do registro.
- Dependências: análise completa do npm audit; produção continua sem alerta no audit do CI, mas há um advisory propagado na árvore de desenvolvimento.

As provas ficam em [evidencias/2026-11-08-fotos](evidencias/2026-11-08-fotos/LEIA-ME.md), fora da descoberta normal do CI. A fixture usa o Vite já instalado pela ferramenta de testes somente para montar os componentes em localhost; **não altera o framework do produto**, não cria rota de aplicação e não usa credencial real.

## 3. Novos achados

| ID / issue | Gravidade e local | Prova / aceite necessário |
|---|---|---|
| REV-038 / [#40](https://github.com/oraconect5g-boop/sistema-ora5g/issues/40) | P2, catalogo/page.tsx:34 e filtro posterior | Produtos limitados a 200 antes da busca. Com 201, o último não aparece pelo nome nem pelo SKU, embora a UI mande usar a busca. Filtrar no banco antes de limitar e paginar produtos/variantes/fotos/saldos sem converter truncamento em ausência |
| REV-039 / [#41](https://github.com/oraconect5g-boop/sistema-ora5g/issues/41) | P2, FotoAmpliavel.tsx:11 | Erro de imagem deixa quebrada=true para sempre naquele componente; URL nova e válida não recupera a foto. Reproduzido nos dois tamanhos; imagem válida inicial funciona. Associar erro à URL que falhou e recuperar na troca/renovação |
| REV-040 / [#42](https://github.com/oraconect5g-boop/sistema-ora5g/issues/42) | P2, EnviarFoto.tsx:53 e RPC registrar_foto | Falha de registro após upload confirmado leva a outro upload com novo UUID ao tentar novamente (dois objetos simulados). No banco, repetir o mesmo caminho já confirmado retorna 23505. Manter identidade estável, reconsultar/registrar idempotentemente e prever limpeza segura de órfãos |
| REV-041 / [#43](https://github.com/oraconect5g-boop/sistema-ora5g/issues/43) | P2, EnviarFoto.tsx:88 | Descartar remove a prévia, mas input.value continua com o arquivo. Isso prejudica seleção nativa repetida do mesmo arquivo em navegadores que não emitem change sem mudança. Limpar o input no momento adequado; preservar Blob necessário e limpar recursos |
| REV-042 / [#44](https://github.com/oraconect5g-boop/sistema-ora5g/issues/44) | P2, dependências de desenvolvimento | minimatch 10.2.6 na cadeia TypeScript-ESLint gera oito alertas moderados derivados de um advisory. Avaliar correção compatível; não executar fix --force ou downgrade do Next para silenciar o relatório |

Os quatro primeiros são defeitos novos identificados no lote de fotos; o alerta de dependência é anterior a esse lote. As três P1 de equipe #27–#29 continuam tendo prioridade superior. As issues anteriores não foram corrigidas por adicionar fotos.

Limites das provas: a seleção de arquivo foi exercitada em Chromium com viewport móvel, não em um seletor de câmera Android/iOS real. O teste de descarte comprova que o input retém o arquivo; não afirma que todos os navegadores se comportam igualmente ao selecionar o mesmo arquivo. O teste de retry comprova as chamadas/identidades geradas pelo componente e o comportamento SQL local, sem alegar arquivos órfãos em Storage remoto.

## 4. Advisor de índice: não criar duplicata por automatismo

A rodada anterior registrou o aviso INFO da Supabase sobre a FK de fotos por produto/organização, com a recomendação de conferir. A fonte publicada mostra o índice completo `fotos_organizacao (organizacao_id, produto_id)`, em ordem inversa à declaração da FK.

Uma prova local de EXPLAIN mostrou **Index Scan usando fotos_organizacao com as duas condições de igualdade**. Logo, o aviso não demonstra ausência de índice capaz de atender esse acesso. **Não criar outro índice apenas para apagar esse INFO.**

O experimento desabilitou seqscan apenas no banco descartável para demonstrar capacidade; não é medição de desempenho em carga nem recomendação para alterar o planner em produção. A escolha ótima e outros filtros devem ser avaliados com volume representativo. Os índices “sem uso” continuam sem justificativa automática para remoção.

## 5. Dependências: risco e atualização compatível

O audit completo aponta oito moderados na cadeia de desenvolvimento: minimatch → typescript-estree → utilitários/parser/plugins TypeScript-ESLint → eslint-config-next. O pacote afetado é minimatch 10.2.6; a outra instalação 3.1.5 não é a apontada por esse advisory.

[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) descreve amplificação de processamento de globs, com faixa afetada >=7 e <11.0.1. Não foi demonstrada exploração. O audit de produção no CI retorna zero vulnerabilidades; não confundir os oito efeitos transitivos com oito falhas independentes da aplicação.

O fix automático propõe eslint-config-next 15.5.29 como mudança major, enquanto o projeto usa Next 16.4.5. Isso não é uma atualização segura a aplicar sem análise. Claude deve avaliar atualização oficial compatível ou override comprovado em branch, preservar Node/TypeScript/Next e validar instalação limpa + CI. Não foi alterado package.json/lockfile nesta revisão.

## 6. Aceite antes de encerrar fotos

1. Corrigir #40–#43 e converter as reproduções em regressões.
2. Testar busca/paginação acima dos limites e coerência das pendências, por organização e loja.
3. Validar a recuperação de URL, imagem quebrada, troca de foto e erro parcial de assinatura.
4. Provar upload confirmado com registro que falha, resposta perdida, retry e concorrência, preservando foto anterior e evitando múltiplos efeitos/órfãos.
5. Homologar câmera/galeria, descarte/reseleção, redimensionamento e orientação em aparelhos reais.
6. Com usuário autorizado, testar login → catálogo → upload → registro → assinatura → exibição, inclusive vendedor sem escrita e tentativa cruzada de organização.
7. Completar os pontos previstos no catálogo, busca, estoque e PDV, sem declarar toda ORA-CAT-011 entregue pela tela /catalogo.
8. Manter as regras físicas/financeiras e o núcleo real de vendas/pagamentos/Connect como prioridade do projeto. Foto não substitui confirmação oficial Nogle ou conciliação.

#26 permanece aberta para essa entrega completa. Migrations aplicadas ficam imutáveis. Claude implementa; Codex revisa evidências; proprietário homologa e autoriza publicação crítica.

