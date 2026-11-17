import { EsqueletoDeTela } from "../../componentes/EsqueletoDeTela";

// Aparece no instante do toque, enquanto o servidor monta a tela (lote VEL-a). Sem dado algum.
export default function CarregandoOperacao() {
  return <EsqueletoDeTela rotulo="Carregando a saúde da operação" largura="max-w-5xl" />;
}
