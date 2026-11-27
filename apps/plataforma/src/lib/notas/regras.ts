// Mensagens da fila fiscal (ADR-006). O banco decide tudo; aqui só se escolhe o texto pelo código.
export const ERROS_DAS_NOTAS = {
  ja_pedida: "Esta venda já tem pedido de nota em aberto ou nota emitida.",
  nota_emitida: "Nota já emitida: cancele a nota no portal do fisco e registre o cancelamento no bloco “Nota fiscal” da venda; depois a venda pode ser cancelada (ou faça a devolução).",
  chave: "Essa ação já foi feita com outro conteúdo. Recarregue a tela.",
  sem_permissao: "Você não tem permissão para isso.",
  nao_encontrado: "Pedido ou venda não encontrado (talvez já tenha sido alterado).",
  dados: "Confira os dados: CPF/CNPJ válido, chave de acesso com 44 dígitos e do CNPJ desta loja.",
  motivo: "Informe o motivo (fica na auditoria).",
  fonte: "Registre a fonte do prazo (orientação do contador) com pelo menos 10 caracteres.",
  cliente_sem_documento: "O cliente da venda não tem CPF/CNPJ no cadastro: corrija o cadastro ou informe o documento aqui.",
  cliente_sem_endereco: "O cliente da venda não tem o endereço completo no cadastro (CEP, rua, número, bairro, cidade e UF): complete o cadastro dele e peça a nota de novo.",
  ja_emitida: "Esta nota já foi emitida (ou o pedido foi cancelado): os dados do destinatário saem do sistema depois da emissão.",
  documento_tipo: "Envie o PDF (DANFE) ou o XML da nota, do jeito que o emissor entregou.",
  documento_grande: "Arquivo maior que 5 MB: envie o PDF ou o XML da nota, sem outros arquivos junto.",
  documento_outra_nota: "Este XML não é desta nota: a chave de acesso dentro dele é outra.",
  protocolo: "Protocolo de autorização inválido: são 15 dígitos.",
  protocolo_outro: "O protocolo digitado é diferente do que está no XML (ou do já registrado nesta nota): confira.",
  whatsapp_nao_emitida: "Só a nota emitida vai ao cliente pelo WhatsApp.",
  whatsapp_sem_pdf: "Guarde o PDF da nota antes de enviar pelo WhatsApp.",
  whatsapp_sem_cliente: "A nota foi pedida sem o cliente da rede na venda: o envio pelo WhatsApp vale só para a nota pedida com o cliente ligado.",
  // INTEG-a (#88): o cliente da venda mudou depois do pedido da nota.
  whatsapp_cliente_mudou: "O cliente da venda mudou depois do pedido da nota: a nota está no nome de outro cliente e não vai pelo WhatsApp. Confira a venda e a nota.",
  // INTEG-a (#87): a nota no nome do cliente se corrige pelo cadastro dele.
  nota_do_cadastro: "Esta nota está no nome do cliente do cadastro: corrija o cadastro do cliente e use \"Usar o cadastro atualizado\" (o CPF/CNPJ não se digita aqui).",
  whatsapp_sem_numero: "O cliente da venda não tem WhatsApp no cadastro: complete o cadastro dele.",
  whatsapp_desconhecido: "O último envio ficou com resultado desconhecido: a gerência confere antes de reenviar.",
  whatsapp_motivo: "Para reenviar a nota, informe o motivo (de 3 a 200 letras): ele fica no histórico.",
  // INTEG-c (#101): a nota sem a identidade do destinatário comprovada e a conferência da gerência.
  whatsapp_identidade: "A identidade do destinatário desta nota não está comprovada: a gerência confere o PDF da nota e confirma o cliente antes do envio.",
  conferencia_motivo: "Informe como o destinatário foi conferido (de 10 a 200 letras): fica na auditoria.",
  conferencia_feita: "A identidade do destinatário desta nota já está comprovada: recarregue a venda.",
  conferencia_sem_cliente: "A venda não tem um cliente ativo do cadastro para confirmar: ligue o cliente certo à venda antes.",
  conferencia_nao_emitida: "A conferência do destinatário é da nota de venda emitida: recarregue a venda.",
  // L10c (FISC-009): o cancelamento no fisco registrado e a chave corrigida.
  chave_repetida: "Esta chave de acesso já está registrada em outro pedido: confira se é a nota certa.",
  nao_emitida: "Esta nota não está emitida (talvez o pedido já tenha mudado): recarregue a venda.",
  cancelamento_protocolo: "Protocolo do cancelamento inválido: são os 15 dígitos do evento de cancelamento no fisco.",
  cancelamento_justificativa: "A justificativa do cancelamento tem de 15 a 255 letras, como a do evento no fisco.",
  cancelamento_outro: "O cancelamento desta nota já foi registrado com outro protocolo: confira no portal.",
  cancelamento_devolucao: "Esta venda tem nota de devolução: o cancelamento da nota de origem é tratado com o contador.",
  chave_xml: "O XML guardado confirma a chave registrada: se a nota é outra, cancele esta no fisco e registre a certa.",
  chave_motivo: "Informe o motivo da correção (de 10 a 300 letras): fica no histórico da nota.",
  // FISC-009b (FISC-009): a carta de correção da NF-e registrada.
  carta_numero: "O número da carta de correção vai de 1 a 20: é o número do evento no portal do fisco.",
  carta_protocolo: "Protocolo da carta de correção inválido: são os 15 dígitos do evento no portal do fisco.",
  carta_texto: "O texto da correção tem de 15 a 1.000 caracteres, como o do evento no fisco.",
  carta_outra: "Esta nota já tem uma carta de correção com este número, com outro texto ou protocolo: confira no portal.",
  carta_protocolo_repetido: "Este protocolo já está registrado em outra carta de correção: confira no portal.",
  carta_nfce: "A carta de correção é só da NF-e. A NFC-e não tem: para corrigir, cancele a nota no fisco e peça outra.",
  carta_nao_emitida: "Só a nota emitida (autorizada e não cancelada) tem carta de correção: recarregue a venda.",
  // NFE55-b: o cadastro rápido e o completar para a nota na tela da venda, desligados por padrão (ORA_NOTA_NA_VENDA).
  na_venda_desligada: "Cadastrar ou completar o cliente na tela da venda está desligado neste ambiente: use a ficha do cliente.",
  falha: "Não foi possível concluir agora. Tente de novo em instantes.",
} as const;
export type ErroDasNotas = keyof typeof ERROS_DAS_NOTAS;

const DO_BANCO: Record<string, ErroDasNotas> = {
  OR004: "chave", OR014: "ja_pedida", OR015: "nota_emitida", OR037: "whatsapp_identidade", "42501": "sem_permissao", P0002: "nao_encontrado", "22023": "dados",
};
export function erroDasNotas(erro: { code?: string; message?: string } | null | undefined): ErroDasNotas {
  const codigo = erro?.code;
  if (codigo === "22023" && /não tem cpf\/cnpj no cadastro/i.test(erro?.message ?? "")) return "cliente_sem_documento";
  if (codigo === "22023" && /não tem o endereço completo no cadastro/i.test(erro?.message ?? "")) return "cliente_sem_endereco";
  if (codigo === "22023" && /está no nome do cliente do cadastro/i.test(erro?.message ?? "")) return "nota_do_cadastro";
  if (codigo === "22023" && /só aparecem enquanto a nota espera/i.test(erro?.message ?? "")) return "ja_emitida";
  if (codigo === "22023" && /já tem outro protocolo/i.test(erro?.message ?? "")) return "protocolo_outro";
  if (codigo === "22023" && /protocolo de autorização inválido/i.test(erro?.message ?? "")) return "protocolo";
  // K1c (#76): o envio da nota pelo WhatsApp.
  const doWhatsApp: [RegExp, ErroDasNotas][] = [
    [/só a nota emitida vai ao cliente/i, "whatsapp_nao_emitida"], [/guarde o pdf da nota/i, "whatsapp_sem_pdf"],
    [/ligue a venda ao cliente|pedida sem o cliente da rede/i, "whatsapp_sem_cliente"], [/não tem whatsapp no cadastro/i, "whatsapp_sem_numero"],
    [/cliente da venda mudou depois do pedido da nota/i, "whatsapp_cliente_mudou"],
    [/resultado desconhecido/i, "whatsapp_desconhecido"], [/para reenviar a nota/i, "whatsapp_motivo"],
  ];
  const doEnvio = codigo === "22023" ? doWhatsApp.find(([padrao]) => padrao.test(erro?.message ?? "")) : undefined;
  if (doEnvio) return doEnvio[1];
  // INTEG-c (#101): a conferência do destinatário pela gerência.
  const daConferencia: [RegExp, ErroDasNotas][] = [
    [/como o destinatário foi conferido/i, "conferencia_motivo"], [/destinatário desta nota já está comprovada/i, "conferencia_feita"],
    [/não tem um cliente ativo do cadastro para confirmar/i, "conferencia_sem_cliente"], [/conferência do destinatário é da nota/i, "conferencia_nao_emitida"],
  ];
  const doConferido = codigo === "22023" ? daConferencia.find(([padrao]) => padrao.test(erro?.message ?? "")) : undefined;
  if (doConferido) return doConferido[1];
  // L10c (FISC-009): o cancelamento no fisco e a correção da chave.
  const doCancelamento: [RegExp, ErroDasNotas][] = [
    [/já está registrada em outro pedido/i, "chave_repetida"], [/protocolo do cancelamento inválido/i, "cancelamento_protocolo"],
    [/justificativa do cancelamento/i, "cancelamento_justificativa"], [/já foi registrado com outro protocolo/i, "cancelamento_outro"],
    [/tem nota de devolução/i, "cancelamento_devolucao"], [/xml guardado confirma a chave/i, "chave_xml"],
    [/motivo da correção/i, "chave_motivo"], [/só a nota emitida tem cancelamento|só a chave da nota emitida/i, "nao_emitida"],
  ];
  const doFisco = codigo === "22023" ? doCancelamento.find(([padrao]) => padrao.test(erro?.message ?? "")) : undefined;
  if (doFisco) return doFisco[1];
  // FISC-009b (FISC-009): a carta de correção.
  const daCarta: [RegExp, ErroDasNotas][] = [
    [/número da carta de correção/i, "carta_numero"], [/protocolo da carta de correção inválido/i, "carta_protocolo"],
    [/texto da correção/i, "carta_texto"], [/carta de correção nº \d+ desta nota já foi registrada/i, "carta_outra"],
    [/protocolo já foi registrado em outra carta/i, "carta_protocolo_repetido"], [/carta de correção é só da nf-e/i, "carta_nfce"],
    [/tem carta de correção/i, "carta_nao_emitida"],
  ];
  const doEvento = codigo === "22023" ? daCarta.find(([padrao]) => padrao.test(erro?.message ?? "")) : undefined;
  if (doEvento) return doEvento[1];
  return codigo && Object.hasOwn(DO_BANCO, codigo) ? (DO_BANCO[codigo] as ErroDasNotas) : "falha";
}

// K1c (#76): os estados do envio da nota pelo WhatsApp, como a tela os diz. Só a resposta do WhatsApp muda o estado.
export const SITUACOES_DO_ENVIO: Record<string, string> = {
  na_fila: "na fila", enviando: "enviando", aceito: "aceito pelo WhatsApp", entregue: "entregue", lido: "lido",
  falhou: "não chegou", desconhecido: "resultado desconhecido",
};
export const dataEHoraDoEnvio = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

/** "há 5 min", "há 2 h 10 min", "há 3 d". */
export function haQuanto(minutos: number): string {
  if (minutos < 60) return `há ${minutos} min`;
  if (minutos < 24 * 60) return `há ${Math.floor(minutos / 60)} h${minutos % 60 ? ` ${minutos % 60} min` : ""}`;
  return `há ${Math.floor(minutos / (24 * 60))} d`;
}
