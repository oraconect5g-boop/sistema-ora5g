"use client";

import { CircleCheck, Send } from "lucide-react";
import { useState } from "react";

import { Dialogo } from "../../../componentes/Dialogo";
import { Aviso, Botao } from "../../../componentes/ui";

/** Administrador envia a prévia; o dono aprova (ADR-002: "Importar CSV da Rein: dono aprova, admin executa"). */
export function AprovarImportacao({ papel, prontas, comProblema }: { papel: "administrador" | "dono"; prontas: number; comProblema: number }) {
  const [feito, setFeito] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const acao = papel === "administrador" ? "Enviar para o dono aprovar" : "Aprovar a importação";
  if (feito) {
    return (
      <Aviso tom="sucesso" titulo={papel === "administrador" ? "Prévia enviada ao dono (demonstração)" : "Importação aprovada (demonstração)"}>
        {papel === "administrador" ? "O dono recebe o resumo e decide. As linhas com problema ficam de fora até serem corrigidas." : `As ${prontas} linhas prontas entrariam agora, numa só transação; reimportar o mesmo arquivo não duplica nada. Nada foi gravado.`}
      </Aviso>
    );
  }
  return (
    <>
      <Botao onClick={() => setConfirmando(true)} disabled={prontas === 0}>
        {papel === "administrador" ? <Send aria-hidden className="size-4" /> : <CircleCheck aria-hidden className="size-4" />} {acao}
      </Botao>
      <Dialogo
        aberto={confirmando}
        aoFechar={() => setConfirmando(false)}
        titulo={acao}
        descricao={`${prontas} linhas prontas entram; ${comProblema} com problema ficam de fora até a correção. Tudo fica registrado com o seu nome.`}
        rodape={<><Botao variante="secundario" onClick={() => setConfirmando(false)}>Voltar</Botao><Botao onClick={() => { setFeito(true); setConfirmando(false); }}>{acao}</Botao></>}
      >
        <p className="text-xs text-suave">Demonstração: nada é gravado.</p>
      </Dialogo>
    </>
  );
}
