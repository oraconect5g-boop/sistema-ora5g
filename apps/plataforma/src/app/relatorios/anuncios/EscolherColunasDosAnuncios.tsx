"use client";

import { useMemo, useState } from "react";

import { CAMPOS_DOS_ANUNCIOS, NOMES_DOS_CAMPOS_DOS_ANUNCIOS, montarLinhasDosAnuncios, sugerirMapaDosAnuncios, type MapaDosAnuncios } from "../../../lib/anuncios/leitura";
import { ERROS_DOS_ANUNCIOS, textoDoProblemaDosAnuncios } from "../../../lib/anuncios/regras";
import { ErroDaPlanilha, LIMITES_DA_PLANILHA, type Planilha } from "../../../lib/importacao/csv";
import { descomprimirNoNavegador } from "../../../lib/importacao/descomprimir-navegador";
import { lerPlanilha } from "../../../lib/importacao/planilha";
import { colunaExcel } from "../../../lib/xlsx";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const TIPOS_ACEITOS = ".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const reais = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

// Lê o relatório do Gerenciador de Anúncios no aparelho: as colunas, para a pessoa dizer qual é cada campo (com sugestão pelo
// nome, em português ou em inglês), e a prévia do que vai entrar. O arquivo inteiro vai para o servidor, que relê e confere.
export function EscolherColunasDosAnuncios() {
  const [planilha, setPlanilha] = useState<Planilha | null>(null);
  const [mapa, setMapa] = useState<MapaDosAnuncios>({});
  const [problema, setProblema] = useState<string | null>(null);
  const lidas = useMemo(() => (planilha && mapa.dia !== undefined && mapa.campanha !== undefined && mapa.gasto !== undefined ? montarLinhasDosAnuncios(planilha, mapa) : null), [planilha, mapa]);

  async function aoEscolher(evento: React.ChangeEvent<HTMLInputElement>) {
    setProblema(null);
    setPlanilha(null);
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    if (arquivo.size > LIMITES_DA_PLANILHA.bytes) {
      setProblema(ERROS_DOS_ANUNCIOS.grande);
      return;
    }
    try {
      const lida = await lerPlanilha(new Uint8Array(await arquivo.arrayBuffer()), descomprimirNoNavegador);
      setPlanilha(lida);
      setMapa(sugerirMapaDosAnuncios(lida.cabecalho));
    } catch (e) {
      setProblema(e instanceof ErroDaPlanilha ? ERROS_DOS_ANUNCIOS[e.motivo] : ERROS_DOS_ANUNCIOS.arquivo);
    }
  }

  const [primeiro] = lidas?.problemas ?? [];
  const dias = lidas ? [...new Set(lidas.linhas.map((l) => l.dia))].sort() : [];
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">Relatório do Gerenciador de Anúncios (CSV ou Excel .xlsx; até 5 MB)
        <input type="file" name="arquivo" required accept={TIPOS_ACEITOS} onChange={aoEscolher} className="mt-1 block w-full text-sm file:mr-3 file:min-h-11 file:rounded-botao file:border-0 file:bg-acao-clara file:px-4 file:font-semibold file:text-acao" />
      </label>
      {problema && <p role="alert" className="text-sm text-perigo">{problema}</p>}
      {planilha && (
        <>
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-1 text-sm font-medium">
              Qual coluna é cada campo ({planilha.cabecalho.length} colunas no arquivo{planilha.aba !== undefined ? `, aba "${planilha.aba}"` : ""})
            </legend>
            {NOMES_DOS_CAMPOS_DOS_ANUNCIOS.map((nome) => (
              <label key={nome} className="block text-sm">{CAMPOS_DOS_ANUNCIOS[nome].rotulo}{CAMPOS_DOS_ANUNCIOS[nome].obrigatorio && <span className="text-perigo"> *</span>}
                <select name={`coluna_${nome}`} required={CAMPOS_DOS_ANUNCIOS[nome].obrigatorio} value={mapa[nome] === undefined ? "" : String(mapa[nome])}
                  onChange={(e) => setMapa((m) => ({ ...m, [nome]: e.target.value === "" ? undefined : Number(e.target.value) }))} className={campo}>
                  <option value="">{CAMPOS_DOS_ANUNCIOS[nome].obrigatorio ? "escolha a coluna" : "não tem no arquivo"}</option>
                  {planilha.cabecalho.map((c, i) => <option key={i} value={i}>{`${c} (coluna ${colunaExcel(i)})`}</option>)}
                </select>
              </label>
            ))}
          </fieldset>
          {lidas && (primeiro ? (
            <p role="alert" className="text-sm text-perigo">{textoDoProblemaDosAnuncios(String(primeiro.numero), primeiro.campo, primeiro.texto)}</p>
          ) : lidas.linhas.length === 0 ? (
            <p role="alert" className="text-sm text-perigo">{ERROS_DOS_ANUNCIOS.nenhuma}</p>
          ) : (
            <div className="rounded-xl border border-borda bg-slate-50 px-3 py-2 text-sm" aria-live="polite">
              <p className="font-semibold">{new Set(lidas.linhas.map((l) => l.campanha.toLowerCase())).size} campanhas de {dia(dias[0] ?? "")} a {dia(dias.at(-1) ?? "")}</p>
              <p className="numeros text-suave">
                Valor usado {reais(lidas.linhas.reduce((s, l) => s + l.gasto, 0))} em {lidas.linhas.length} linhas{lidas.deFora > 0 ? ` · ${lidas.deFora} de fora (total ou sem dia)` : ""}
              </p>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
