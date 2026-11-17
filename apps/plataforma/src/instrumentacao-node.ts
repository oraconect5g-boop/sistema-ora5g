import type { NomeGrupo } from "@ora5g/config/ambiente";

// Sem configuração completa, o processo encerra com erro (em vez de ficar no ar sem atender)
// para o systemd, o cron de reinício e o deploy perceberem.
// Se o login estiver configurado (qualquer variável pública do Supabase presente), ele também
// é validado: chave privilegiada no campo público impede o sistema de subir (REV-004).
export async function validarAmbienteOuEncerrar() {
  const { carregarAmbiente } = await import("@ora5g/config/ambiente");
  const ambiente = process.env;
  const grupos: NomeGrupo[] = ["aplicacao"];
  if (ambiente["NEXT_PUBLIC_SUPABASE_URL"]?.trim() || ambiente["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]?.trim()) {
    grupos.push("supabase_publico");
  }
  try {
    carregarAmbiente(ambiente, grupos);
  } catch (erro) {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exit(1);
  }
}

const SEM_CONEXAO_MANTIDA = "conexão com o banco: não foi possível manter aberta; cada pedido volta a abrir a sua";

// A conexão do servidor com o Supabase fica aberta entre um pedido e outro (lote VEL-a: ORA-QUAL-010; ADR-010).
// É só ganho de tempo: se não der para ligar, o servidor sobe do mesmo jeito. Uma linha na saída diz o que valeu,
// para quem lê o log da homologação saber em qual das duas situações o servidor está.
export async function manterConexaoComOBanco() {
  try {
    const { CONEXAO_PARADA_MS, manterConexoesAbertas } = await import("./lib/supabase/conexao-mantida");
    if (await manterConexoesAbertas()) console.info(`conexão com o banco: fica aberta por até ${CONEXAO_PARADA_MS / 1000} s parada`);
    else console.warn(SEM_CONEXAO_MANTIDA);
  } catch {
    console.warn(SEM_CONEXAO_MANTIDA);
  }
}
