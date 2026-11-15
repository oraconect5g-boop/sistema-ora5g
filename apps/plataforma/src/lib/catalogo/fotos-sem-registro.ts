// As fotos enviadas sem registro (lote CAT-011b: ORA-CAT-011): o arquivo que foi ao Storage e nunca virou foto do
// produto (o celular perdeu a rede, a pessoa desistiu, o banco recusou). A lista e a regra são do banco
// (public.fotos_sem_registro e a política de apagar do Storage: packages/banco/src/limpeza-das-fotos.test.ts). Sem a
// função no banco, nada aparece; outra falha é falha.
import type { obterSessao } from "../acesso/sessao";
import type { Leitura } from "../leitura-do-banco";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];
const FUNCAO_AUSENTE = new Set(["PGRST202", "42883"]);

export type FotosSemRegistro = { quantos: number; bytes: number; caminhos: string[] };
/** De quantos em quantos o Storage apaga. */
export const APAGAR_DE_CADA_VEZ = 100;

export const AVISOS_DA_LIMPEZA = {
  nada: { tom: "info", texto: "Nada a limpar: nenhum arquivo sem registro." },
  permissao: { tom: "perigo", texto: "Só quem envia fotos do catálogo limpa os arquivos sem registro." },
  falha: { tom: "perigo", texto: "Não deu para limpar agora. Nada foi apagado; tente de novo em instantes." },
} as const;
export type AvisoDaLimpeza = keyof typeof AVISOS_DA_LIMPEZA;

const ehInteiro = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

/** A lista do banco: quantos, o tamanho e os caminhos (até 500, os mais antigos). Nulo: o banco ainda não tem a função. */
export async function lerFotosSemRegistro(supabase: Cliente): Promise<Leitura<FotosSemRegistro> | null> {
  const r = await supabase.rpc("fotos_sem_registro");
  if (r.error) {
    if (FUNCAO_AUSENTE.has(r.error.code)) return null;
    console.error("catálogo: falha ao listar as fotos sem registro", { codigo: r.error.code || null });
    return { estado: "falha" };
  }
  const d = r.data as { quantos?: unknown; bytes?: unknown; arquivos?: unknown } | null;
  const arquivos = Array.isArray(d?.arquivos) ? (d.arquivos as { caminho?: unknown }[]) : null;
  if (!d || !ehInteiro(d.quantos) || !ehInteiro(d.bytes) || !arquivos || !arquivos.every((a) => typeof a?.caminho === "string")) {
    console.error("catálogo: lista das fotos sem registro em forma inesperada");
    return { estado: "falha" };
  }
  return { estado: "ok", dados: { quantos: d.quantos, bytes: d.bytes, caminhos: arquivos.map((a) => a.caminho as string) } };
}

/** "850 KB", "12,4 MB". */
export const tamanhoDosArquivos = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
