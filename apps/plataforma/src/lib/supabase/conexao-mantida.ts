// A conexão do servidor com o Supabase fica aberta entre um pedido e outro (lote VEL-a: ORA-QUAL-010; ADR-010).
// O fetch do Node fecha a conexão que ficou 4 s parada. A tela seguinte abria outra, e abrir custa cerca de 0,26 s
// a mais do que reaproveitar (endereço, conexão e TLS: docs/operacao/DESEMPENHO_NO_CELULAR.md, seções 4.2 e 4.4).
// Aqui o limite sobe para CONEXAO_PARADA_MS.
//
// O Supabase não diz por quanto tempo guarda a conexão (não manda "Keep-Alive: timeout"); nas medidas de 16/11
// fechou a conexão parada aos 400 s, nas nove vezes. Quando o outro lado fecha antes de nós, o Node percebe e
// abre outra no pedido seguinte; só falha o pedido que cruza com o fechamento no caminho (o Node não repete).
// Por isso o nosso limite fica bem abaixo do deles.
//
// O Next não escolhe o despachante do fetch (só os agentes de http e https), então trocar o global vale para
// todo fetch do servidor. A classe vem do despachante que o próprio Node criou: o pacote "undici" não é
// dependência do projeto.
const DESPACHANTE_GLOBAL = Symbol.for("undici.globalDispatcher.1");

/** Quanto tempo a conexão parada fica aberta: menos da metade dos 400 s em que o Supabase fecha a dele. */
export const CONEXAO_PARADA_MS = 180_000;

type ClasseDoDespachante = new (opcoes: { keepAliveTimeout: number; keepAliveMaxTimeout: number }) => object;

/**
 * Troca o despachante global do fetch por outro da mesma classe, que mantém a conexão parada aberta por `ms`.
 * Devolve false, sem mexer em nada, quando o Node não tem o despachante que conhecemos: o sistema funciona
 * igual, só volta a abrir uma conexão a cada tela. Nunca lança.
 */
export async function manterConexoesAbertas(ms: number = CONEXAO_PARADA_MS): Promise<boolean> {
  try {
    // O despachante global só existe depois do primeiro fetch; "data:" não vai à rede.
    await (await fetch("data:,")).arrayBuffer();
    const global = globalThis as unknown as Record<symbol, unknown>;
    const atual = global[DESPACHANTE_GLOBAL];
    const Classe: unknown = typeof atual === "object" && atual !== null ? atual.constructor : undefined;
    if (typeof Classe !== "function" || Classe.name !== "Agent") return false;
    // O teto (keepAliveMaxTimeout) vale se um dia o outro lado passar a sugerir um tempo maior que o nosso.
    global[DESPACHANTE_GLOBAL] = new (Classe as ClasseDoDespachante)({ keepAliveTimeout: ms, keepAliveMaxTimeout: ms });
    return true;
  } catch {
    return false;
  }
}
