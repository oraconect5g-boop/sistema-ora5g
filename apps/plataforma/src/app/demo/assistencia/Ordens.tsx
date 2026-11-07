"use client";

import { lerReais } from "@ora5g/dominio";
import { ArrowRight, Plus, Wrench } from "lucide-react";
import { useState } from "react";

import { Dialogo } from "../../../componentes/Dialogo";
import { Botao, Cartao, EstadoVazio, Etapas, Selo } from "../../../componentes/ui";
import { brl } from "../../../lib/formato";

export type OrdemDemo = { numero: string; loja: string; cliente: string; aparelho: string; defeito: string; etapa: number; valor: number; dias: number; abertaPor: string };

// Etapas que só o técnico executa (ADR-002: orçar e concluir OS é do técnico); as demais são da loja.
const DO_TECNICO = new Set([3, 5]);

export function Ordens({ ordens, etapas, ehTecnico, podeAbrir, lojaDaSessao }: {
  ordens: readonly OrdemDemo[];
  etapas: readonly string[];
  ehTecnico: boolean;
  podeAbrir: boolean;
  lojaDaSessao: string;
}) {
  const [lista, setLista] = useState<OrdemDemo[]>([...ordens]);
  const [filtro, setFiltro] = useState<"andamento" | "paradas" | "entregues">("andamento");
  const [nova, setNova] = useState<{ aberto: boolean; cliente: string; aparelho: string; defeito: string; erro: string }>({ aberto: false, cliente: "", aparelho: "", defeito: "", erro: "" });
  const [orcando, setOrcando] = useState<{ numero: string; valor: string; erro: string } | null>(null);

  const visiveis = lista.filter((o) => (filtro === "entregues" ? o.etapa === etapas.length - 1 : filtro === "paradas" ? o.dias >= 5 && o.etapa < etapas.length - 1 : o.etapa < etapas.length - 1));
  const avancar = (numero: string, valor?: number) => setLista(lista.map((o) => (o.numero === numero ? { ...o, etapa: Math.min(etapas.length - 1, o.etapa + 1), dias: 0, valor: valor ?? o.valor } : o)));

  function abrirOs() {
    if (nova.cliente.trim().length < 2 || nova.aparelho.trim().length < 2 || nova.defeito.trim().length < 3) return setNova({ ...nova, erro: "Preencha cliente, aparelho e defeito." });
    const numero = `OS-${Math.max(1046, ...lista.map((o) => Number(o.numero.replace(/\D/g, "")) || 0)) + 1}`;
    setLista([{ numero, loja: lojaDaSessao, cliente: nova.cliente.trim(), aparelho: nova.aparelho.trim(), defeito: nova.defeito.trim(), etapa: 0, valor: 0, dias: 0, abertaPor: "você" }, ...lista]);
    setNova({ aberto: false, cliente: "", aparelho: "", defeito: "", erro: "" });
    setFiltro("andamento");
  }

  function registrarOrcamento() {
    if (!orcando) return;
    try {
      const valor = lerReais(orcando.valor);
      if (valor <= 0) throw new RangeError("zero");
      avancar(orcando.numero, valor);
      setOrcando(null);
    } catch {
      setOrcando({ ...orcando, erro: "Valor inválido. Ex.: 380,00" });
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar ordens de serviço">
          {([["andamento", "Em andamento"], ["paradas", "Paradas há 5+ dias"], ["entregues", "Entregues"]] as const).map(([valor, rotulo]) => (
            <button key={valor} type="button" aria-pressed={filtro === valor} onClick={() => setFiltro(valor)} className={`min-h-10 rounded-xl border px-3 text-sm font-semibold ${filtro === valor ? "border-acao bg-acao-clara text-acao-escura" : "border-borda bg-white text-suave hover:text-texto"}`}>{rotulo}</button>
          ))}
        </div>
        {podeAbrir && <Botao onClick={() => setNova({ ...nova, aberto: true, erro: "" })}><Plus aria-hidden className="size-4" /> Nova OS</Botao>}
      </div>

      {visiveis.length === 0 ? (
        <div className="mt-4"><EstadoVazio titulo="Nenhuma OS neste filtro" icone={Wrench} /></div>
      ) : (
        <ul className="mt-4 grid gap-4 xl:grid-cols-2">
          {visiveis.map((os) => {
            const proxima = os.etapa + 1;
            const ultima = os.etapa >= etapas.length - 1;
            const vezDoTecnico = DO_TECNICO.has(proxima);
            const podeAvancar = !ultima && (ehTecnico ? vezDoTecnico : !vezDoTecnico);
            return (
              <li key={os.numero}>
                <Cartao
                  titulo={`${os.numero} · ${os.aparelho}`}
                  subtitulo={`${os.cliente} · ${os.defeito} · ${os.loja}`}
                  acao={os.dias >= 5 && !ultima ? <Selo tom="perigo" ponto>Parada há {os.dias} dias</Selo> : <Selo tom={ultima ? "sucesso" : "info"} ponto>{ultima ? "Entregue" : `Etapa ${os.etapa + 1} de ${etapas.length}`}</Selo>}
                >
                  <Etapas etapas={etapas} atual={ultima ? etapas.length : os.etapa} rotulo={`Andamento da ${os.numero}`} />
                  <p className="mt-3 text-sm"><strong>{etapas[os.etapa]}</strong>{os.valor > 0 && <span className="text-suave"> · orçamento {brl(os.valor)}</span>}</p>
                  {!ultima && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-suave">Próxima: {etapas[proxima]}{vezDoTecnico ? " (técnico)" : " (loja)"}</span>
                      {podeAvancar ? (
                        proxima === 3 ? (
                          <Botao tamanho="sm" onClick={() => setOrcando({ numero: os.numero, valor: "", erro: "" })}>Registrar orçamento</Botao>
                        ) : (
                          <Botao tamanho="sm" variante="secundario" onClick={() => avancar(os.numero)}>{etapas[proxima]} <ArrowRight aria-hidden className="size-4" /></Botao>
                        )
                      ) : (
                        <span className="text-xs font-medium text-suave">Aguardando {vezDoTecnico ? "o técnico" : "a loja"}</span>
                      )}
                    </div>
                  )}
                </Cartao>
              </li>
            );
          })}
        </ul>
      )}

      <Dialogo
        aberto={nova.aberto}
        aoFechar={() => setNova({ aberto: false, cliente: "", aparelho: "", defeito: "", erro: "" })}
        titulo="Abrir ordem de serviço"
        descricao="OS obrigatória até para limpeza. O cliente recebe o comprovante; a peça só sai do estoque com OS."
        rodape={<><Botao variante="secundario" onClick={() => setNova({ aberto: false, cliente: "", aparelho: "", defeito: "", erro: "" })}>Cancelar</Botao><Botao onClick={abrirOs}>Abrir OS</Botao></>}
      >
        <div className="space-y-3">
          {([["cliente", "Cliente"], ["aparelho", "Aparelho (modelo)"], ["defeito", "Defeito relatado"]] as const).map(([campo, rotulo]) => (
            <label key={campo} className="block text-sm font-medium">{rotulo}
              <input value={nova[campo]} onChange={(e) => setNova({ ...nova, [campo]: e.target.value, erro: "" })} autoComplete="off" className="mt-1 min-h-11 w-full rounded-botao border border-borda px-3 text-[15px] outline-none focus:border-acao focus:ring-2 focus:ring-acao/20" />
            </label>
          ))}
          {nova.erro && <p role="alert" className="text-sm text-perigo">{nova.erro}</p>}
        </div>
      </Dialogo>

      <Dialogo
        aberto={orcando !== null}
        aoFechar={() => setOrcando(null)}
        titulo={`Orçamento da ${orcando?.numero ?? ""}`}
        descricao="O cliente recebe o valor e aprova antes do conserto."
        rodape={<><Botao variante="secundario" onClick={() => setOrcando(null)}>Cancelar</Botao><Botao onClick={registrarOrcamento}>Registrar orçamento</Botao></>}
      >
        <label className="block text-sm font-medium">Valor do conserto (R$)
          <input value={orcando?.valor ?? ""} onChange={(e) => orcando && setOrcando({ ...orcando, valor: e.target.value, erro: "" })} inputMode="decimal" placeholder="380,00" className="numeros mt-1 min-h-11 w-full rounded-botao border border-borda px-3 text-[15px] outline-none focus:border-acao focus:ring-2 focus:ring-acao/20" />
        </label>
        {orcando?.erro && <p role="alert" className="mt-2 text-sm text-perigo">{orcando.erro}</p>}
      </Dialogo>
    </>
  );
}
