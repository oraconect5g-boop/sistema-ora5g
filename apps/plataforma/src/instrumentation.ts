// Roda uma vez quando o servidor inicia: sem configuracao completa, o sistema nao sobe (ORA-003).
// O processo encerra com erro (em vez de ficar no ar sem atender) para o systemd e o deploy perceberem.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { carregarAmbiente } = await import("@ora5g/config/ambiente");
  try {
    carregarAmbiente(process.env, ["aplicacao"]);
  } catch (erro) {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exit(1);
  }
}
