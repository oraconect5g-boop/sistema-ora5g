// Reprodução observacional do REV-PROMPT-003. Passar confirma o defeito no SHA auditado.
// A e B são dois usuários fictícios na mesma loja/aba. Nada acessa uma conta real.
import { expect, it } from "vitest";
import { appendFileSync } from "node:fs";
import { lembrancaDoSino, lembrar } from "../../../../apps/plataforma/src/lib/inicio/sino";

it("a lembrança do dono continua legível após a troca de usuário na mesma loja", () => {
  const unidade = "11000000-0000-4000-8000-000000000001";
  const agora = 1_000_000;
  const itensDoDono = [{
    rotulo: "Bônus para aprovar", detalhe: "fechamentos enviados pela gerência",
    href: "/metas/fechamento", icone: "bonus" as const, quantidade: 7, alerta: false,
  }];
  const armazenamentoDaAba = lembrar(unidade, itensDoDono, agora);
  // O logout/login na mesma aba conserva sessionStorage. O componente só passa a unidade;
  // o contrato não recebe usuário, sessão ou permissões para rejeitar a leitura pelo vendedor.
  const itensLidosAposTrocarParaVendedor = lembrancaDoSino(armazenamentoDaAba, unidade, agora + 15_000);
  expect(itensLidosAposTrocarParaVendedor).toEqual(itensDoDono);
  appendFileSync(new URL("./resultados-cache.jsonl", import.meta.url), JSON.stringify({
    id: "REV-PROMPT-003", prova: { memoria_eh_da_loja: true, isola_usuario: false,
      itens_administrativos_reutilizados: itensLidosAposTrocarParaVendedor?.length,
      bypass_de_rls: false, jornada_autenticada_executada: false },
  }) + "\n");
});
