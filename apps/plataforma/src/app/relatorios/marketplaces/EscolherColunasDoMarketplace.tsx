"use client";

import { useMemo, useState } from "react";

import { ErroDaPlanilha, LIMITES_DA_PLANILHA, type Planilha } from "../../../lib/importacao/csv";
import { descomprimirNoNavegador } from "../../../lib/importacao/descomprimir-navegador";
import { lerPlanilha } from "../../../lib/importacao/planilha";
import {
  CAMPOS_DO_MARKETPLACE, MODOS_DOS_VALORES, NOMES_DOS_CAMPOS_DO_MARKETPLACE, montarPedidosDoMarketplace, sugerirMapaDoMarketplace, type MapaDoMarketplace, type ModoDosValores,
} from "../../../lib/marketplaces/leitura";
import { ERROS_DOS_MARKETPLACES, textoDoProblemaDoMarketplace } from "../../../lib/marketplaces/regras";
import { colunaExcel } from "../../../lib/xlsx";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const opcao = "flex min-h-11 items-center gap-2 rounded-xl border border-borda px-3 text-sm has-[:checked]:border-acao has-[:checked]:bg-acao-clara";
const TIPOS_ACEITOS = ".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const reais = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Lê o relatório de vendas do canal no aparelho: as colunas, para a pessoa dizer qual é cada campo (com sugestão pelo nome),
// como os valores do pedido vêm, e a prévia do que vai entrar. O arquivo inteiro vai para o servidor, que relê e confere.
export function EscolherColunasDoMarketplace() {
  const [planilha, setPlanilha] = useState<Planilha | null>(null);
  const [mapa, setMapa] = useState<MapaDoMarketplace>({});
  const [modo, setModo] = useState<ModoDosValores>("em_cada_linha");
  const [problema, setProblema] = useState<string | null>(null);
  const lidos = useMemo(() => (planilha && mapa.pedido !== undefined && mapa.data !== undefined && (mapa.valor !== undefined || mapa.preco !== undefined)
    ? montarPedidosDoMarketplace(planilha, mapa, modo) : null), [planilha, mapa, modo]);

  async function aoEscolher(evento: React.ChangeEvent<HTMLInputElement>) {
    setProblema(null);
    setPlanilha(null);
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    if (arquivo.size > LIMITES_DA_PLANILHA.bytes) {
      setProblema(ERROS_DOS_MARKETPLACES.grande);
      return;
    }
    try {
      const lida = await lerPlanilha(new Uint8Array(await arquivo.arrayBuffer()), descomprimirNoNavegador);
      setPlanilha(lida);
      setMapa(sugerirMapaDoMarketplace(lida.cabecalho));
    } catch (e) {
      setProblema(e instanceof ErroDaPlanilha ? ERROS_DOS_MARKETPLACES[e.motivo] : ERROS_DOS_MARKETPLACES.arquivo);
    }
  }

  const [primeiro] = lidos?.problemas ?? [];
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">Relatório de vendas do canal (CSV ou Excel .xlsx; até 5 MB)
        <input type="file" name="arquivo" required accept={TIPOS_ACEITOS} onChange={aoEscolher} className="mt-1 block w-full text-sm file:mr-3 file:min-h-11 file:rounded-botao file:border-0 file:bg-acao-clara file:px-4 file:font-semibold file:text-acao" />
      </label>
      {problema && <p role="alert" className="text-sm text-perigo">{problema}</p>}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Como os valores do pedido (tarifas, frete, reembolsos, líquido) vêm no arquivo</legend>
        {(Object.keys(MODOS_DOS_VALORES) as ModoDosValores[]).map((m) => (
          <label key={m} className={opcao}><input type="radio" name="modo" value={m} checked={modo === m} onChange={() => setModo(m)} />{MODOS_DOS_VALORES[m]}</label>
        ))}
      </fieldset>
      {planilha && (
        <>
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-1 text-sm font-medium">
              Qual coluna é cada campo ({planilha.cabecalho.length} colunas no arquivo{planilha.aba !== undefined ? `, aba "${planilha.aba}"` : ""}; o valor do item ou o preço, um dos dois)
            </legend>
            {NOMES_DOS_CAMPOS_DO_MARKETPLACE.map((nome) => (
              <label key={nome} className="block text-sm">{CAMPOS_DO_MARKETPLACE[nome].rotulo}{CAMPOS_DO_MARKETPLACE[nome].obrigatorio && <span className="text-perigo"> *</span>}
                <select name={`coluna_${nome}`} required={CAMPOS_DO_MARKETPLACE[nome].obrigatorio} value={mapa[nome] === undefined ? "" : String(mapa[nome])}
                  onChange={(e) => setMapa((m) => ({ ...m, [nome]: e.target.value === "" ? undefined : Number(e.target.value) }))} className={campo}>
                  <option value="">{CAMPOS_DO_MARKETPLACE[nome].obrigatorio ? "escolha a coluna" : "não tem no arquivo"}</option>
                  {planilha.cabecalho.map((c, i) => <option key={i} value={i}>{`${c} (coluna ${colunaExcel(i)})`}</option>)}
                </select>
              </label>
            ))}
          </fieldset>
          {lidos && (primeiro ? (
            <p role="alert" className="text-sm text-perigo">{textoDoProblemaDoMarketplace(String(primeiro.numero), primeiro.campo, primeiro.texto)}</p>
          ) : lidos.pedidos.length === 0 ? (
            <p role="alert" className="text-sm text-perigo">{ERROS_DOS_MARKETPLACES.nenhuma}</p>
          ) : (
            <div className="rounded-xl border border-borda bg-slate-50 px-3 py-2 text-sm" aria-live="polite">
              <p className="font-semibold">{lidos.pedidos.length} pedidos em {lidos.linhas} linhas</p>
              <p className="numeros text-suave">
                Bruto {reais(lidos.pedidos.reduce((s, p) => s + p.bruto, 0))} · tarifas {reais(lidos.pedidos.reduce((s, p) => s + (p.tarifas ?? 0), 0))}
                {lidos.deFora > 0 ? ` · ${lidos.deFora} linhas de fora (total ou sem pedido)` : ""}
              </p>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
