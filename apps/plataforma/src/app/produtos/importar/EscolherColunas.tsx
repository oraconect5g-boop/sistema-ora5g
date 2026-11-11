"use client";

import { useState } from "react";

import { CAMPOS_DO_CATALOGO, NOMES_DOS_CAMPOS, sugerirMapeamento, type Mapeamento } from "../../../lib/importacao/catalogo";
import { ErroDoCsv, lerCabecalho } from "../../../lib/importacao/csv";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";

// Lê só o cabeçalho do arquivo no aparelho, para a pessoa dizer qual coluna é cada campo (com sugestão
// pelo nome da coluna). O arquivo inteiro vai para o servidor, que relê e confere tudo de novo.
export function EscolherColunas() {
  const [colunas, setColunas] = useState<string[] | null>(null);
  const [mapa, setMapa] = useState<Mapeamento>({});
  const [problema, setProblema] = useState<string | null>(null);

  async function aoEscolher(evento: React.ChangeEvent<HTMLInputElement>) {
    setProblema(null);
    setColunas(null);
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    try {
      const { colunas: lidas } = lerCabecalho(new Uint8Array(await arquivo.slice(0, 64 * 1024).arrayBuffer()));
      setColunas(lidas);
      setMapa(sugerirMapeamento(lidas));
    } catch (e) {
      setProblema(e instanceof ErroDoCsv && e.motivo === "cabecalho"
        ? "A primeira linha precisa ter o nome de cada coluna, sem repetir e sem coluna em branco."
        : "Não deu para ler o arquivo: salve a planilha como CSV e tente de novo.");
    }
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">Planilha (CSV, até 5 MB e 2.000 linhas)
        <input type="file" name="arquivo" required accept=".csv,text/csv" onChange={aoEscolher} className="mt-1 block w-full text-sm file:mr-3 file:min-h-11 file:rounded-botao file:border-0 file:bg-acao-clara file:px-4 file:font-semibold file:text-acao" />
      </label>
      {problema && <p role="alert" className="text-sm text-perigo">{problema}</p>}
      {colunas && (
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-medium">Qual coluna é cada campo ({colunas.length} colunas no arquivo)</legend>
          {NOMES_DOS_CAMPOS.map((nome) => (
            <label key={nome} className="block text-sm">{CAMPOS_DO_CATALOGO[nome].rotulo}{CAMPOS_DO_CATALOGO[nome].obrigatorio && <span className="text-perigo"> *</span>}
              <select name={`coluna_${nome}`} required={CAMPOS_DO_CATALOGO[nome].obrigatorio} value={mapa[nome] === undefined ? "" : String(mapa[nome])}
                onChange={(e) => setMapa((m) => ({ ...m, [nome]: e.target.value === "" ? undefined : Number(e.target.value) }))} className={campo}>
                <option value="">{CAMPOS_DO_CATALOGO[nome].obrigatorio ? "escolha a coluna" : "não tem no arquivo"}</option>
                {colunas.map((c, i) => <option key={i} value={i}>{c}</option>)}
              </select>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}
