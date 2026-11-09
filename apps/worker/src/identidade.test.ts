import { describe, expect, it } from "vitest";

import { aplicarBloqueios, mensagemSegura, processarConvites, type ResultadoDoConvite, type ServicoIdentidade } from "./identidade.ts";

// Serviço simulado: registra o que o worker pediu (nada de rede, Auth ou banco reais).
function simulado(respostas: Record<string, ResultadoDoConvite | Error>, existentes: Record<string, string> = {}, recusados: string[] = []) {
  const registro: string[] = [];
  const servico: ServicoIdentidade = {
    convitesAProcessar: async () => Object.keys(respostas).map((email, i) => ({ id: `c${i}`, email, nome: `Pessoa ${i}` })),
    convidarPorEmail: async (email) => {
      const r = respostas[email];
      if (r instanceof Error) throw r;
      return r ?? { erro: "sem resposta" };
    },
    usuarioPorEmail: async (email) => existentes[email] ?? null,
    concluir: async (convite, usuario, jaExistia) => {
      registro.push(`concluir ${convite} ${usuario} ${jaExistia}`);
      return recusados.includes(usuario) ? "recusado" : jaExistia ? "vinculado" : "enviado";
    },
    falhar: async (convite, erro) => { registro.push(`falhar ${convite} ${erro}`); },
    bloqueiosAAplicar: async () => [{ usuario: "u1", bloquear: true }, { usuario: "u2", bloquear: false }],
    aplicarBloqueio: async (usuario) => (usuario === "u2" ? "http_500: falhou" : null),
  };
  return { servico, registro };
}

describe("worker de identidade", () => {
  it("pessoa nova é concluída como enviada; conta existente vira vínculo; erro do envio fica no convite", async () => {
    const { servico, registro } = simulado({
      "nova@teste.invalid": { usuario: "u-nova" },
      "antiga@teste.invalid": { jaExiste: true },
      "sem-smtp@teste.invalid": { erro: "unexpected_failure: Error sending invite email" },
    }, { "antiga@teste.invalid": "u-antiga" });
    expect(await processarConvites(servico)).toEqual({ enviados: 1, vinculados: 1, recusados: 0, falhas: 1 });
    expect(registro).toEqual([
      "concluir c0 u-nova false",
      "concluir c1 u-antiga true",
      "falhar c2 unexpected_failure: Error sending invite email",
    ]);
  });

  it("conta existente que não aparece pelo e-mail e falha inesperada não travam a fila", async () => {
    const { servico, registro } = simulado({ "sumiu@teste.invalid": { jaExiste: true }, "rede@teste.invalid": Object.assign(new Error("fetch failed"), { code: "ECONNRESET" }) });
    expect(await processarConvites(servico)).toEqual({ enviados: 0, vinculados: 0, recusados: 0, falhas: 2 });
    expect(registro).toEqual(["falhar c0 a conta existe no Auth mas não foi encontrada pelo e-mail", "falhar c1 ECONNRESET: fetch failed"]);
  });

  it("convite recusado pelo banco (autoconcessão ou autor sem autorização, #28/#30) conta como recusado, não como vínculo", async () => {
    const { servico } = simulado({ "proprio@teste.invalid": { jaExiste: true }, "nova@teste.invalid": { usuario: "u-nova" } },
      { "proprio@teste.invalid": "u-autor" }, ["u-autor", "u-nova"]);
    expect(await processarConvites(servico)).toEqual({ enviados: 0, vinculados: 0, recusados: 2, falhas: 0 });
  });

  it("aplica bloqueios e conta as falhas", async () => {
    expect(await aplicarBloqueios(simulado({}).servico)).toEqual({ aplicados: 1, falhas: 1 });
  });

  it("a mensagem guardada não leva e-mail nem nada parecido com token", () => {
    const erro = Object.assign(new Error("falha para joana@ora5g.com.br com token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abc"), { status: 500 });
    expect(mensagemSegura(erro)).toBe("http_500: falha para [e-mail] com token [omitido]");
  });
});
