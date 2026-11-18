import { imeiValido, lerReais } from "@ora5g/dominio";
import { CircleAlert, FileSpreadsheet, FileUp, ListChecks, UserCheck } from "lucide-react";
import type { Metadata } from "next";

import { SemPermissao } from "../../../componentes/SemPermissao";
import { Aviso, BotaoLink, Cartao, Celula, Etapas, Indicador, Selo, Tabela, TituloPagina } from "../../../componentes/ui";
import { LINHAS_CSV_REIN } from "../../../demo/dados";
import { acessoDaPagina } from "../../../demo/sessao";
import { numero } from "../../../lib/formato";
import { AprovarImportacao } from "./Aprovar";

export const metadata: Metadata = { title: "Importar CSV da Rein" };

// Prévia do importador (ORA-009): as linhas são conferidas pelas regras de negócio reais do domínio.
function conferirLinhas() {
  const vistos = new Map<string, number>();
  return LINHAS_CSV_REIN.map((l) => {
    const problemas: string[] = [];
    try { lerReais(l.preco); } catch { problemas.push("Preço inválido"); }
    if (l.custo.trim() === "") problemas.push("Sem custo: o limite de desconto por margem não funciona");
    if (l.imei) {
      if (!imeiValido(l.imei)) problemas.push("IMEI com dígito verificador inválido");
      const anterior = vistos.get(l.imei);
      if (anterior) problemas.push(`IMEI repetido (linha ${anterior})`);
      else vistos.set(l.imei, l.linha);
    }
    return { ...l, problemas };
  });
}

const ETAPAS = ["Enviar arquivo", "Prévia e conferência", "Aprovação do dono", "Importado", "Conferência física na loja"];

export default async function Importacao() {
  const contexto = await acessoDaPagina("importacao");
  if (!contexto.permitido) return <SemPermissao perfil={contexto.perfil} pagina="Importar CSV da Rein" />;
  const linhas = conferirLinhas();
  const comErro = linhas.filter((l) => l.problemas.length > 0).length;
  const papel = contexto.perfil === "dono" ? "dono" : "administrador";

  return (
    <>
      <TituloPagina titulo="Importar estoque da Rein (prévia)" subtitulo="Só por arquivo, nunca pela API da Rein. Nada é gravado até o dono aprovar." acao={<AprovarImportacao papel={papel} prontas={linhas.length - comErro} comProblema={comErro} />} />
      {/* DEMO-b: a carga do estoque de cada loja pelo relatório da Rein (REIN-b e REIN-c) tem a tela dela. */}
      <p className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <BotaoLink href="/demo/estoque/carga" tamanho="sm" variante="secundario">Carga do estoque por loja</BotaoLink>
        <span className="text-xs text-suave">A quantidade de cada loja, com a decisão das linhas em que o físico passa do disponível.</span>
      </p>
      <Cartao>
        <Etapas etapas={ETAPAS} atual={papel === "dono" ? 2 : 1} rotulo="Etapas da importação" />
        <ol className="mt-3 hidden grid-cols-5 gap-2 text-center text-xs text-suave sm:grid">
          {ETAPAS.map((e) => <li key={e}>{e}</li>)}
        </ol>
      </Cartao>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Indicador rotulo="Linhas lidas" valor={numero(linhas.length)} icone={FileSpreadsheet} detalhe="Arquivo de exemplo" />
        <Indicador rotulo="Prontas" valor={numero(linhas.length - comErro)} icone={ListChecks} tom="bom" detalhe="Entram na aprovação" />
        <Indicador rotulo="Com problema" valor={numero(comErro)} icone={CircleAlert} tom="atencao" detalhe="Ficam de fora até corrigir" />
        <Indicador rotulo="Quem aprova" valor="Dono" icone={UserCheck} detalhe="O administrador executa" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Cartao titulo="Enviar arquivo" subtitulo="CSV ou planilha exportada da Rein" icone={FileUp}>
          <div className="rounded-xl border-2 border-dashed border-borda-forte bg-fundo/60 px-4 py-8 text-center">
            <FileSpreadsheet aria-hidden className="mx-auto size-8 text-suave" />
            <p className="mt-2 text-sm font-semibold">estoque-santa-candida-exemplo.csv</p>
            <p className="text-xs text-suave">{linhas.length} linhas · arquivo de exemplo da demonstração</p>
          </div>
          <p className="mt-3 text-xs text-suave">O envio de arquivos reais liga quando o formato do CSV da Rein for confirmado (pendência B3). O mesmo arquivo importado duas vezes não duplica nada.</p>
        </Cartao>
        <Cartao titulo="Prévia do arquivo" subtitulo="Cada linha conferida pelas mesmas regras do sistema" className="xl:col-span-2">
          <Tabela colunas={["Linha", "SKU", "Produto", "Preço", "Custo", "Qtd.", "Conferência"]} legenda="Prévia da importação" minimo="min-w-[46rem]">
            {linhas.map((l) => (
              <tr key={l.linha} className={l.problemas.length > 0 ? "bg-perigo-clara/30" : ""}>
                <Celula className="numeros">{l.linha}</Celula><Celula className="text-suave">{l.sku}</Celula><Celula>{l.nome}</Celula><Celula className="numeros">R$ {l.preco}</Celula>
                <Celula className="numeros">{l.custo ? `R$ ${l.custo}` : "—"}</Celula><Celula className="numeros">{l.quantidade}</Celula>
                <Celula>{l.problemas.length === 0 ? <Selo tom="sucesso" ponto>Pronta</Selo> : <span className="flex flex-col items-start gap-1">{l.problemas.map((p) => <Selo key={p} tom="perigo">{p}</Selo>)}</span>}</Celula>
              </tr>
            ))}
          </Tabela>
        </Cartao>
      </div>
      <Aviso tom="aviso" className="mt-4">Depois da importação, os IMEIs precisam ser conferidos fisicamente na loja antes de a Ora assumir o estoque.</Aviso>
    </>
  );
}
