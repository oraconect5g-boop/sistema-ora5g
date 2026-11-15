import { Download } from "lucide-react";

import { enderecoDaPlanilha, type ParteDaPlanilha } from "../../lib/estoque/planilha";

// As duas formas de baixar uma planilha do estoque (lote FIN-009b): o Excel, que guarda o IMEI e o ICCID inteiros e
// a quantidade como número, e o CSV, para outros sistemas. Sem `loja`, o recorte é o padrão da rota (a loja do turno).
export function LinksDaPlanilha({ parte, loja, rotulo }: { parte: ParteDaPlanilha; loja?: string | null; rotulo: string }) {
  return (
    <span className="nao-imprimir flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold">
      <a href={enderecoDaPlanilha(parte, "xlsx", loja)} download className="inline-flex min-h-8 items-center gap-1 text-acao">
        <Download aria-hidden className="size-3.5" />{rotulo} (Excel)
      </a>
      <a href={enderecoDaPlanilha(parte, "csv", loja)} download aria-label={`${rotulo} em CSV`} className="inline-flex min-h-8 items-center text-acao">CSV</a>
    </span>
  );
}
