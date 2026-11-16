// O retorno imediato dos botões de envio (lote VEL-a: ORA-QUAL-010 e ORA-POS-002). Antes, o botão ficava igual
// por segundos depois do toque: nada dizia que o pedido tinha saído, e a pessoa tocava de novo. Aqui o estado do
// envio (useFormStatus) é SIMULADO e o teste confere o que o botão desenha em cada caso. O estado de verdade, no
// navegador, está em e2e/entrar.spec.ts.
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Envio = { pending: boolean; data: FormData | null; method: string | null; action: unknown };
const PARADO: Envio = { pending: false, data: null, method: null, action: null };
const cenario = vi.hoisted(() => ({ envio: { pending: false, data: null, method: null, action: null } as Envio }));
vi.mock("react-dom", async (original) => ({ ...(await original<typeof import("react-dom")>()), useFormStatus: () => cenario.envio }));

import { BotaoConfirmar } from "./BotaoConfirmar";
import { BotaoDeEnvio, EnvioDeArquivo } from "./BotaoDeEnvio";
import { FormularioDeArquivo } from "./FormularioDeArquivo";
import { Botao } from "./ui";

const enviando = (campos: Record<string, string> = {}): Envio => {
  const data = new FormData();
  for (const [k, v] of Object.entries(campos)) data.set(k, v);
  return { pending: true, data, method: "post", action: () => {} };
};
/** Os atributos de uma etiqueta, com o nome em minúsculas: a ordem em que o React escreve não importa. */
const atributos = (abertura: string) => Object.fromEntries([...abertura.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, nome = "", valor = ""]) => [nome.toLowerCase(), valor]));
/** Os botões desenhados: os atributos (travado = tem "disabled") e o que está escrito dentro. */
const botoes = (...filhos: ReactNode[]) => [...renderToStaticMarkup(createElement("form", null, ...filhos)).matchAll(/<button([^>]*)>(.*?)<\/button>/g)]
  .map(([, abertura = "", dentro = ""]) => ({ ...atributos(abertura), dentro }));

beforeEach(() => { cenario.envio = PARADO; });

describe("BotaoDeEnvio", () => {
  it("parado: é o botão de envio comum, solto, com o próprio texto", () => {
    expect(botoes(createElement(BotaoDeEnvio, { className: "c" }, "Salvar"))).toEqual([{ class: "c", type: "submit", "aria-busy": "false", dentro: "Salvar" }]);
  });

  it("enquanto o pedido está no servidor: trava e troca o texto pelo de espera", () => {
    cenario.envio = enviando();
    expect(botoes(createElement(BotaoDeEnvio, null, "Salvar"))).toEqual([{ type: "submit", disabled: "", "aria-busy": "true", dentro: "Aguarde…" }]);
    expect(botoes(createElement(BotaoDeEnvio, { enquanto: "Adicionando…" }, "Adicionar"))).toEqual([{ type: "submit", disabled: "", "aria-busy": "true", dentro: "Adicionando…" }]);
  });

  it("dois botões no mesmo formulário (Aprovar / Negar): os dois travam, só o tocado mostra a espera", () => {
    cenario.envio = enviando({ decisao: "negar", motivo: "fora da regra" });
    const aprovar = createElement(BotaoDeEnvio, { name: "decisao", value: "aprovar", enquanto: "Aprovando…" }, "Aprovar");
    const negar = createElement(BotaoDeEnvio, { name: "decisao", value: "negar", enquanto: "Negando…" }, "Negar");
    expect(botoes(aprovar, negar)).toEqual([
      { name: "decisao", value: "aprovar", type: "submit", disabled: "", "aria-busy": "false", dentro: "Aprovar" },
      { name: "decisao", value: "negar", type: "submit", disabled: "", "aria-busy": "true", dentro: "Negando…" },
    ]);
  });

  it("botão com nome e sem valor: o tocado é o que foi no envio com o valor vazio", () => {
    const repetir = createElement(BotaoDeEnvio, { name: "repetir", enquanto: "Repetindo…" }, "Repetir");
    cenario.envio = enviando({ repetir: "" });
    expect(botoes(repetir)).toEqual([{ name: "repetir", type: "submit", disabled: "", "aria-busy": "true", dentro: "Repetindo…" }]);
    cenario.envio = enviando({ outro: "1" });
    expect(botoes(repetir)).toEqual([{ name: "repetir", type: "submit", disabled: "", "aria-busy": "false", dentro: "Repetir" }]);
  });

  it("quem já vinha travado pela tela continua travado, com o próprio texto", () => {
    expect(botoes(createElement(BotaoDeEnvio, { disabled: true }, "Concluir"))).toEqual([{ type: "submit", disabled: "", "aria-busy": "false", dentro: "Concluir" }]);
  });

  it("ninguém troca o tipo: é sempre de envio", () => {
    expect(botoes(createElement(BotaoDeEnvio, { type: "button" } as never, "Salvar"))).toEqual([{ type: "submit", "aria-busy": "false", dentro: "Salvar" }]);
  });
});

describe("Botao (ui.tsx)", () => {
  it("com type=\"submit\" é o botão de envio, com a aparência do sistema e a espera padrão", () => {
    const [parado] = botoes(createElement(Botao, { type: "submit", tamanho: "sm" }, "Guardar"));
    expect(parado).toEqual({ class: expect.stringMatching(/^inline-flex .*\bmin-h-9\b/), type: "submit", "aria-busy": "false", dentro: "Guardar" });
    cenario.envio = enviando();
    expect(botoes(createElement(Botao, { type: "submit" }, "Guardar"))).toEqual([expect.objectContaining({ type: "submit", disabled: "", "aria-busy": "true", dentro: "Aguarde…" })]);
    expect(botoes(createElement(Botao, { type: "submit", enquanto: "Guardando…" }, "Guardar"))).toEqual([expect.objectContaining({ disabled: "", dentro: "Guardando…" })]);
  });

  it("sem type continua um botão comum, que não envia formulário nem muda com o envio", () => {
    cenario.envio = enviando();
    expect(botoes(createElement(Botao, null, "Fechar"))).toEqual([{ type: "button", class: expect.stringMatching(/^inline-flex /), dentro: "Fechar" }]);
  });
});

describe("BotaoConfirmar", () => {
  it("trava e avisa que está confirmando", () => {
    expect(botoes(createElement(BotaoConfirmar, null, "Concluir a venda"))).toEqual([{ type: "submit", "aria-busy": "false", class: expect.any(String), dentro: "Concluir a venda" }]);
    cenario.envio = enviando();
    expect(botoes(createElement(BotaoConfirmar, null, "Concluir a venda"))).toEqual([{ type: "submit", disabled: "", "aria-busy": "true", class: expect.any(String), dentro: "Confirmando no sistema…" }]);
  });
});

describe("FormularioDeArquivo (envio de arquivo para uma rota, pelo navegador)", () => {
  const formulario = (html: string) => atributos(/^<form([^>]*)>/.exec(html)?.[1] ?? "");

  it("é um formulário comum em POST e multipart, que funciona sem JavaScript; o botão de dentro começa solto", () => {
    const html = renderToStaticMarkup(createElement(FormularioDeArquivo, { action: "/vendas/1/anexos", className: "grid" },
      createElement("input", { type: "file", name: "arquivo", required: true }),
      createElement(BotaoDeEnvio, { enquanto: "Enviando o arquivo…" }, "Guardar o documento")));
    expect(formulario(html)).toEqual({ action: "/vendas/1/anexos", class: "grid", method: "post", enctype: "multipart/form-data" });
    expect(html).toContain('name="arquivo"');
    expect(html).toMatch(/<button type="submit" aria-busy="false">Guardar o documento<\/button><\/form>$/);
  });

  it("ninguém troca o método nem a codificação por engano", () => {
    const html = renderToStaticMarkup(createElement(FormularioDeArquivo, { action: "/x", method: "get", encType: "text/plain" } as never));
    expect(formulario(html)).toEqual({ action: "/x", method: "post", enctype: "multipart/form-data" });
  });

  it("com o envio saindo, o botão de dentro trava e mostra a espera (o useFormStatus não enxerga esse envio)", () => {
    const botao = createElement(BotaoDeEnvio, { enquanto: "Enviando o arquivo…" }, "Guardar o documento");
    expect(botoes(createElement(EnvioDeArquivo.Provider, { value: true }, botao))).toEqual([{ type: "submit", disabled: "", "aria-busy": "true", dentro: "Enviando o arquivo…" }]);
    expect(botoes(createElement(EnvioDeArquivo.Provider, { value: false }, botao))).toEqual([{ type: "submit", "aria-busy": "false", dentro: "Guardar o documento" }]);
  });
});
