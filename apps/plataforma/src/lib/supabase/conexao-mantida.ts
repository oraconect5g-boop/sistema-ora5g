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

// As conexões aquecidas (lote VEL-f: ORA-QUAL-010; ADR-010, "O que veio no VEL-f"). Manter a conexão aberta não basta
// quando uma tela faz várias idas ao mesmo tempo: cada ida usa uma conexão, e a que não acha uma aberta abre outra no
// meio da tela, o que custa cerca de 0,26 s a mais (a conexão e o TLS, a 0,124 s do banco). Medido em 19/11: na mesma
// abertura dos Relatórios, as idas com conexão aberta levavam de 0,18 a 0,21 s, e as que abriam conexão, de 0,50 a
// 0,60 s; a tela espera a mais lenta. Com pouco movimento, as conexões paradas se fecham e toda tela paga isso.
// Aqui, um conjunto de conexões é aberto ao subir e usado de novo de tempos em tempos, com um pedido leve à saúde do
// serviço de login (107 bytes, com a chave pública, sem dado de ninguém).

/** Quantas conexões ficam aquecidas: a tela com mais idas ao mesmo tempo (a Saúde da operação) faz 17, mais o sino. */
export const CONEXOES_AQUECIDAS = 20;
/** De quanto em quanto tempo as conexões são usadas de novo: abaixo dos CONEXAO_PARADA_MS em que a parada se fecha. */
export const AQUECER_A_CADA_MS = 120_000;
/** Quanto um pedido do aquecimento espera a resposta antes de desistir. */
const PRAZO_DO_AQUECIMENTO_MS = 10_000;

/**
 * Pede ao mesmo tempo, `quantas` vezes, a saúde do serviço de login do Supabase: cada pedido ocupa uma conexão, e as
 * que faltam são abertas agora, e não no meio da tela de alguém. Devolve quantos pedidos responderam com sucesso.
 * Nunca lança: sem o Supabase, o servidor segue igual.
 */
export async function aquecerConexoes(endereco: string, chavePublica: string, quantas: number = CONEXOES_AQUECIDAS): Promise<number> {
  const alvo = `${endereco.replace(/\/+$/, "")}/auth/v1/health`;
  const respostas = await Promise.allSettled(Array.from({ length: Math.max(0, Math.floor(quantas)) }, async () => {
    const resposta = await fetch(alvo, { headers: { apikey: chavePublica }, cache: "no-store", signal: AbortSignal.timeout(PRAZO_DO_AQUECIMENTO_MS) });
    await resposta.arrayBuffer();
    return resposta.ok;
  }));
  return respostas.filter((r) => r.status === "fulfilled" && r.value).length;
}

/**
 * Aquece as conexões agora e de `aCadaMs` em `aCadaMs`. O relógio não segura o processo (unref): o servidor desliga
 * normalmente. Devolve o resultado do primeiro aquecimento e a função que para o relógio.
 */
export function manterConexoesAquecidas(
  endereco: string, chavePublica: string, opcoes: { quantas?: number; aCadaMs?: number } = {},
): { primeira: Promise<number>; parar: () => void; relogio: ReturnType<typeof setInterval> } {
  const quantas = opcoes.quantas ?? CONEXOES_AQUECIDAS;
  const aquecer = () => aquecerConexoes(endereco, chavePublica, quantas);
  const relogio = setInterval(() => void aquecer(), opcoes.aCadaMs ?? AQUECER_A_CADA_MS);
  relogio.unref();
  return { primeira: aquecer(), parar: () => clearInterval(relogio), relogio };
}
