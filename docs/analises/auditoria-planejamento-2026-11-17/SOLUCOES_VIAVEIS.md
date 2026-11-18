# Soluções viáveis para avaliação do proprietário

São propostas de desenho para acelerar a conclusão usando a stack atual. Não foram aplicadas ao app nem ao banco e não substituem revisão/testes do contrato existente.

## 1. Tratar o rodapé sem esconder erro de produto

O erro atual é exigir o texto “Total” no rodapé numérico do relatório fornecido. Uma alternativa é separar **detecção de candidato** e **decisão de exclusão**. O detector só apresenta o candidato; a prévia registra o motivo e a confirmação. Linhas intermediárias sem código continuam sendo erros visíveis.

```ts
type Celula = string;
type LinhaOriginal = { numero: number; valores: readonly Celula[] };
type LayoutConferido = {
  sku: number;
  nome: number;
  colunasDeAgregados: readonly number[];
};

function candidatoARodape(
  linhas: readonly LinhaOriginal[],
  layout: LayoutConferido,
): { numero: number; motivo: string } | null {
  const ultima = linhas.at(-1);
  if (!ultima) return null;
  const valor = (coluna: number) => (ultima.valores[coluna] ?? "").trim();
  if (valor(layout.sku) || valor(layout.nome)) return null;

  // Só propõe revisão do rodapé do layout previamente conferido.
  // Não apaga a linha nem tenta interpretar valores fiscais/monetários.
  const temAgregados = layout.colunasDeAgregados.some(c => valor(c) !== "");
  return temAgregados
    ? { numero: ultima.numero, motivo: "Possível rodapé: conferir antes de excluir" }
    : null;
}
```

Para produção, ainda são necessários validação do layout e do mapeamento, reconhecimento do formato numérico, decisão explícita persistida, identificação do arquivo e teste de produto inválido no final para não excluí-lo por engano. O usuário vê “linha 2273 excluída por totalização” e a prévia mantém a trilha. Isso é mais seguro que alterar genericamente o leitor para ignorar todo cadastro incompleto.

## 2. Uma prévia de estoque por loja com origem rastreável

Uma estrutura TypeScript pode preservar físico e disponível sem confundi-los. O identificador da linha deve ser derivado de origem imutável, não de preço ou nome que alguém pode editar.

```ts
type SaldoImportado = {
  arquivoSha256: string;
  corteEm: string;
  linhaOriginal: number;
  codigoOrigem: string;
  codigoLocalOrigem: string;
  fisico: number;
  disponivel: number;
};

type ParecerSaldo =
  | { estado: "conferir"; motivos: string[] }
  | { estado: "elegivel_para_previa"; diferencaDisponivel: number };

function conferirSaldo(s: SaldoImportado): ParecerSaldo {
  const motivos: string[] = [];
  if (!Number.isSafeInteger(s.fisico) || !Number.isSafeInteger(s.disponivel)) {
    motivos.push("Quantidade incompatível com produto contado por unidade");
  }
  if (s.fisico < 0 || s.disponivel < 0) motivos.push("Saldo negativo na origem");
  if (s.disponivel > s.fisico) motivos.push("Disponível maior que físico");
  return motivos.length
    ? { estado: "conferir", motivos }
    : { estado: "elegivel_para_previa", diferencaDisponivel: s.fisico - s.disponivel };
}
```

Esse exemplo **não grava estoque**. A diferença não deve virar automaticamente uma reserva de transferência: o relatório pode misturar causas e não traz necessariamente a identificação de cada pendência. Antes de gravar, o contrato precisa de organização/local/variante, unidade de medida, serial quando aplicável, data de corte, reconciliação posterior, permissão e uma chave única no banco. A aplicação deve usar o livro de movimentos existente, com transação e reversão compensatória, e não atualizar saldos diretamente.

O mesmo preparo atende catálogo, lojas e inventário, evitando três importadores independentes que discordam entre si.

## 3. Contrato explícito de disponibilidade

```ts
type EstadoEstoque = {
  fisico: number;
  reservado: number;
  emTransitoSaindo: number;
  emTransitoChegando: number;
};

const disponivel = (e: EstadoEstoque) => e.fisico - e.reservado;
```

Na implementação atual, a saída em trânsito já baixou o físico na origem. Portanto, subtrair `emTransitoSaindo` novamente de `fisico - reservado` causaria dupla redução. Os números de trânsito são informativos e fazem parte da reconciliação da rede, não uma dedução extra aplicada cegamente à loja.

Se for desejada reserva já na confirmação da transferência, a aceitação e a reserva precisam acontecer no banco em uma única transação, sob as mesmas travas usadas por venda/reserva. Para aparelhos/chips, a identificação física continua necessária. Essa mudança deve reaproveitar as funções existentes e sua idempotência; criar uma segunda contabilidade no frontend aumentaria o risco.

## 4. Integrações no worker TypeScript existente

Reutilizar o worker, os estados e o livro existentes costuma ser mais rápido que criar outro servidor. Um contrato de resultado deve distinguir falha conhecida de resultado desconhecido após timeout:

```ts
type ResultadoExterno =
  | { estado: "confirmado"; referencia: string; evidencia: string }
  | { estado: "recusado"; codigo: string }
  | { estado: "pendente"; referencia?: string }
  | { estado: "desconhecido"; consultarAntesDeRepetir: true };

interface AdaptadorExterno<Pedido> {
  enviar(pedido: Pedido, chaveIdempotente: string): Promise<ResultadoExterno>;
  consultar(referencia: string): Promise<ResultadoExterno>;
}
```

É apenas um formato de contrato; não inventa capacidades que o fornecedor não oferece. Se a API não aceitar chave idempotente ou não permitir consulta pela referência, o adapter deve explicitar a limitação e usar a proteção suportada. Não retentar cegamente pagamentos/ativações. Cada fornecedor mantém autenticação, mapeamento e validação próprios; a camada comum cuida de persistência, fila, retries seguros e observabilidade.

## 5. Visibilidade das entregas sem painel manual enganoso

Reaproveitar `/saude/versao` e `/entregas`. O pipeline pode produzir um manifesto contendo SHA, data, migration esperada, lote, CI e links de jornadas. A aplicação exibe a versão embutida no build; uma conferência externa compara o domínio com o commit esperado. Um checkpoint escrito no Git não deve se autoatribuir “publicado” antes desse confronto.

Para a demo, uma matriz de paridade associa cada jornada real à simulação correspondente, com dados fictícios e estados de erro/pendência. O teste de paridade verifica links/nomes/fluxos relevantes; não exige que dados comerciais vazem para a demo.

## 6. Node ou outra linguagem

Node.js já executa a aplicação e o worker; TypeScript é a linguagem do projeto e PostgreSQL executa as regras transacionais. Trocar para outra linguagem exigiria reescrever contratos, testes, autenticação, deployment e observabilidade. Os bloqueios encontrados — rodapé do arquivo, carga, perfis, contratos externos, configuração e homologação — continuariam existindo.

O caminho com maior probabilidade de reduzir tempo é concluir uma jornada por lote, reutilizar componentes/RPCs/worker, adicionar apenas testes de comportamento relevantes e provar a publicação no domínio. Não há evidência nesta auditoria que justifique reescrita por ganho de prazo.
