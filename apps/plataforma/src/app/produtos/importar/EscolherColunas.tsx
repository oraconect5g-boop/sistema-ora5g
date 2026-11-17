"use client";

import { useState } from "react";

import { CAMPOS_DO_CATALOGO, NOMES_DOS_CAMPOS, sugerirMapeamento, type Mapeamento } from "../../../lib/importacao/catalogo";
import { ErroDaPlanilha } from "../../../lib/importacao/csv";
import { descomprimirNoNavegador } from "../../../lib/importacao/descomprimir-navegador";
import { lerColunasDoArquivo } from "../../../lib/importacao/planilha";
import { ERROS_DA_IMPORTACAO } from "../../../lib/importacao/regras";
import { colunaExcel } from "../../../lib/xlsx";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const TIPOS_ACEITOS = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.csv,text/csv";

// Lê só o cabeçalho do arquivo no aparelho, para a pessoa dizer qual coluna é cada campo (com sugestão pelo nome da
// coluna e a letra da coluna no Excel). O arquivo inteiro vai para o servidor, que relê e confere tudo de novo. Desde o
// CAT-002b, também a planilha do Excel (.xlsx), lida da primeira aba.
export function EscolherColunas() {
  const [colunas, setColunas] = useState<string[] | null>(null);
  const [aba, setAba] = useState<string | null>(null);
  const [mapa, setMapa] = useState<Mapeamento>({});
  const [problema, setProblema] = useState<string | null>(null);

  async function aoEscolher(evento: React.ChangeEvent<HTMLInputElement>) {
    setProblema(null);
    setColunas(null);
    setAba(null);
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    try {
      const lido = await lerColunasDoArquivo(arquivo, descomprimirNoNavegador);
      setColunas(lido.colunas);
      setAba(lido.aba);
      setMapa(sugerirMapeamento(lido.colunas));
    } catch (e) {
      setProblema(e instanceof ErroDaPlanilha ? ERROS_DA_IMPORTACAO[e.motivo] : ERROS_DA_IMPORTACAO.arquivo);
    }
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">Planilha (Excel .xlsx ou CSV, até 5 MB e 10.000 linhas; acima de 2.000, a prévia sai em partes)
        <input type="file" name="arquivo" required accept={TIPOS_ACEITOS} onChange={aoEscolher} className="mt-1 block w-full text-sm file:mr-3 file:min-h-11 file:rounded-botao file:border-0 file:bg-acao-clara file:px-4 file:font-semibold file:text-acao" />
      </label>
      {problema && <p role="alert" className="text-sm text-perigo">{problema}</p>}
      {colunas && (
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-medium">
            Qual coluna é cada campo ({colunas.length} colunas no arquivo{aba !== null ? `, aba "${aba}"` : ""})
          </legend>
          {aba !== null && <p className="text-xs text-suave sm:col-span-2">Lida a primeira aba da planilha. Se os itens estão em outra aba, coloque-a em primeiro lugar no Excel e escolha o arquivo de novo.</p>}
          {NOMES_DOS_CAMPOS.map((nome) => (
            <label key={nome} className="block text-sm">{CAMPOS_DO_CATALOGO[nome].rotulo}{CAMPOS_DO_CATALOGO[nome].obrigatorio && <span className="text-perigo"> *</span>}
              <select name={`coluna_${nome}`} required={CAMPOS_DO_CATALOGO[nome].obrigatorio} value={mapa[nome] === undefined ? "" : String(mapa[nome])}
                onChange={(e) => setMapa((m) => ({ ...m, [nome]: e.target.value === "" ? undefined : Number(e.target.value) }))} className={campo}>
                <option value="">{CAMPOS_DO_CATALOGO[nome].obrigatorio ? "escolha a coluna" : "não tem no arquivo"}</option>
                {colunas.map((c, i) => <option key={i} value={i}>{`${c} (coluna ${colunaExcel(i)})`}</option>)}
              </select>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}
