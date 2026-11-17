import { EsqueletoDeTela } from "../../componentes/EsqueletoDeTela";

// Aparece no instante do toque, enquanto o servidor monta a tela (lote VEL-a). Sem dado algum.
export default function CarregandoVendas() {
  return <EsqueletoDeTela rotulo="Carregando as vendas" largura="max-w-5xl" />;
}
