// #99 (diagnóstico de 15/11/2026): a identidade da versão no ar, lida no servidor. O conferidor da publicação
// (deploy/homologacao/conferir-publicacao.sh) e a publicação (publicar.sh) comparam o commit inteiro e o ambiente;
// sem eles, a versão é dada como não conferida (nunca como certa).
import pacote from "../../package.json";

export type IdentidadeDaVersao = { commit: string; versao: string; build: string; ambiente: string };

/**
 * Os valores vêm de quem chama, escritos por extenso (process.env.ORA_COMMIT_COMPLETO): o Next grava o commit e a hora
 * na build trocando o texto exato; o ambiente (APP_ENV) é lido na hora, do arquivo da versão publicada.
 */
export function identidadeDaVersao(ambiente: Record<string, string | undefined>): IdentidadeDaVersao {
  const commit = ambiente.ORA_COMMIT_COMPLETO ?? "";
  return {
    commit: /^[0-9a-f]{40}$/.test(commit) ? commit : "",
    versao: pacote.version,
    build: ambiente.NEXT_PUBLIC_ORA_BUILD ?? "",
    ambiente: ambiente.APP_ENV ?? "",
  };
}
