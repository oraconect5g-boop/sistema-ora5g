"use client";

import { CheckCircle2, Scale, Upload } from "lucide-react";
import { useState } from "react";

import { Aviso, Botao, Cartao, Selo } from "../../../../componentes/ui";
import { unidadesQueEntram, type CargaDemo, type DecisaoDaCarga } from "../../../../demo/dados/fluxos-novos";
import { RESOLUCOES, RESOLUCOES_EM_BLOCO, ROTULOS_DAS_ACOES, ROTULOS_DAS_RESOLUCOES, type Resolucao } from "../../../../lib/estoque/carga-regras";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const TOM: Record<string, "sucesso" | "info" | "aviso" | "perigo" | "neutro"> = { entrar: "sucesso", serializado: "info", conferir: "aviso", sem_produto: "perigo", nada: "neutro" };

// A prévia da carga na demonstração (DEMO-b; a tela real é /estoque/carga/[id], dos lotes REIN-b, REIN-c e AUD-b). A linha
// com o físico maior que o disponível espera a decisão de quem importa, com o motivo (de 3 a 200 letras): lançar só o
// disponível, lançar o físico conferido na loja ou deixar de fora. Aplicar fica travado enquanto faltar decisão (a tela real
// recusa com OR042). Tudo fica no navegador: nada é gravado.
export function DecidirCarga({ carga }: { carga: CargaDemo }) {
  const [decisoes, setDecisoes] = useState<Record<number, DecisaoDaCarga>>({});
  const [abertas, setAbertas] = useState<Record<number, { resolucao: Resolucao | null; motivo: string }>>({});
  const [bloco, setBloco] = useState<{ resolucao: Resolucao | null; motivo: string }>({ resolucao: null, motivo: "" });
  const [aplicada, setAplicada] = useState(false);
  const pendentes = carga.linhas.filter((l) => l.acao === "conferir" && !decisoes[l.ordem]);
  const entram = unidadesQueEntram(carga, decisoes);
  const aparelhos = carga.linhas.filter((l) => l.acao === "serializado").reduce((s, l) => s + l.fisico, 0);

  const decidir = (ordens: readonly number[], d: DecisaoDaCarga) => setDecisoes((atual) => ({ ...atual, ...Object.fromEntries(ordens.map((o) => [o, d])) }));

  return (
    <>
      <Cartao className="mt-4" titulo="As linhas da loja" subtitulo="Cada linha do relatório com o que acontece com ela" icone={Upload}>
        <ul className="divide-y divide-borda text-sm">
          {carga.linhas.map((l) => {
            const d = decisoes[l.ordem];
            const aberta = abertas[l.ordem];
            return (
              <li key={l.ordem} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{`${l.ordem}. ${l.nome}`}<span className="numeros text-xs font-normal text-suave">{` · ${l.codigo}`}</span></p>
                    <p className="numeros text-xs text-suave">{`Físico ${l.fisico}${l.disponivel === null ? "" : ` · disponível ${l.disponivel}`} · ${l.detalhe}`}</p>
                  </div>
                  <Selo tom={d ? "sucesso" : TOM[l.acao] ?? "neutro"}>{d ? "Decidida" : ROTULOS_DAS_ACOES[l.acao]}</Selo>
                </div>
                {l.acao === "conferir" && !aplicada && (d ? (
                  <p className="mt-1 text-xs">
                    {`${ROTULOS_DAS_RESOLUCOES[d.resolucao].titulo} · motivo: ${d.motivo}. `}
                    <button type="button" className="font-semibold text-acao" onClick={() => setDecisoes((atual) => Object.fromEntries(Object.entries(atual).filter(([o]) => Number(o) !== l.ordem)))}>Mudar</button>
                  </p>
                ) : aberta ? (
                  <fieldset className="mt-2 space-y-2 rounded-xl border border-borda p-3">
                    <legend className="px-1 text-xs font-semibold">O que fazer com a diferença</legend>
                    {RESOLUCOES.map((r) => (
                      <label key={r} className="flex min-h-11 items-start gap-2 text-sm">
                        <input type="radio" name={`resolucao-${l.ordem}`} checked={aberta.resolucao === r} onChange={() => setAbertas({ ...abertas, [l.ordem]: { ...aberta, resolucao: r } })} className="mt-1 size-4 accent-acao" />
                        <span><strong>{ROTULOS_DAS_RESOLUCOES[r].titulo}</strong><span className="block text-xs text-suave">{ROTULOS_DAS_RESOLUCOES[r].detalhe}</span></span>
                      </label>
                    ))}
                    <label className="block text-xs font-medium">Motivo (fica registrado)
                      <input value={aberta.motivo} maxLength={200} onChange={(e) => setAbertas({ ...abertas, [l.ordem]: { ...aberta, motivo: e.target.value } })} className={campo} />
                    </label>
                    <Botao tamanho="sm" disabled={aberta.resolucao === null || aberta.motivo.trim().length < 3}
                      onClick={() => { if (aberta.resolucao) decidir([l.ordem], { resolucao: aberta.resolucao, motivo: aberta.motivo.trim() }); }}>
                      Decidir esta linha
                    </Botao>
                  </fieldset>
                ) : (
                  <Botao tamanho="sm" variante="secundario" className="mt-2" onClick={() => setAbertas({ ...abertas, [l.ordem]: { resolucao: null, motivo: "" } })}>
                    <Scale className="size-4" aria-hidden />Decidir
                  </Botao>
                ))}
              </li>
            );
          })}
        </ul>
      </Cartao>

      {!aplicada && pendentes.length > 1 && (
        <Cartao className="mt-4" titulo={`Decidir de uma vez as ${pendentes.length} linhas sem decisão`} icone={Scale}
          subtitulo="Só as decisões que não liberam o que pode estar comprometido. Lançar o físico é linha a linha, depois de conferir na loja.">
          <div className="space-y-2">
            {RESOLUCOES_EM_BLOCO.map((r) => (
              <label key={r} className="flex min-h-11 items-start gap-2 text-sm">
                <input type="radio" name="resolucao-em-bloco" checked={bloco.resolucao === r} onChange={() => setBloco({ ...bloco, resolucao: r })} className="mt-1 size-4 accent-acao" />
                <span><strong>{ROTULOS_DAS_RESOLUCOES[r].titulo}</strong><span className="block text-xs text-suave">{ROTULOS_DAS_RESOLUCOES[r].detalhe}</span></span>
              </label>
            ))}
            <label className="block text-xs font-medium">Motivo (fica registrado)
              <input value={bloco.motivo} maxLength={200} onChange={(e) => setBloco({ ...bloco, motivo: e.target.value })} className={campo} />
            </label>
            <Botao tamanho="sm" disabled={bloco.resolucao === null || bloco.motivo.trim().length < 3}
              onClick={() => { if (bloco.resolucao) decidir(pendentes.map((l) => l.ordem), { resolucao: bloco.resolucao, motivo: bloco.motivo.trim() }); }}>
              Decidir as linhas
            </Botao>
          </div>
        </Cartao>
      )}

      <Cartao className="mt-4" titulo="Aplicar" icone={CheckCircle2}
        subtitulo={`${entram.unidades} unidades de ${entram.linhas} acessórios entram no estoque da ${carga.loja}. Os ${aparelhos} aparelhos entram pelo IMEI, na conferência.`}>
        {aplicada ? (
          <Aviso tom="sucesso" titulo="Carga aplicada (simulação)">
            {`${entram.unidades} unidades de ${entram.linhas} acessórios entraram no estoque da ${carga.loja} pelo livro, uma vez. Desfazer devolve pelo livro o que ainda estiver livre na loja.`}
          </Aviso>
        ) : (
          <div className="space-y-2">
            {pendentes.length > 0 && <p className="text-sm text-aviso">{`Falta decidir ${pendentes.length === 1 ? "1 linha" : `${pendentes.length} linhas`}: a carga com linha sem decisão não se aplica.`}</p>}
            <Botao disabled={pendentes.length > 0} onClick={() => setAplicada(true)}>Aplicar a carga</Botao>
          </div>
        )}
      </Cartao>
    </>
  );
}
