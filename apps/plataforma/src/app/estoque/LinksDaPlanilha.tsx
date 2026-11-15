import { BaixarPlanilha } from "../../componentes/BaixarPlanilha";
import { enderecoDaPlanilha, type ParteDaPlanilha } from "../../lib/estoque/planilha";

// As duas formas de baixar uma planilha do estoque (lote FIN-009b): o Excel, que guarda o IMEI e o ICCID inteiros e
// a quantidade como número, e o CSV, para outros sistemas. Sem `loja`, o recorte é o padrão da rota (a loja do turno).
export function LinksDaPlanilha({ parte, loja, rotulo }: { parte: ParteDaPlanilha; loja?: string | null; rotulo: string }) {
  return <BaixarPlanilha endereco={enderecoDaPlanilha(parte, "xlsx", loja)} rotulo={rotulo} estilo="ligacao" />;
}
