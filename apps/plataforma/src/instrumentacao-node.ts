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
