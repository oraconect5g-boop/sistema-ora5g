"use client";

import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Aviso, Botao } from "../../componentes/ui";
import { criarBuscaDoCadastro, type AvisoDaBusca, type BuscaDoCadastro, type ModoDaBusca } from "../../lib/connect/busca-do-cadastro";
import type { CamposDoFormulario } from "../../lib/connect/cadastro-da-nogle";
import { descartarCadastroDaNogle, lerCadastroDaNogle, pedirCadastroDaNogle } from "./acoes";

// AUD-f (auditoria de e7f55b2), item 1: o botão "Buscar o cadastro na Nogle" de um formulário (a ativação, a atualização do
// cadastro e a compra de chip com entrega) ou "Ver se já tem cadastro na Nogle" (o cadastro novo). Fica dentro do formulário e
// acha os campos pelo nome (os campos continuam do formulário: editáveis, sem estado aqui). O andamento (o número de cada
// busca, o descarte, o tempo) está em criarBuscaDoCadastro; aqui, só a ligação com a tela. O botão é type="button": o Enter e
// o toque nele nunca enviam o formulário.

const esperar = (ms: number) => new Promise<void>((pronto) => { setTimeout(pronto, ms); });

export function BuscaNoCadastroDaNogle({ campos, modo, campoDoDocumento = "documento" }: {
  campos: CamposDoFormulario;
  modo: ModoDaBusca;
  campoDoDocumento?: string;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const busca = useRef<BuscaDoCadastro | null>(null);
  const mexidos = useRef(new Set<string>());
  const [ocupada, setOcupada] = useState(false);
  const [aviso, setAviso] = useState<AvisoDaBusca | null>(null);

  useEffect(() => {
    const formulario = raiz.current?.closest("form");
    if (!formulario) return;
    const campo = (nome: string) => {
      const e = formulario.elements.namedItem(nome);
      return e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement ? e : null;
    };
    const atual = criarBuscaDoCadastro(modo, campos, {
      pedir: pedirCadastroDaNogle, ler: lerCadastroDaNogle, descartar: descartarCadastroDaNogle, esperar, novaChave: () => crypto.randomUUID(),
      campoNaTela: (nome) => {
        const e = campo(nome);
        return e ? { valor: e.value, maximo: e.maxLength, mexido: mexidos.current.has(nome) } : null;
      },
      preencher: (nome, valor) => { const e = campo(nome); if (e) e.value = valor; },
      mostrar: setAviso,
      ocupada: setOcupada,
    });
    busca.current = atual;
    // O que a pessoa digita não é trocado pela resposta; o documento que muda descarta a busca de outro documento.
    const nomes = new Set(Object.values(campos));
    const aoMexer = (evento: Event) => {
      const alvo = evento.target;
      if (!(alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement)) return;
      if (alvo.name === campoDoDocumento) atual.mudouODocumento(alvo.value);
      else if (nomes.has(alvo.name)) mexidos.current.add(alvo.name);
    };
    formulario.addEventListener("input", aoMexer);
    return () => {
      formulario.removeEventListener("input", aoMexer);
      atual.sair();
    };
  }, [campos, modo, campoDoDocumento]);

  const buscar = () => {
    const formulario = raiz.current?.closest("form");
    const documento = formulario?.elements.namedItem(campoDoDocumento);
    // O motor apaga o que a busca anterior (de outro documento) preencheu ainda antes de pedir, com as edições de até agora; só
    // depois a lista do que a pessoa mexeu recomeça (para a busca nova não trocar o que ela digitar enquanto espera).
    const andamento = busca.current?.buscar(documento instanceof HTMLInputElement ? documento.value : "");
    mexidos.current = new Set();
    void andamento;
  };

  return (
    <div ref={raiz} className="space-y-2 sm:col-span-2">
      <Botao variante="secundario" tamanho="sm" onClick={buscar} disabled={ocupada}>
        <Search aria-hidden className="size-4" /> {ocupada ? "Buscando na Nogle…" : modo === "avisar" ? "Ver se já tem cadastro na Nogle" : "Buscar o cadastro na Nogle"}
      </Botao>
      <div aria-live="polite">
        {aviso && <Aviso tom={aviso.tom}>{aviso.linhas.map((l) => <span key={l} className="block">{l}</span>)}</Aviso>}
      </div>
    </div>
  );
}
