"use client";

import { useMemo, useState } from "react";

import { CAMPOS_DO_EXTRATO, NOMES_DOS_CAMPOS_DO_EXTRATO, lerOfx, montarLinhasDoExtrato, pareceOfx, sugerirMapaDoExtrato, type LinhasDoExtrato, type MapaDoExtrato } from "../../../../lib/extratos/leitura";
import { ERROS_DOS_EXTRATOS, textoDoProblema } from "../../../../lib/extratos/regras";
import { ErroDaPlanilha, LIMITES_DA_PLANILHA, type Planilha } from "../../../../lib/importacao/csv";
import { descomprimirNoNavegador } from "../../../../lib/importacao/descomprimir-navegador";
import { lerPlanilha } from "../../../../lib/importacao/planilha";
import { colunaExcel } from "../../../../lib/xlsx";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const TIPOS_ACEITOS = ".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.ofx,application/x-ofx";
const reais = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** O que a leitura no aparelho mostra antes do envio: quantos lançamentos, os créditos, os débitos e o período. */
function Previa({ lidas }: { lidas: LinhasDoExtrato }) {
  const [problema] = lidas.problemas;
  if (problema) return <p role="alert" className="text-sm text-perigo">{textoDoProblema(String(problema.numero), problema.campo, problema.texto)}</p>;
  if (lidas.linhas.length === 0) return <p role="alert" className="text-sm text-perigo">{ERROS_DOS_EXTRATOS.nenhuma}</p>;
  const creditos = lidas.linhas.filter((l) => l.valor > 0);
  const debitos = lidas.linhas.filter((l) => l.valor < 0);
  const datas = lidas.linhas.map((l) => l.data).sort();
  return (
    <div className="rounded-xl border border-borda bg-slate-50 px-3 py-2 text-sm" aria-live="polite">
      <p className="font-semibold">{lidas.linhas.length} lançamentos de {dia(datas[0] ?? "")} a {dia(datas.at(-1) ?? "")}</p>
      <p className="numeros text-suave">
        {creditos.length} créditos ({reais(creditos.reduce((s, l) => s + l.valor, 0))}) · {debitos.length} débitos ({reais(-debitos.reduce((s, l) => s + l.valor, 0))})
        {lidas.deFora > 0 ? ` · ${lidas.deFora} linhas de fora (saldo, total ou sem valor)` : ""}
      </p>
      {lidas.linhas.length > 5000 && <p className="text-perigo">{ERROS_DOS_EXTRATOS.linhas}</p>}
    </div>
  );
}

// Lê o arquivo no aparelho: do OFX, os lançamentos (os campos vêm com nome); da planilha (CSV ou Excel), as colunas, para a
// pessoa dizer qual é cada campo (com sugestão pelo nome), e a prévia do que vai entrar. O arquivo inteiro vai para o
// servidor, que relê e confere tudo de novo.
export function EscolherColunasDoExtrato() {
  const [planilha, setPlanilha] = useState<Planilha | null>(null);
  const [ofx, setOfx] = useState<LinhasDoExtrato | null>(null);
  const [mapa, setMapa] = useState<MapaDoExtrato>({});
  const [problema, setProblema] = useState<string | null>(null);
  const lidas = useMemo(() => (planilha && mapa.data !== undefined && mapa.valor !== undefined ? montarLinhasDoExtrato(planilha, mapa) : null), [planilha, mapa]);

  async function aoEscolher(evento: React.ChangeEvent<HTMLInputElement>) {
    setProblema(null);
    setPlanilha(null);
    setOfx(null);
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    if (arquivo.size > LIMITES_DA_PLANILHA.bytes) {
      setProblema(ERROS_DOS_EXTRATOS.grande);
      return;
    }
    try {
      const bytes = new Uint8Array(await arquivo.arrayBuffer());
      if (pareceOfx(bytes)) {
        try {
          setOfx(lerOfx(bytes));
        } catch {
          setProblema(ERROS_DOS_EXTRATOS.ofx);
        }
        return;
      }
      const lida = await lerPlanilha(bytes, descomprimirNoNavegador);
      setPlanilha(lida);
      setMapa(sugerirMapaDoExtrato(lida.cabecalho));
    } catch (e) {
      setProblema(e instanceof ErroDaPlanilha ? ERROS_DOS_EXTRATOS[e.motivo] : ERROS_DOS_EXTRATOS.arquivo);
    }
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">Arquivo do extrato (CSV, Excel .xlsx ou OFX do banco; até 5 MB e 5.000 lançamentos)
        <input type="file" name="arquivo" required accept={TIPOS_ACEITOS} onChange={aoEscolher} className="mt-1 block w-full text-sm file:mr-3 file:min-h-11 file:rounded-botao file:border-0 file:bg-acao-clara file:px-4 file:font-semibold file:text-acao" />
      </label>
      {problema && <p role="alert" className="text-sm text-perigo">{problema}</p>}
      {ofx && (
        <>
          <p className="text-xs text-suave">Arquivo OFX do banco: a data, o valor, a referência e a descrição vêm com nome. Não precisa escolher colunas.</p>
          <Previa lidas={ofx} />
        </>
      )}
      {planilha && (
        <>
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-1 text-sm font-medium">
              Qual coluna é cada campo ({planilha.cabecalho.length} colunas no arquivo{planilha.aba !== undefined ? `, aba "${planilha.aba}"` : ""})
            </legend>
            {NOMES_DOS_CAMPOS_DO_EXTRATO.map((nome) => (
              <label key={nome} className="block text-sm">{CAMPOS_DO_EXTRATO[nome].rotulo}{CAMPOS_DO_EXTRATO[nome].obrigatorio && <span className="text-perigo"> *</span>}
                <select name={`coluna_${nome}`} required={CAMPOS_DO_EXTRATO[nome].obrigatorio} value={mapa[nome] === undefined ? "" : String(mapa[nome])}
                  onChange={(e) => setMapa((m) => ({ ...m, [nome]: e.target.value === "" ? undefined : Number(e.target.value) }))} className={campo}>
                  <option value="">{CAMPOS_DO_EXTRATO[nome].obrigatorio ? "escolha a coluna" : "não tem no arquivo"}</option>
                  {planilha.cabecalho.map((c, i) => <option key={i} value={i}>{`${c} (coluna ${colunaExcel(i)})`}</option>)}
                </select>
              </label>
            ))}
          </fieldset>
          {lidas && <Previa lidas={lidas} />}
        </>
      )}
    </div>
  );
}
