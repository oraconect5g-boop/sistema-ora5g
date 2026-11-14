import { Link2, Plus } from "lucide-react";
import type { ReactNode } from "react";

import { Botao, Selo } from "../../componentes/ui";
import { CANAIS, rotuloDoCodigo, type CodigoDoCanal } from "../../lib/catalogo/codigos";
import { desligarCodigo, ligarCodigo } from "./acoes";
import { campo, Motivo, resumo, rotulo } from "./formulario";

// CAT-009: os códigos da variação em outros canais (o da Rein, o do site, o do anúncio). Só apontam para a variação;
// ligar e desligar pedem motivo (auditoria). O banco recusa o mesmo código ativo em duas variações.
export function CodigosDaVariante({ variante, produto, codigos, oculto }: { variante: { id: string; sku: string }; produto: string; codigos: CodigoDoCanal[]; oculto: ReactNode }) {
  return (
    <>
      {codigos.length > 0 && <p className="mt-1 flex flex-wrap gap-1">{codigos.map((c) => <Selo key={c.id} tom="info">{rotuloDoCodigo(c)}</Selo>)}</p>}
      <details className="mt-1">
        <summary className={resumo}><Link2 aria-hidden className="size-4" /> Códigos em outros canais{codigos.length > 0 ? ` (${codigos.length})` : ""}</summary>
        <div className="mt-2 space-y-3">
          <p className="text-xs text-suave">O código de outro canal só aponta para esta variação: venda, preço e estoque continuam pelo SKU {variante.sku}. A busca acha a variação por ele.</p>
          {codigos.map((c) => (
            <form key={c.id} action={desligarCodigo} className="flex flex-wrap items-end gap-2 rounded-xl border border-borda p-2">
              <input type="hidden" name="vinculo" value={c.id} /><input type="hidden" name="produto" value={produto} />{oculto}
              <p className="w-full text-sm font-semibold">{rotuloDoCodigo(c)}</p>
              <label className="min-w-0 flex-1 text-sm font-medium">Motivo para desligar
                <input name="motivo" required minLength={3} maxLength={200} placeholder="Anúncio encerrado" className={campo} />
              </label>
              <Botao type="submit" tamanho="sm" variante="secundario">Desligar</Botao>
            </form>
          ))}
          <form action={ligarCodigo} className="grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="variante" value={variante.id} /><input type="hidden" name="produto" value={produto} />{oculto}
            <label className={rotulo}>Canal
              <select name="canal" required className={campo} defaultValue="rein">{Object.entries(CANAIS).map(([valor, nome]) => <option key={valor} value={valor}>{nome}</option>)}</select>
            </label>
            <label className={rotulo}>Código no canal<input name="codigo" required maxLength={80} pattern="\S{1,80}" placeholder="12345" className={campo} /></label>
            <label className={rotulo}>SKU no canal (se houver)<input name="sku_no_canal" maxLength={80} className={campo} /></label>
            <div className="sm:col-span-3"><Motivo exemplo="Código da Rein para a transição" /></div>
            <Botao type="submit" tamanho="sm" className="sm:col-span-3"><Plus aria-hidden className="size-4" /> Ligar código</Botao>
          </form>
        </div>
      </details>
    </>
  );
}
