import { QrCode } from "../../componentes/QrCode";
import type { MaterialDoEsimNaTela, PagamentoNaNogle } from "../../lib/connect/regras";
import { quando } from "./lista";

// AUD-f (auditoria de e7f55b2): três coisas diferentes que a tela separava mal. O LINK de pagamento é uma página https da
// Nogle (o QR Code dele abre a página); o PIX COPIA E COLA é o código EMV do Pix (o QR Code dele é o próprio Pix); o QR de
// INSTALAÇÃO do eSIM é o código de ativação LPA (o celular novo lê e instala a linha). Os QR Codes são desenhados no
// servidor (sem imagem de fora nem script). Quem paga muda o texto: a loja (o cliente já pagou o plano no caixa: o QR não é
// para ele) ou o cliente, na hora.

const textoDoPagador = {
  loja: "O cliente já pagou o plano no caixa: não mostre este pagamento a ele. O dono ou o gerente paga com o dinheiro recebido, pelo celular.",
  cliente: "O cliente paga agora, no celular dele.",
} as const;

// compacto (a fila do Pix, para quem paga pelo próprio celular): sem os QR Codes, só o link e o código para copiar.
export function PagamentoDaNogle({ numero, pagamento, compacto = false }: { numero: number; pagamento: PagamentoNaNogle; compacto?: boolean }) {
  if (pagamento.estado === "confirmado") {
    return (
      <p className="text-xs font-medium text-sucesso">
        Pagamento confirmado na Nogle ({quando(pagamento.em)}): não pague de novo. A linha ainda não está provada; ela só conta quando a Nogle
        mostrar o chip ativo ou quando a gerência conferir.
      </p>
    );
  }
  if (pagamento.estado === "sem_meio") {
    return (
      <p className="rounded-botao bg-aviso-clara/50 p-2 text-xs">
        A Nogle não devolveu o link de pagamento nem o Pix copia e cola desta operação.{" "}
        {pagamento.idNaNogle ? `Confira o pagamento no painel da Nogle (ativação nº ${pagamento.idNaNogle} na Nogle).` : "Ela também não devolveu o número da operação: confira no painel da Nogle pelo cliente e pelo chip."}{" "}
        Não registre outra operação: o servidor não reenvia.
      </p>
    );
  }
  if (compacto) {
    return (
      <div className="space-y-1 text-xs">
        {pagamento.link && <a className="font-semibold text-acao underline" href={pagamento.link} rel="noreferrer noopener" target="_blank">Abrir a página de pagamento da Nogle</a>}
        {pagamento.pix && (
          <textarea readOnly defaultValue={pagamento.pix} aria-label={`Pix copia e cola da operação nº ${numero}`}
            className="numeros block h-14 w-full max-w-md rounded-botao border border-borda bg-white p-2 text-xs text-black" />
        )}
      </div>
    );
  }
  return (
    <div className="mt-2 space-y-2 rounded-botao border border-borda p-3 text-xs">
      <p className="text-sm font-semibold">{pagamento.quemPaga === "loja" ? "Pagamento da Nogle: a loja paga" : "Pagamento da Nogle: o cliente paga agora"}</p>
      <p className="text-suave">{textoDoPagador[pagamento.quemPaga]} A operação segue sozinha quando a Nogle confirmar.</p>
      <div className="flex flex-wrap items-start gap-4">
        {pagamento.pix && (
          <div className="min-w-0 max-w-xs space-y-1">
            <p className="font-semibold">Pix copia e cola</p>
            <QrCode texto={pagamento.pix} rotulo={`QR Code do Pix copia e cola da operação nº ${numero}`} className="size-40 rounded-botao bg-white" />
            <p className="text-suave">Leia no app do banco, ou copie o código:</p>
            <textarea readOnly defaultValue={pagamento.pix} aria-label={`Pix copia e cola da operação nº ${numero}`}
              className="numeros h-20 w-full rounded-botao border border-borda bg-white p-2 text-xs text-black" />
          </div>
        )}
        {pagamento.link && (
          <div className="min-w-0 max-w-xs space-y-1">
            <p className="font-semibold">Link de pagamento da Nogle</p>
            <QrCode texto={pagamento.link} rotulo={`QR Code do link de pagamento da operação nº ${numero}`} className="size-40 rounded-botao bg-white" />
            <p className="text-suave">Este QR Code abre a página de pagamento da Nogle (não é o Pix copia e cola).</p>
            <a className="inline-block font-semibold text-acao underline" href={pagamento.link} rel="noreferrer noopener" target="_blank">Abrir a página de pagamento da Nogle</a>
          </div>
        )}
      </div>
    </div>
  );
}

// O material de instalação do eSIM fica fechado (abre num toque) e só para quem pode ver (podeVerMaterialDoEsim).
export function MaterialDoEsim({ numero, material }: { numero: number; material: MaterialDoEsimNaTela }) {
  return (
    <details className="rounded-botao border border-borda p-2 text-xs">
      <summary className="cursor-pointer font-semibold text-acao">Instalar o eSIM (mostre só ao cliente desta ativação)</summary>
      <div className="mt-2 flex flex-wrap items-start gap-4">
        {material.codigo && (
          <div className="min-w-0 max-w-xs space-y-1">
            <QrCode texto={material.codigo} rotulo={`QR Code de instalação do eSIM da operação nº ${numero}`} className="size-40 rounded-botao bg-white" />
            <p className="text-suave">No celular do cliente: Ajustes → Celular (ou Conexões) → Adicionar eSIM → ler o QR Code. Ou digite o código de ativação:</p>
            <textarea readOnly defaultValue={material.codigo} aria-label={`Código de ativação do eSIM da operação nº ${numero}`}
              className="numeros h-14 w-full rounded-botao border border-borda bg-white p-2 text-xs text-black" />
          </div>
        )}
        {material.link && (
          <p className="min-w-0 max-w-xs">
            <a className="font-semibold text-acao underline" href={material.link} rel="noreferrer noopener" target="_blank">Abrir o QR Code de instalação da Nogle</a>
            <span className="block text-suave">A página da Nogle com o QR Code do eSIM.</span>
          </p>
        )}
      </div>
    </details>
  );
}
