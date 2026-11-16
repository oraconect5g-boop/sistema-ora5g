import { EsqueletoDeTela } from "../../componentes/EsqueletoDeTela";

// Aparece no instante do toque, enquanto o servidor monta a tela (lote VEL-a). Sem dado algum.
export default function CarregandoEstoque() {
  return <EsqueletoDeTela rotulo="Carregando o estoque" largura="max-w-6xl" />;
}
