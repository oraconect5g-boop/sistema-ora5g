"use client";

import { useState } from "react";

import { Dialogo } from "../../../componentes/Dialogo";
import { Botao, Selo } from "../../../componentes/ui";

/** Bloquear ou desbloquear um usuário (dono e administrador). Na demonstração, só na tela. */
export function AcaoUsuario({ nome, bloqueado }: { nome: string; bloqueado: boolean }) {
  const [estado, setEstado] = useState(bloqueado);
  const [confirmando, setConfirmando] = useState(false);
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <Selo tom={estado ? "perigo" : "sucesso"} ponto>{estado ? "Bloqueado" : "Ativo"}</Selo>
      <Botao variante={estado ? "secundario" : "perigo"} tamanho="sm" aria-label={`${estado ? "Desbloquear" : "Bloquear"} ${nome}`} onClick={() => setConfirmando(true)}>{estado ? "Desbloquear" : "Bloquear"}</Botao>
      <Dialogo
        aberto={confirmando}
        aoFechar={() => setConfirmando(false)}
        titulo={`${estado ? "Desbloquear" : "Bloquear"} ${nome}?`}
        descricao={estado ? "A pessoa volta a entrar nas lojas em que tem vínculo." : "A pessoa perde o acesso na hora, em todas as lojas, e a ação fica na auditoria."}
        rodape={<><Botao variante="secundario" onClick={() => setConfirmando(false)}>Cancelar</Botao><Botao variante={estado ? "primario" : "perigo"} onClick={() => { setEstado(!estado); setConfirmando(false); }}>{estado ? "Desbloquear" : "Bloquear"}</Botao></>}
      >
        <p className="text-xs text-suave">Demonstração: nada é gravado.</p>
      </Dialogo>
    </span>
  );
}
