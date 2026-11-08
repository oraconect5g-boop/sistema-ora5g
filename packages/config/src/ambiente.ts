import { z } from "zod";

// Regras do ADR-001 e de docs/integracoes/VARIAVEIS_DE_AMBIENTE.md.
// As mensagens de erro citam so o NOME da variavel, nunca o valor.

const AMBIENTES = ["development", "homologacao", "producao"] as const;

const textoObrigatorio = z.string().trim().min(1, "obrigatória");

// Servidor só IPv4 (ADR-001): nem "localhost" (pode virar ::1) nem endereço IPv6 literal.
const hostIpv4OuNome = (valor: string) => {
  const host = new URL(valor).hostname;
  return host !== "localhost" && !host.startsWith("[") && !host.includes(":");
};

const enderecoIpv4 = textoObrigatorio
  .pipe(z.url({ protocol: /^https?$/, error: "precisa ser um endereço http(s) válido" }))
  .refine(hostIpv4OuNome, { error: "use 127.0.0.1 ou um nome de domínio; nunca localhost nem IPv6 (servidor só IPv4)" });

// Chave PÚBLICA do Supabase (REV-004): só a publishable nova ou a "anon" antiga (JWT com
// role=anon). Chave secreta, service_role ou qualquer outro formato é recusado.
function chavePublicaValida(valor: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(valor)) return true;
  const partes = valor.split(".");
  if (partes.length !== 3 || !partes.every((p) => /^[A-Za-z0-9_-]+$/.test(p))) return false;
  try {
    const base64 = partes[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const conteudo = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))) as { role?: unknown };
    return conteudo.role === "anon";
  } catch {
    return false;
  }
}

const grupoAplicacao = z.object({
  APP_ENV: z.enum(AMBIENTES, { error: `use ${AMBIENTES.join(", ")}` }),
  NEXT_PUBLIC_APP_URL: enderecoIpv4,
  APP_TIMEZONE: z.string().trim().min(1).default("America/Sao_Paulo"),
  APP_DEFAULT_CURRENCY: z.literal("BRL").default("BRL"),
});

// Login e leitura pelo RLS: só endereço e chave pública (vão para o navegador).
const grupoSupabasePublico = z.object({
  NEXT_PUBLIC_SUPABASE_URL: textoObrigatorio
    .pipe(z.url({ protocol: /^https$/, error: "precisa ser https" }))
    .refine(hostIpv4OuNome, { error: "use o nome do projeto Supabase; nunca localhost nem IPv6" }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: textoObrigatorio.refine(chavePublicaValida, {
    error: "não é uma chave pública do Supabase (publishable ou anon); chave secreta ou service_role nunca vai aqui",
  }),
});

// Só no servidor: worker, migrations e tarefas administrativas. O login não precisa delas.
const grupoSupabaseServidor = z.object({
  SUPABASE_SECRET_KEY: textoObrigatorio,
  DATABASE_URL: textoObrigatorio.refine(conexaoPeloPooler, {
    error: "use a conexão do pooler em modo sessão (porta 5432); a conexão direta é só IPv6",
  }),
});

export const GRUPOS = {
  aplicacao: grupoAplicacao,
  supabase_publico: grupoSupabasePublico,
  supabase_servidor: grupoSupabaseServidor,
} as const;

export type NomeGrupo = keyof typeof GRUPOS;

// CONFIG-001: o grupo "supabase" (endereço, chave pública, chave secreta e banco juntos) foi
// dividido em 07/11/2026 (REV-004). Sem apelido de propósito: o nome antigo exigiria a chave
// secreta e o banco só para conferir o login, que precisa apenas do grupo público.
const GRUPOS_REMOVIDOS: Readonly<Record<string, string>> = {
  supabase:
    "foi dividido em 07/11/2026. Para o login, use supabase_publico (só endereço e chave pública). " +
    "supabase_servidor (chave secreta e banco) é só para worker, scripts de banco e migrations; o login nunca precisa dele",
};

// Lê a lista de grupos do verificar-env ("aplicacao,supabase_publico"). Nome desconhecido ou
// removido vira erro explicado, nunca um grupo escolhido por aproximação.
export function lerGrupos(texto: string): { ok: true; grupos: NomeGrupo[] } | { ok: false; erros: string[] } {
  const nomes = texto.split(",").map((nome) => nome.trim()).filter(Boolean);
  if (nomes.length === 0) return { ok: false, erros: ["informe ao menos um grupo"] };
  const erros = nomes
    .filter((nome) => !Object.hasOwn(GRUPOS, nome))
    .map((nome) => `grupo ${nome}: ${Object.hasOwn(GRUPOS_REMOVIDOS, nome) ? GRUPOS_REMOVIDOS[nome] : "desconhecido"}`);
  return erros.length > 0 ? { ok: false, erros } : { ok: true, grupos: [...new Set(nomes)] as NomeGrupo[] };
}

type ConfiguracaoDe<G extends NomeGrupo> = z.output<(typeof GRUPOS)[G]>;
export type Configuracao<G extends NomeGrupo> = UniaoParaIntersecao<ConfiguracaoDe<G>>;
type UniaoParaIntersecao<U> = (U extends unknown ? (x: U) => void : never) extends (
  x: infer I,
) => void
  ? I
  : never;

export type Problema = { variavel: string; motivo: string };

export class AmbienteInvalido extends Error {
  readonly problemas: Problema[];

  constructor(problemas: Problema[]) {
    super(
      "Configuração incompleta ou inválida; o sistema não vai iniciar.\n" +
        problemas.map((p) => `  - ${p.variavel}: ${p.motivo}`).join("\n"),
    );
    this.name = "AmbienteInvalido";
    this.problemas = problemas;
  }
}

function conexaoPeloPooler(valor: string): boolean {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return false;
  }
  const protocoloOk = url.protocol === "postgresql:" || url.protocol === "postgres:";
  const pooler = url.hostname.endsWith(".pooler.supabase.com");
  const local = url.hostname === "127.0.0.1";
  const porta = url.port || "5432";
  return protocoloOk && (local || (pooler && porta === "5432"));
}

export function verificarAmbiente<G extends NomeGrupo>(
  variaveis: Record<string, string | undefined>,
  grupos: readonly G[],
): { ok: true; configuracao: Configuracao<G> } | { ok: false; problemas: Problema[] } {
  const problemas: Problema[] = [];
  const configuracao: Record<string, unknown> = {};

  for (const grupo of grupos) {
    const resultado = GRUPOS[grupo].safeParse(semVazios(variaveis));
    if (resultado.success) {
      Object.assign(configuracao, resultado.data);
      continue;
    }
    for (const erro of resultado.error.issues) {
      const variavel = String(erro.path[0] ?? grupo);
      const ausente = variaveis[variavel] === undefined || variaveis[variavel]?.trim() === "";
      problemas.push({ variavel, motivo: ausente ? "obrigatória e não definida" : erro.message });
    }
  }

  return problemas.length === 0
    ? { ok: true, configuracao: configuracao as Configuracao<G> }
    : { ok: false, problemas };
}

export function carregarAmbiente<G extends NomeGrupo>(
  variaveis: Record<string, string | undefined>,
  grupos: readonly G[],
): Configuracao<G> {
  const resultado = verificarAmbiente(variaveis, grupos);
  if (!resultado.ok) throw new AmbienteInvalido(resultado.problemas);
  return resultado.configuracao;
}

// Variavel vazia no .env ("CHAVE=") conta como nao definida.
function semVazios(variaveis: Record<string, string | undefined>) {
  return Object.fromEntries(
    Object.entries(variaveis).filter(([, valor]) => valor !== undefined && valor.trim() !== ""),
  );
}
