# Soluções viáveis para avaliação do proprietário

Estas propostas não foram aplicadas ao aplicativo ou banco. Atendem ao pedido de mostrar alternativas com código antes de determinar sua adoção. O Claude deve avaliar o encaixe no código existente; não são um patch pronto para copiar.

## 1. Preservar a origem do número ao ler uma planilha

O defeito F18-01 acontece porque o tipo numérico do XLSX vira texto e um segundo parser aplica convenção de milhar brasileira. Uma alternativa é preservar a origem da célula até a validação de quantidade:

```ts
type CelulaDeQuantidade =
  | { origem: "xlsx-numerico"; valor: number }
  | { origem: "texto"; texto: string; formato: "pt-BR" | "decimal-ponto" };

type QuantidadeValidada =
  | { estado: "valida"; quantidade: number }
  | { estado: "conferir"; motivo: string };

function validarQuantidadeNumerica(valor: number): QuantidadeValidada {
  if (!Number.isSafeInteger(valor) || valor < 0 || valor > 9_999_999) {
    return { estado: "conferir", motivo: "Quantidade fora do formato permitido" };
  }
  return { estado: "valida", quantidade: valor };
}
```

Neste desenho, a célula numérica `0.625` vai diretamente para conferência, enquanto uma célula textual `"1.234"` depende do formato explicitamente escolhido. O ramo textual precisa de parser estrito e testes; o exemplo acima não o implementa. Célula vazia precisa continuar distinguível de zero.

**Alternativa de menor impacto:** transportar um mapa de tipos/formatos ao lado de `Planilha.linhas`, preservando o formato atual para os demais importadores. Outra opção é normalizar a representação textual apenas na entrada numérica do XLSX. Avaliar todos os consumidores antes de escolher; uma mudança global de `numeroDoRodape` pode quebrar CSV válido.

## 2. Tratar rodapé como classificação com evidência

Em vez de exclusão binária pelo conteúdo numérico da última linha, o resultado pode distinguir confirmação e ambiguidade:

```ts
type ClassificacaoDeLinha =
  | { tipo: "produto" }
  | { tipo: "rodape-confirmado"; evidencias: string[] }
  | { tipo: "revisao-necessaria"; motivos: string[] };

function candidatoSemIdentificacao(
  temSku: boolean,
  temNome: boolean,
  temEan: boolean,
  temRotuloTotal: boolean,
): ClassificacaoDeLinha {
  if (temSku || temNome) return { tipo: "produto" };
  if (temEan) return { tipo: "revisao-necessaria", motivos: ["EAN sem SKU/nome"] };
  if (temRotuloTotal) return { tipo: "rodape-confirmado", evidencias: ["rótulo explícito"] };
  return { tipo: "revisao-necessaria", motivos: ["última linha sem identificação"] };
}
```

Esse exemplo demonstra a separação de estados, não substitui a função atual: não cobre “Total” na coluna nome, colunas não mapeadas, contexto da última linha nem todas as somas. A versão completa deve guardar a decisão da revisão, linha original e motivo, permitir correção e manter os 2.271 produtos do arquivo original.

## 3. Reconciliação de estoque antes da disponibilidade comercial

Uma carga histórica precisa de duas etapas conceituais: reconhecer a posição da origem e reconciliar o que pode estar disponível hoje. Para físico 10/disponível 8, não assumir nem dez vendáveis nem duas reservas reais sem evidência. Opções:

| Opção | Vantagem | Custo/limite |
|---|---|---|
| Bloquear a linha para conferência | Pequena alteração, evita disponibilidade indevida | Exige resolução assistida |
| Quarentena de saldo com motivo | Permite reconhecer físico sem liberá-lo para venda | Novo estado e impacto nos agregados/concorrência |
| Reconstruir reservas/transferências da origem | Preserva semântica operacional quando há evidência | Exige arquivo detalhado/identificadores; não é possível inferir da diferença sozinha |

Não implementar subtração paralela no front-end. Usar o escritor transacional e o livro de movimentos existentes, com idempotência e reversão. A escolha deve ser registrada com os critérios de reconciliação.

## 4. Publicação verificável sem defasagem confusa

A `/saude/versao` já fornece o SHA do build. Ela deve identificar a versão servida; a lista de entregas deve identificar requisitos e validações. Um esquema simples de relatório de publicação pode registrar:

```ts
type EvidenciaDePublicacao = {
  commitEsperado: string;
  commitObservado: string;
  ambiente: "homologacao" | "producao";
  conferidoEm: string;
  rotas: Array<{ caminho: string; status: number; fluxoValidado: boolean }>;
};
```

HTTP 200 sozinho não valida o fluxo: `fluxoValidado` exige teste correspondente, por exemplo uma venda de teste permitida. O registro deve vir do deploy/check real, não de um SHA fixo inventado no front-end. Não alterar a autorização de produção ou usar o campo `ambiente` como prova de homologação.

## 5. Ganho de prazo sem trocar linguagem

O projeto **já usa Node.js**; Node não é uma linguagem alternativa ao TypeScript. As opções com melhor relação entre prazo e risco são fechar a carga e os perfis, implementar integrações no worker existente, reutilizar as RPCs transacionais, manter contratos tipados por provedor e testar os casos de falha/duplicidade antes de ligar o serviço.

Adicionar outro backend agora criaria autenticação, deploy, observabilidade e sincronização adicionais. Só avaliar outro runtime/serviço se um requisito medido o exigir. Nesta auditoria, não apareceu uma limitação de linguagem que explique os itens faltantes.
