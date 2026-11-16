import { EsqueletoDeTela } from "../../componentes/EsqueletoDeTela";

// Aparece no instante do toque, enquanto o servidor monta a tela (lote VEL-a). Sem dado algum.
export default function CarregandoVender() {
  return <EsqueletoDeTela rotulo="Carregando o PDV" />;
}
