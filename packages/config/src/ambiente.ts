import { z } from "zod";

// Regras do ADR-001 e de docs/integracoes/VARIAVEIS_DE_AMBIENTE.md.
// As mensagens de erro citam so o NOME da variavel, nunca o valor.

const AMBIENTES = ["development", "homologacao", "producao"] as const;

const textoObrigatorio = z.string().trim().min(1, "obrigatória");

const enderecoIpv4 = textoObrigatorio
  .pipe(z.url({ protocol: /^https?$/, error: "precisa ser um endereço http(s) válido" }))
  .refine((valor) => new URL(valor).hostname !== "localhost", {
    error: "use 127.0.0.1, nunca localhost (servidor só IPv4)",
  });

const grupoAplicacao = z.object({
  APP_ENV: z.enum(AMBIENTES, { error: `use ${AMBIENTES.join(", ")}` }),
  NEXT_PUBLIC_APP_URL: enderecoIpv4,
  APP_TIMEZONE: z.string().trim().min(1).default("America/Sao_Paulo"),
  APP_DEFAULT_CURRENCY: z.literal("BRL").default("BRL"),
});

const grupoSupabase = z.object({
  NEXT_PUBLIC_SUPABASE_URL: textoObrigatorio.pipe(
    z.url({ protocol: /^https$/, error: "precisa ser https" }),
  ),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: textoObrigatorio.refine(
    (valor) => !valor.startsWith("sb_secret_"),
    { error: "recebeu uma chave SECRETA; aqui vai só a chave pública (publishable)" },
  ),
  SUPABASE_SECRET_KEY: textoObrigatorio,
  DATABASE_URL: textoObrigatorio.refine(conexaoPeloPooler, {
    error: "use a conexão do pooler em modo sessão (porta 5432); a conexão direta é só IPv6",
  }),
});

export const GRUPOS = {
  aplicacao: grupoAplicacao,
  supabase: grupoSupabase,
} as const;

export type NomeGrupo = keyof typeof GRUPOS;

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
