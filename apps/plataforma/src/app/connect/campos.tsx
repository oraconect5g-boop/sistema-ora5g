import { centavosDoBanco } from "../../lib/dinheiro";
import { brl } from "../../lib/formato";

// Lote CONNECT-m (25/11/2026): as peças dos formulários das abas Ativar chip, Recarga e Portabilidade, no formato da
// demonstração (os planos em cartões). CONNECT-n: num arquivo sem nada do servidor, para o assistente de ativação (que roda
// no navegador) usar as mesmas peças. O que vem do banco chega pronto: o plano e os códigos das listas oficiais da Nogle e o
// serviço pago no caixa já com o texto da opção (montado no servidor, em formularios.tsx).

export const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
export const rotulo = "block text-sm font-medium";

/** Um plano da lista oficial da Nogle (o valor de face vem da Nogle, nunca da tela). */
export type PlanoDaNogle = { codigo: string; nome: string; valor_centavos: number | null };
/** Um serviço pago no caixa (o item da venda concluída, ainda livre), com o texto da opção. */
export type OpcaoDePago = { id: string; rotulo: string };

/** Os planos da lista oficial da Nogle em cartões (como na demonstração). */
export function PlanosEmCartoes({ planos }: { planos: readonly PlanoDaNogle[] }) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">Plano (lista da Nogle)</legend>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {planos.map((p) => (
          <label key={p.codigo} className="flex min-h-16 cursor-pointer flex-col justify-center rounded-xl border border-borda bg-white p-3 text-sm has-[:checked]:border-acao has-[:checked]:bg-acao/5 has-[:checked]:ring-2 has-[:checked]:ring-acao/20 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-acao/40">
            <input type="radio" name="plano" value={p.codigo} required className="sr-only" />
            <span className="font-semibold">{p.nome}</span>
            <span className="numeros font-semibold text-acao">{brl(centavosDoBanco(p.valor_centavos ?? 0))}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// CONNECT-l (D-062, o proprietário em 25/11: "não com o crédito da Nogle"): o Pix da Nogle é o padrão. Com o serviço
// recebido no caixa, quem paga o link é a loja (o cliente já pagou); sem ele, o cliente paga direto à Nogle, na hora.
export function PagamentoANogle({ pagos }: { pagos: readonly OpcaoDePago[] }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Pagamento à Nogle</legend>
      <label className="flex items-start gap-2 rounded-xl border border-borda p-3 text-sm has-[:checked]:border-acao has-[:checked]:bg-acao/5">
        <input type="radio" name="metodo" value="LINK" defaultChecked className="mt-1 size-4" />
        <span><span className="font-semibold">Pix da Nogle</span> (o padrão): a Nogle devolve o pagamento, que aparece aqui com o QR Code. Com o serviço recebido no caixa, a loja paga com o dinheiro do cliente; sem ele, o cliente paga direto à Nogle, na hora.</span>
      </label>
      <label className="flex items-start gap-2 rounded-xl border border-borda p-3 text-sm has-[:checked]:border-acao has-[:checked]:bg-acao/5">
        <input type="radio" name="metodo" value="SALDO" className="mt-1 size-4" />
        <span><span className="font-semibold">Crédito da carteira da Ora na Nogle</span>: só com o serviço pago no caixa e com crédito na carteira.</span>
      </label>
      <label className={rotulo}>Serviço pago no caixa
        <select name="venda_item" className={campo} defaultValue=""><option value="">Nenhum: o cliente paga o Pix da Nogle direto</option>{pagos.map((p) => <option key={p.id} value={p.id}>{p.rotulo}</option>)}</select>
      </label>
      <p className="text-xs text-suave">A venda escolhida tem de ser do mesmo plano da operação e vale uma operação só.</p>
    </fieldset>
  );
}

/** O serviço pago no caixa da portabilidade (opcional: a portabilidade não tem pagamento à Nogle). */
export function ServicoPagoOpcional({ pagos }: { pagos: readonly OpcaoDePago[] }) {
  return (
    <label className={rotulo}>Serviço pago no caixa (se houver)
      <select name="venda_item" className={campo} defaultValue=""><option value="">—</option>{pagos.map((p) => <option key={p.id} value={p.id}>{p.rotulo}</option>)}</select>
    </label>
  );
}
