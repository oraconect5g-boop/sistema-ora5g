"use client";

import { useState } from "react";

import { sugerirMapaDaCarga, type ColunasDaLoja, type LojaDaCarga } from "../../../lib/estoque/carga";
import { ErroDaPlanilha } from "../../../lib/importacao/csv";
import { descomprimirNoNavegador } from "../../../lib/importacao/descomprimir-navegador";
import { lerColunasDoArquivo } from "../../../lib/importacao/planilha";
import { ERROS_DA_CARGA } from "../../../lib/estoque/carga-regras";
import { colunaExcel } from "../../../lib/xlsx";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const TIPOS_ACEITOS = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.csv,text/csv";

// A carga do estoque inicial por loja (lote REIN-b; ADR-021). Lê só o cabeçalho do arquivo no aparelho, para a pessoa
// dizer a coluna do código e, de cada loja, a do físico e a do disponível (com sugestão pelo nome da loja). O arquivo
// inteiro vai para o servidor, que relê e confere tudo de novo, e o banco classifica cada linha.
export function EscolherColunasDaCarga({ lojas }: { lojas: readonly LojaDaCarga[] }) {
  const [colunas, setColunas] = useState<string[] | null>(null);
  const [aba, setAba] = useState<string | null>(null);
  const [sku, setSku] = useState<number | undefined>(undefined);
  const [nome, setNome] = useState<number | undefined>(undefined);
  const [porLoja, setPorLoja] = useState<Record<string, Partial<ColunasDaLoja>>>({});
  const [problema, setProblema] = useState<string | null>(null);

  async function aoEscolher(evento: React.ChangeEvent<HTMLInputElement>) {
    setProblema(null);
    setColunas(null);
    setAba(null);
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    try {
      const lido = await lerColunasDoArquivo(arquivo, descomprimirNoNavegador);
      const sugestao = sugerirMapaDaCarga(lido.colunas, lojas);
      setColunas(lido.colunas);
      setAba(lido.aba);
      setSku(sugestao.sku);
      setNome(sugestao.nome);
      setPorLoja(sugestao.lojas);
    } catch (e) {
      setProblema(e instanceof ErroDaPlanilha ? ERROS_DA_CARGA[e.motivo] : ERROS_DA_CARGA.arquivo);
    }
  }

  const opcoes = (vazio: string) => [
    <option key="vazio" value="">{vazio}</option>,
    ...(colunas ?? []).map((c, i) => <option key={i} value={i}>{`${c} (coluna ${colunaExcel(i)})`}</option>),
  ];
  const mudarLoja = (loja: string, papel: keyof ColunasDaLoja, valor: string) =>
    setPorLoja((m) => ({ ...m, [loja]: { ...m[loja], [papel]: valor === "" ? undefined : Number(valor) } }));

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">Relatório de produtos (Excel .xlsx ou CSV, até 5 MB)
        <input type="file" name="arquivo" required accept={TIPOS_ACEITOS} onChange={aoEscolher} className="mt-1 block w-full text-sm file:mr-3 file:min-h-11 file:rounded-botao file:border-0 file:bg-acao-clara file:px-4 file:font-semibold file:text-acao" />
      </label>
      {problema && <p role="alert" className="text-sm text-perigo">{problema}</p>}
      {colunas && (
        <>
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-1 text-sm font-medium">O produto ({colunas.length} colunas no arquivo{aba !== null ? `, aba "${aba}"` : ""})</legend>
            <label className="block text-sm">Código do produto (o mesmo do catálogo)<span className="text-perigo"> *</span>
              <select name="coluna_sku" required value={sku === undefined ? "" : String(sku)} onChange={(e) => setSku(e.target.value === "" ? undefined : Number(e.target.value))} className={campo}>
                {opcoes("escolha a coluna")}
              </select>
            </label>
            <label className="block text-sm">Nome do produto (ajuda a achar o rodapé de totais)
              <select name="coluna_nome" value={nome === undefined ? "" : String(nome)} onChange={(e) => setNome(e.target.value === "" ? undefined : Number(e.target.value))} className={campo}>
                {opcoes("não tem no arquivo")}
              </select>
            </label>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">A quantidade de cada loja (deixe em branco a loja que não está no arquivo)</legend>
            {lojas.map((loja) => (
              <div key={loja.id} className="grid gap-2 rounded-botao border border-borda p-2 sm:grid-cols-[minmax(0,10rem)_1fr_1fr] sm:items-end">
                <p className="text-sm font-semibold">{loja.nome}</p>
                <label className="block text-xs">Físico
                  <select name={`fisico_${loja.id}`} value={porLoja[loja.id]?.fisico === undefined ? "" : String(porLoja[loja.id]?.fisico)}
                    onChange={(e) => mudarLoja(loja.id, "fisico", e.target.value)} className={campo}>{opcoes("não está no arquivo")}</select>
                </label>
                <label className="block text-xs">Disponível (opcional)
                  <select name={`disponivel_${loja.id}`} value={porLoja[loja.id]?.disponivel === undefined ? "" : String(porLoja[loja.id]?.disponivel)}
                    onChange={(e) => mudarLoja(loja.id, "disponivel", e.target.value)} className={campo}>{opcoes("não tem")}</select>
                </label>
              </div>
            ))}
          </fieldset>
        </>
      )}
    </div>
  );
}
