import { Download } from "lucide-react";

import { comFormato } from "../lib/csv";
import { classeBotao } from "./ui";

// Baixar uma planilha do servidor nos dois formatos (lote FIN-009c: ORA-FIN-009): o Excel, que guarda número, data e
// o IMEI inteiro, e o CSV, para outros sistemas. É o mesmo endereço, com ?formato= (a rota confere a permissão e o
// recorte de novo). "botao" para o cabeçalho da tela; "ligacao" para dentro de um cartão. Não sai no papel.
export function BaixarPlanilha({ endereco, rotulo, estilo = "botao" }: { endereco: string; rotulo: string; estilo?: "botao" | "ligacao" }) {
  const ligacao = estilo === "ligacao";
  return (
    <span className={`nao-imprimir inline-flex flex-wrap items-center ${ligacao ? "gap-x-3 gap-y-1 text-xs font-semibold" : "gap-x-3 gap-y-2"}`}>
      <a href={comFormato(endereco, "xlsx")} download className={ligacao ? "inline-flex min-h-8 items-center gap-1 text-acao" : classeBotao("secundario", "md")}>
        <Download aria-hidden className={ligacao ? "size-3.5" : "size-4"} />
        {rotulo} (Excel)
      </a>
      <a href={comFormato(endereco, "csv")} download aria-label={`${rotulo} em CSV`}
        className={`inline-flex items-center text-acao hover:underline ${ligacao ? "min-h-8" : "min-h-11 text-sm font-semibold"}`}>CSV</a>
    </span>
  );
}
