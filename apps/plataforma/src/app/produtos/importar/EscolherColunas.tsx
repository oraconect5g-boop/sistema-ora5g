"use client";

import { useState } from "react";

import { NOMES_CURTOS_DOS_TIPOS } from "../../../lib/catalogo/cadastro";
import {
  CAMPOS_DO_CATALOGO, NOMES_DOS_CAMPOS, TIPOS_ACEITOS, categoriasDoArquivo, rodapeDaPlanilha, sugerirMapeamento, tipoSugeridoDaCategoria, type Mapeamento, type TipoAceito,
} from "../../../lib/importacao/catalogo";
import { ErroDaPlanilha } from "../../../lib/importacao/csv";
import { descomprimirNoNavegador } from "../../../lib/importacao/descomprimir-navegador";
import { lerColunasDoArquivo, lerPlanilha } from "../../../lib/importacao/planilha";
import { ERROS_DA_IMPORTACAO, MAXIMO_DE_TIPOS_POR_CATEGORIA } from "../../../lib/importacao/regras";
import { colunaExcel } from "../../../lib/xlsx";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const ARQUIVOS_ACEITOS = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.csv,text/csv";

// Lê só o cabeçalho do arquivo no aparelho, para a pessoa dizer qual coluna é cada campo (com sugestão pelo nome da
// coluna e a letra da coluna no Excel). O arquivo inteiro vai para o servidor, que relê e confere tudo de novo. Desde o
// CAT-002b, também a planilha do Excel (.xlsx), lida da primeira aba. Desde o REIN-d, com a coluna da categoria escolhida,
// lista as categorias do arquivo para a pessoa dizer o tipo de cada uma (no relatório da Rein, "CELULARES" é aparelho).
export function EscolherColunas({ candidato = null }: {
  /** F18-02: a última linha que a prévia anterior apontou como possível rodapé; com ela, a escolha de deixá-la de fora. */
  candidato?: { linha: number } | null;
}) {
  const [colunas, setColunas] = useState<string[] | null>(null);
  const [aba, setAba] = useState<string | null>(null);
  const [mapa, setMapa] = useState<Mapeamento>({});
  const [problema, setProblema] = useState<string | null>(null);
  // REIN-d: o tipo de cada categoria do arquivo. As categorias são lidas no aparelho, da coluna escolhida como categoria;
  // a escolha vai junto com o envio (o servidor relê o arquivo e confere tudo de novo).
  const [arquivoEscolhido, setArquivoEscolhido] = useState<File | null>(null);
  const [categorias, setCategorias] = useState<{ nome: string; linhas: number }[] | "lendo" | "falha" | null>(null);
  const [tipos, setTipos] = useState<Record<string, TipoAceito>>({});

  /** Lê o arquivo inteiro no aparelho e lista as categorias da coluna dada, com o tipo que o nome sugere. */
  async function lerCategorias(arquivo: File | null, mapaAtual: Mapeamento) {
    setTipos({});
    if (!arquivo || mapaAtual.categoria === undefined) {
      setCategorias(null);
      return;
    }
    setCategorias("lendo");
    try {
      const planilha = await lerPlanilha(new Uint8Array(await arquivo.arrayBuffer()), descomprimirNoNavegador);
      // O rodapé de totais não é item: fica fora da lista (só com o SKU e o nome escolhidos dá para reconhecê-lo).
      const rodape = mapaAtual.sku !== undefined && mapaAtual.nome !== undefined ? rodapeDaPlanilha(planilha, mapaAtual)?.posicao ?? null : null;
      const lidas = categoriasDoArquivo(planilha, mapaAtual.categoria, rodape);
      setCategorias(lidas);
      setTipos(Object.fromEntries(lidas.flatMap((c) => { const tipo = tipoSugeridoDaCategoria(c.nome); return tipo ? [[c.nome, tipo]] : []; })));
    } catch {
      setCategorias("falha");
    }
  }

  async function aoEscolher(evento: React.ChangeEvent<HTMLInputElement>) {
    setProblema(null);
    setColunas(null);
    setAba(null);
    setCategorias(null);
    setTipos({});
    const arquivo = evento.target.files?.[0];
    setArquivoEscolhido(arquivo ?? null);
    if (!arquivo) return;
    try {
      const lido = await lerColunasDoArquivo(arquivo, descomprimirNoNavegador);
      const sugerido = sugerirMapeamento(lido.colunas);
      setColunas(lido.colunas);
      setAba(lido.aba);
      setMapa(sugerido);
      await lerCategorias(arquivo, sugerido);
    } catch (e) {
      setProblema(e instanceof ErroDaPlanilha ? ERROS_DA_IMPORTACAO[e.motivo] : ERROS_DA_IMPORTACAO.arquivo);
    }
  }

  function aoMudarColuna(nome: keyof Mapeamento, valor: string) {
    const novo = { ...mapa, [nome]: valor === "" ? undefined : Number(valor) };
    setMapa(novo);
    // A lista das categorias depende da coluna da categoria (e do SKU e do nome, para deixar o rodapé de fora).
    if (nome === "categoria" || ((nome === "sku" || nome === "nome") && novo.categoria !== undefined)) void lerCategorias(arquivoEscolhido, novo);
  }
  const listaDeCategorias = Array.isArray(categorias) ? categorias.slice(0, MAXIMO_DE_TIPOS_POR_CATEGORIA) : [];

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">Planilha (Excel .xlsx ou CSV, até 5 MB e 10.000 linhas; acima de 2.000, a prévia sai em partes)
        <input type="file" name="arquivo" required accept={ARQUIVOS_ACEITOS} onChange={aoEscolher} className="mt-1 block w-full text-sm file:mr-3 file:min-h-11 file:rounded-botao file:border-0 file:bg-acao-clara file:px-4 file:font-semibold file:text-acao" />
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
                onChange={(e) => aoMudarColuna(nome, e.target.value)} className={campo}>
                <option value="">{CAMPOS_DO_CATALOGO[nome].obrigatorio ? "escolha a coluna" : "não tem no arquivo"}</option>
                {colunas.map((c, i) => <option key={i} value={i}>{`${c} (coluna ${colunaExcel(i)})`}</option>)}
              </select>
            </label>
          ))}
          {categorias === "lendo" && <p className="text-xs text-suave sm:col-span-2">Lendo as categorias do arquivo…</p>}
          {categorias === "falha" && <p className="text-xs text-aviso sm:col-span-2">Não deu para listar as categorias do arquivo neste aparelho. O envio continua valendo: todas as linhas ficam com o tipo padrão, escolhido abaixo.</p>}
          {listaDeCategorias.length > 0 && (
            <fieldset className="rounded-2xl bg-fundo/70 p-3 sm:col-span-2">
              <legend className="px-1 text-sm font-medium">O tipo de cada categoria ({listaDeCategorias.length}{Array.isArray(categorias) && categorias.length > listaDeCategorias.length ? ` de ${categorias.length}` : ""} no arquivo)</legend>
              <p className="text-xs text-suave">
                Diga o que cada categoria é. <strong className="font-semibold">Aparelho</strong> e <strong className="font-semibold">chip</strong> entram no estoque um a um, com o IMEI ou o ICCID;
                acessório entra por quantidade. O tipo de um item não muda depois por outra importação: confira antes de enviar. A categoria sem escolha fica com o tipo padrão, escolhido abaixo.
              </p>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {listaDeCategorias.map((c) => (
                  <li key={c.nome}>
                    <label className="block text-sm">{`${c.nome} (${c.linhas} ${c.linhas === 1 ? "item" : "itens"})`}
                      <select value={tipos[c.nome] ?? ""} className={campo}
                        onChange={(e) => setTipos((t) => {
                          const resto = Object.fromEntries(Object.entries(t).filter(([nome]) => nome !== c.nome)) as Record<string, TipoAceito>;
                          return e.target.value === "" ? resto : { ...resto, [c.nome]: e.target.value as TipoAceito };
                        })}>
                        <option value="">o tipo padrão</option>
                        {TIPOS_ACEITOS.map((t) => <option key={t} value={t}>{NOMES_CURTOS_DOS_TIPOS[t]}</option>)}
                      </select>
                    </label>
                  </li>
                ))}
              </ul>
              <input type="hidden" name="tipos_por_categoria" value={JSON.stringify(tipos)} />
            </fieldset>
          )}
          {candidato && (
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="ultima_linha_de_fora" value="sim" className="mt-1 size-4 accent-acao" />
              <span>{`Deixar de fora a última linha (na prévia anterior, a linha ${candidato.linha}): é um rodapé, não um item. A decisão fica registrada na prévia.`}</span>
            </label>
          )}
        </fieldset>
      )}
    </div>
  );
}
