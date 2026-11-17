// Log de tempos das idas do servidor ao Supabase (lote VEL-a: ORA-QUAL-010; ADR-010). É ferramenta de medida e fica
// DESLIGADA no dia a dia: só escreve com ORA_MEDIR_TEMPOS=1 no ambiente do servidor. Ligada, cada ida vira uma linha:
//
//   [tempos] p41 pedido GET /vender (página inteira)
//   [tempos] c12 #1 +2ms 171ms 200 POST /rest/v1/rpc/molde_da_sessao
//   [tempos] c12 #2 +175ms 168ms 200 POST /rest/v1/rpc/pdv_tela
//
// "p41" é um pedido que passou pelo proxy; "c12" é uma tela sendo montada (ou uma ação, ou uma rota). "#2" é a ordem
// da ida dentro dela, "+175ms" é quanto depois do começo ela saiu e "168ms" é quanto demorou até a resposta começar
// a chegar. Idas em paralelo saem com o "+" quase igual; idas em fila, uma depois da outra.
//
// O que NUNCA entra na linha: o que vem depois do "?" no endereço (os filtros, que podem trazer CPF, telefone ou
// nome), cabeçalhos, corpo, token, chave, o endereço do projeto e o texto do erro. A linha é feita só do caminho,
// cortado nos primeiros trechos, e de palavras escritas aqui; do erro, nada é copiado.

type Ambiente = Readonly<Record<string, string | undefined>>;
type Meios = {
  /** De onde se lê ORA_MEDIR_TEMPOS (por padrão, o ambiente do servidor). */
  ambiente?: Ambiente;
  /** Para onde vai cada linha (por padrão, a saída do servidor). */
  escrever?: (linha: string) => void;
  /** O relógio, em milissegundos. */
  agora?: () => number;
};
type Cabecalhos = { get(nome: string): string | null };

export type MedidorDeTempos = { fetch: typeof fetch };

const CONTADOR = Symbol.for("ora5g.tempos.contador");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// O que o log diz de uma falha de rede. A conta que interessa ao lote é a primeira: o pedido que cruzou com o
// fechamento da conexão parada (ADR-010). Código que não está aqui sai só como "falhou".
const MOTIVOS_DE_REDE = new Map([
  ["UND_ERR_SOCKET", "conexão fechada"],
  ["ECONNRESET", "conexão fechada"],
  ["EPIPE", "conexão fechada"],
  ["UND_ERR_CONNECT_TIMEOUT", "sem resposta a tempo"],
  ["UND_ERR_HEADERS_TIMEOUT", "sem resposta a tempo"],
  ["UND_ERR_BODY_TIMEOUT", "sem resposta a tempo"],
  ["ETIMEDOUT", "sem resposta a tempo"],
  ["ECONNREFUSED", "conexão recusada"],
  ["ENOTFOUND", "endereço não encontrado"],
  ["EAI_AGAIN", "endereço não encontrado"],
]);

const milissegundos = (tempo: number) => Math.max(0, Math.round(tempo));
const trechosDe = (caminho: string) => caminho.split("/").filter(Boolean);

/** Identificador vira ":id" e número vira ":n"; fora isso, o trecho só passa se couber no molde dado. */
const trechoSeguro = (texto: string, molde: RegExp) => (UUID.test(texto) ? ":id" : /^\d+$/.test(texto) ? ":n" : molde.test(texto) ? texto : "…");

function metodoSeguro(metodo: unknown): string {
  const texto = typeof metodo === "string" ? metodo.toUpperCase() : "";
  return /^[A-Z]{1,10}$/.test(texto) ? texto : "?";
}

/**
 * O recurso do Supabase que um endereço pede, como pode ir para o log: só o caminho, até o terceiro trecho (o
 * serviço, a versão e a tabela ou a operação; nas funções, também o nome dela). O resto vira "/…": em arquivo
 * guardado, por exemplo, o caminho traz a pasta e o nome do arquivo.
 */
export function recursoDoEndereco(endereco: string): string {
  let trechos: string[];
  try {
    trechos = trechosDe(new URL(endereco).pathname);
  } catch {
    return "?";
  }
  const guardados = trechos[2] === "rpc" ? 4 : 3;
  const visiveis = trechos.slice(0, guardados).map((trecho) => trechoSeguro(trecho, /^[A-Za-z0-9_.-]{1,64}$/));
  return `/${visiveis.join("/")}${trechos.length > guardados ? "/…" : ""}`;
}

/**
 * Como um pedido do navegador aparece no log: o método, o caminho da tela (sem o que vem depois do "?", com os
 * identificadores trocados por ":id") e de onde veio. O proxy não enxerga se o pedido é uma troca de tela ou uma
 * leitura antecipada: o Next esconde dele esses cabeçalhos, de propósito.
 */
export function rotuloDoPedido(metodo: string, caminho: string, cabecalhos: Cabecalhos): string {
  const trechos = trechosDe(caminho);
  // Os nomes das telas são todos de letras minúsculas e hífen; qualquer outra coisa no caminho não vai para o log.
  const visiveis = trechos.slice(0, 6).map((trecho) => trechoSeguro(trecho, /^[a-z][a-z-]{0,40}$/));
  const destino = cabecalhos.get("sec-fetch-dest");
  const origem = cabecalhos.get("next-action") ? " (ação)" : destino === "document" ? " (página inteira)" : destino === "empty" ? " (dados da tela)" : "";
  return `${metodoSeguro(metodo)} /${visiveis.join("/")}${trechos.length > 6 ? "/…" : ""}${origem}`;
}

// O contador mora no globalThis: o Next pode carregar este arquivo mais de uma vez (o proxy, as telas e as ações
// ficam em pacotes separados) e, com um contador por cópia, duas telas sairiam com o mesmo número.
function proximoNumero(): number {
  const global = globalThis as unknown as Record<symbol, unknown>;
  const anterior = global[CONTADOR];
  const numero = (typeof anterior === "number" ? anterior : 0) + 1;
  global[CONTADOR] = numero;
  return numero;
}

/** O método e o recurso de uma chamada ao fetch. Nunca lança: medir não pode derrubar o pedido. */
function descricaoDaIda(entrada: unknown, opcoes: { method?: string } | undefined): string {
  try {
    const pedido = typeof entrada === "object" && entrada !== null && !(entrada instanceof URL) ? (entrada as { url?: unknown; method?: unknown }) : null;
    const endereco = pedido ? pedido.url : String(entrada);
    return `${metodoSeguro(opcoes?.method ?? pedido?.method ?? "GET")} ${typeof endereco === "string" ? recursoDoEndereco(endereco) : "?"}`;
  } catch {
    return "? ?";
  }
}

function motivoDaFalha(erro: unknown): string | undefined {
  const codigoDe = (algo: unknown) => (typeof algo === "object" && algo !== null && "code" in algo && typeof algo.code === "string" ? algo.code : undefined);
  const causa = typeof erro === "object" && erro !== null && "cause" in erro ? erro.cause : undefined;
  return MOTIVOS_DE_REDE.get(codigoDe(causa) ?? codigoDe(erro) ?? "");
}

/**
 * Um medidor: devolve o `fetch` que anota cada ida, para entregar ao cliente do Supabase. Com o log desligado
 * devolve null e o cliente usa o fetch de sempre, sem nada no caminho. A letra diz de onde é a medida ("p", o
 * proxy; "c", o cliente das telas, ações e rotas); o rótulo, quando vem, sai numa linha antes das idas.
 */
export function medidorDeTempos(letra: "c" | "p" = "c", rotulo?: () => string, meios: Meios = {}): MedidorDeTempos | null {
  if ((meios.ambiente ?? process.env)["ORA_MEDIR_TEMPOS"] !== "1") return null;
  const escrever = meios.escrever ?? ((linha: string) => console.info(linha));
  const agora = meios.agora ?? (() => performance.now());
  // Medir nunca derruba o pedido: se a linha não puder ser montada ou escrita, o pedido segue sem ela.
  const anotar = (linha: () => string) => {
    try {
      escrever(linha());
    } catch {
      // sem linha
    }
  };
  const nome = `[tempos] ${letra}${proximoNumero()}`;
  const comeco = agora();
  let idas = 0;
  if (rotulo) anotar(() => `${nome} pedido ${rotulo()}`);

  const medido: typeof fetch = async (entrada, opcoes) => {
    idas += 1;
    const ordem = idas;
    const saida = agora();
    const linha = (resultado: string) => `${nome} #${ordem} +${milissegundos(saida - comeco)}ms ${milissegundos(agora() - saida)}ms ${resultado} ${descricaoDaIda(entrada, opcoes)}`;
    let resposta: Response;
    try {
      // O fetch global é procurado na hora da chamada: vale a conexão mantida e, nos testes, o serviço simulado.
      resposta = await fetch(entrada, opcoes);
    } catch (erro) {
      anotar(() => {
        const motivo = motivoDaFalha(erro);
        return linha(motivo ? `falhou (${motivo})` : "falhou");
      });
      throw erro;
    }
    anotar(() => linha(String(resposta.status)));
    return resposta;
  };
  return { fetch: medido };
}
