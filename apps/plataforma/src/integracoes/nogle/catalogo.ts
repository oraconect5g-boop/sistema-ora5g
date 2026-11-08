// GERADO por scripts/gerar-catalogo-nogle.mjs a partir da coleção oficial da API NOGLE (Contel Telecom),
// publicada em https://docs.nogle.tech/. Cópia lida em 07/11/2026: docs/integracoes/nogle/colecao-postman-2026-11-07.json. Não editar à mão.
// "aba", "quem" e "reconsultar" são PROPOSTA da Ora (validar com o proprietário e a Contel), não vêm da documentação.

export type AbaConnect = "operacoes" | "ativar" | "linha" | "recarga" | "portabilidade" | "atendimento" | "chips" | "carteira" | "integracao";
export type QuemUsa = "loja" | "gestao" | "administracao" | "sistema";

export type FuncaoNogle = {
  grupo: string;
  nome: string;
  metodo: "GET" | "POST" | "PUT" | "DELETE";
  caminho: string;
  descricao: string;
  aba: AbaConnect;
  quem: QuemUsa;
  efeito: "leitura" | "escrita" | "sessao";
  /** GET que a documentação manda com corpo JSON: navegador e fetch não enviam; confirmar com a Contel. */
  corpoEmGet: boolean;
  obrigatorios: readonly string[];
  /** Sem proteção contra duplicidade documentada: o que consultar antes de reenviar depois de uma falha. */
  reconsultar: readonly string[];
};

export const FUNCOES_NOGLE: readonly FuncaoNogle[] = [
  {
    "grupo": "Token",
    "nome": "Autenticação",
    "metodo": "POST",
    "caminho": "/auth/token",
    "descricao": "Se você for uma franquia, é necessário enviar, na requisição de geração de token, a chave de acesso da Contel ( chave_acesso ) e a chave exclusiva da sua franquia ( chave_acesso_fr",
    "aba": "integracao",
    "quem": "sistema",
    "efeito": "sessao",
    "corpoEmGet": false,
    "obrigatorios": [],
    "reconsultar": []
  },
  {
    "grupo": "Geral",
    "nome": "Listar DDDs",
    "metodo": "GET",
    "caminho": "/ddds",
    "descricao": "DDDs do Brasil para validação de ativação.",
    "aba": "ativar",
    "quem": "loja",
    "efeito": "leitura",
    "corpoEmGet": false,
    "obrigatorios": [],
    "reconsultar": []
  },
  {
    "grupo": "Geral",
    "nome": "Listar Planos",
    "metodo": "GET",
    "caminho": "/planos",
    "descricao": "Consulta de planos disponíveis.",
    "aba": "ativar",
    "quem": "loja",
    "efeito": "leitura",
    "corpoEmGet": false,
    "obrigatorios": [],
    "reconsultar": []
  },
  {
    "grupo": "Geral",
    "nome": "Listar Planos Campanhas",
    "metodo": "GET",
    "caminho": "/planosCampanhas",
    "descricao": "Retorna a listagem de planos disponíveis de campanhas, como por exemplo o Pague 8 Leve 12.",
    "aba": "recarga",
    "quem": "loja",
    "efeito": "leitura",
    "corpoEmGet": false,
    "obrigatorios": [],
    "reconsultar": []
  },
  {
    "grupo": "Geral",
    "nome": "Listar Estados",
    "metodo": "GET",
    "caminho": "/estados",
    "descricao": "Consulta dos estados brasileiros para posterior consulta de cidades.",
    "aba": "ativar",
    "quem": "loja",
    "efeito": "leitura",
    "corpoEmGet": false,
    "obrigatorios": [],
    "reconsultar": []
  },
  {
    "grupo": "Geral",
    "nome": "Listar Cidades",
    "metodo": "GET",
    "caminho": "/cidades/UF",
    "descricao": "Consulta de cidades, por estado.",
    "aba": "ativar",
    "quem": "loja",
    "efeito": "leitura",
    "corpoEmGet": false,
    "obrigatorios": [],
    "reconsultar": []
  },
  {
    "grupo": "Geral",
    "nome": "Logística",
    "metodo": "GET",
    "caminho": "/logistica",
    "descricao": "Retorna os valores de logística, como custo do chip físico e valor do frete.",
    "aba": "chips",
    "quem": "loja",
    "efeito": "leitura",
    "corpoEmGet": false,
    "obrigatorios": [],
    "reconsultar": []
  },
  {
    "grupo": "Cliente",
    "nome": "Criar",
    "metodo": "POST",
    "caminho": "/cliente/criar",
    "descricao": "Cadastro de novo cliente.",
    "aba": "ativar",
    "quem": "loja",
    "efeito": "escrita",
    "corpoEmGet": false,
    "obrigatorios": [
      "nome",
      "data_nascimento",
      "rua",
      "numero",
      "bairro",
      "cep",
      "id_cidade"
    ],
    "reconsultar": []
  },
  {
    "grupo": "Cliente",
    "nome": "Atualizar",
    "metodo": "PUT",
    "caminho": "/cliente/atualizar",
    "descricao": "Atualização de cadastro de cliente.",
    "aba": "ativar",
    "quem": "loja",
    "efeito": "escrita",
    "corpoEmGet": false,
    "obrigatorios": [
      "cpf",
      "nome",
      "rua",
      "numero",
      "bairro",
      "cep",
      "id_cidade"
    ],
    "reconsultar": []
  },
  {
    "grupo": "Cliente",
    "nome": "Consultar",
    "metodo": "GET",
    "caminho": "/cliente/buscar",
    "descricao": "Consulta de dados cadastrais de cliente.",
    "aba": "ativar",
    "quem": "loja",
    "efeito": "leitura",
    "corpoEmGet": true,
    "obrigatorios": [
      "documento"
    ],
    "reconsultar": []
  },
  {
    "grupo": "Cliente",
    "nome": "Linhas do Cliente",
    "metodo": "GET",
    "caminho": "/cliente/linhas",
    "descricao": "Consulta linhas sob titularidade de um cliente.",
    "aba": "linha",
    "quem": "loja",
    "efeito": "leitura",
    "corpoEmGet": true,
    "obrigatorios": [
      "documento"
    ],
    "reconsultar": []
  },
  {
    "grupo": "Cliente",
    "nome": "Listar",
    "metodo": "GET",
    "caminho": "/cliente/listar",
    "descricao": "Listagem de todos os clientes.",
    "aba": "carteira",
    "quem": "gestao",
    "efeito": "leitura",
    "corpoEmGet": true,
    "obrigatorios": [],
    "reconsultar": []
  },
  {
    "grupo": "Linha",
    "nome": "Detalhes da linha",
    "metodo": "GET",
    "caminho": "/linhas/detalhes",
    "descricao": "Detalhamento de todos os dados uma linha, com informações como plano, titularidade e datas.",
    "aba": "linha",
    "quem": "loja",
    "efeito": "leitura",
    "corpoEmGet": true,
    "obrigatorios": [
      "numero"
    ],
    "reconsultar": []
  },
  {
    "grupo": "Linha",
    "nome": "Consultar Saldo",
    "metodo": "GET",
    "caminho": "/linhas/saldo",
    "descricao": "Consulta de saldo disponível de uma linha.",
    "aba": "linha",
    "quem": "loja",
    "efeito": "leitura",
    "corpoEmGet": true,
    "obrigatorios": [
      "linha"
    ],
    "reconsultar": []
  },
  {
    "grupo": "Linha",
    "nome": "Histórico de Recargas",
    "metodo": "GET",
    "caminho": "/linhas/historico",
    "descricao": "Histórico de recargas realizadas para uma determinada linha.",
    "aba": "linha",
    "quem": "loja",
    "efeito": "leitura",
    "corpoEmGet": true,
    "obrigatorios": [
      "numero"
    ],
    "reconsultar": []
  },
  {
    "grupo": "Linha",
    "nome": "Validar Existência",
    "metodo": "GET",
    "caminho": "/linhas/verificaExistencia",
    "descricao": "Validação de um número de linha.",
    "aba": "linha",
    "quem": "loja",
    "efeito": "leitura",
    "corpoEmGet": true,
    "obrigatorios": [
      "numero"
    ],
    "reconsultar": []
  },
  {
    "grupo": "Linha",
    "nome": "Consultar pelo ICCID",
    "metodo": "GET",
    "caminho": "/linhas/numeroPeloIccid",
    "descricao": "Consulta o número de uma linha através do ICCID.",
    "aba": "linha",
    "quem": "loja",
    "efeito": "leitura",
    "corpoEmGet": true,
    "obrigatorios": [
      "iccid"
    ],
    "reconsultar": []
  },
  {
    "grupo": "Linha",
    "nome": "Validar Titularidade",
    "metodo": "GET",
    "caminho": "/linhas/validaTitularidade",
    "descricao": "Valida, se para um número de linha e número de documento enviados, se o documento enviado é o mesmo que o documento que consta no titular da linha.",
    "aba": "linha",
    "quem": "loja",
    "efeito": "leitura",
    "corpoEmGet": true,
    "obrigatorios": [
      "linha",
      "documento"
    ],
    "reconsultar": []
  },
  {
    "grupo": "Linha",
    "nome": "Listar Todas",
    "metodo": "GET",
    "caminho": "/linhas/listar",
    "descricao": "Lista todas as linhas da base.",
    "aba": "carteira",
    "quem": "gestao",
    "efeito": "leitura",
    "corpoEmGet": true,
    "obrigatorios": [],
    "reconsultar": []
  },
  {
    "grupo": "Linha",
    "nome": "Estoque Virgem",
    "metodo": "GET",
    "caminho": "/linhas/estoque",
    "descricao": "Listagem do estoque de chips VIRGENS.",
    "aba": "chips",
    "quem": "loja",
    "efeito": "leitura",
    "corpoEmGet": true,
    "obrigatorios": [],
    "reconsultar": []
  },
  {
    "grupo": "Linha",
    "nome": "Recargas Solicitadas",
    "metodo": "GET",
    "caminho": "/linhas/cobrancasGeradas",
    "descricao": "Listagem de todas as solicitações de recargas para uma determinada linha.",
    "aba": "linha",
    "quem": "loja",
    "efeito": "leitura",
    "corpoEmGet": true,
    "obrigatorios": [],
    "reconsultar": []
  },
  {
    "grupo": "Linha",
    "nome": "Atualizar Apelido Linha",
    "metodo": "POST",
    "caminho": "/linhas/atualizar",
    "descricao": "Utilize este endpoint para adicionar ou alterar um apelido para uma linha, a fim de facilitar a identificação da mesma.",
    "aba": "linha",
    "quem": "loja",
    "efeito": "escrita",
    "corpoEmGet": false,
    "obrigatorios": [
      "linha",
      "linha_apelido"
    ],
    "reconsultar": []
  },
  {
    "grupo": "Histórico de consumo",
    "nome": "Dados",
    "metodo": "GET",
    "caminho": "/linhas/consumo/dados",
    "descricao": "Consulta do histórico de consumo de dados (internet) de uma linha.",
    "aba": "linha",
    "quem": "loja",
    "efeito": "leitura",
    "corpoEmGet": true,
    "obrigatorios": [
      "linha",
      "mes",
      "ano"
    ],
    "reconsultar": []
  },
  {
    "grupo": "Histórico de consumo",
    "nome": "Voz",
    "metodo": "GET",
    "caminho": "/linhas/consumo/voz",
    "descricao": "Consulta do histórico de ligações de uma linha.",
    "aba": "linha",
    "quem": "loja",
    "efeito": "leitura",
    "corpoEmGet": true,
    "obrigatorios": [
      "linha",
      "mes",
      "ano"
    ],
    "reconsultar": []
  },
  {
    "grupo": "Histórico de consumo",
    "nome": "SMS",
    "metodo": "GET",
    "caminho": "/linhas/consumo/sms",
    "descricao": "Consulta do histórico de envios de SMS de uma linha.",
    "aba": "linha",
    "quem": "loja",
    "efeito": "leitura",
    "corpoEmGet": true,
    "obrigatorios": [
      "linha",
      "mes",
      "ano"
    ],
    "reconsultar": []
  },
  {
    "grupo": "Ativação",
    "nome": "Ativação",
    "metodo": "POST",
    "caminho": "/ativacao/solicitar",
    "descricao": "Solicitação de nova ativação de chip, válido para ativar um chip físico ou eSIM.",
    "aba": "ativar",
    "quem": "loja",
    "efeito": "escrita",
    "corpoEmGet": false,
    "obrigatorios": [
      "metodo_pagamento",
      "nome",
      "cpf",
      "data_nascimento",
      "endereco.rua",
      "endereco.numero",
      "endereco.bairro",
      "endereco.cep",
      "endereco.id_cidade",
      "chips.id_plano",
      "chips.ddd",
      "chips.iccid"
    ],
    "reconsultar": [
      "/ativacao/validaIccid",
      "/ativacao/detalhar"
    ]
  },
  {
    "grupo": "Ativação",
    "nome": "Detalhar Ativação",
    "metodo": "GET",
    "caminho": "/ativacao/detalhar",
    "descricao": "Busca os detalhes de uma ativação realizada, através do ICCID da linha.",
    "aba": "ativar",
    "quem": "loja",
    "efeito": "leitura",
    "corpoEmGet": true,
    "obrigatorios": [
      "iccid"
    ],
    "reconsultar": []
  },
  {
    "grupo": "Ativação",
    "nome": "Verifica Plano Pago",
    "metodo": "GET",
    "caminho": "/ativacao/verificaPlanoPago",
    "descricao": "Verifica se um ICCID já possui plano pago.",
    "aba": "ativar",
    "quem": "loja",
    "efeito": "leitura",
    "corpoEmGet": true,
    "obrigatorios": [
      "iccid"
    ],
    "reconsultar": []
  },
  {
    "grupo": "Ativação",
    "nome": "Validar ICCID",
    "metodo": "POST",
    "caminho": "/ativacao/validaIccid",
    "descricao": "Realiza validação de um número de ICCID.",
    "aba": "ativar",
    "quem": "loja",
    "efeito": "leitura",
    "corpoEmGet": false,
    "obrigatorios": [
      "iccid"
    ],
    "reconsultar": []
  },
  {
    "grupo": "Recarga",
    "nome": "Solicitar Recarga",
    "metodo": "POST",
    "caminho": "/recarga/solicitar",
    "descricao": "Solicitação de nova recarga de plano para uma linha.",
    "aba": "recarga",
    "quem": "loja",
    "efeito": "escrita",
    "corpoEmGet": false,
    "obrigatorios": [
      "metodo_pagamento",
      "numero",
      "id_plano"
    ],
    "reconsultar": [
      "/linhas/historico",
      "/linhas/cobrancasGeradas"
    ]
  },
  {
    "grupo": "Recarga",
    "nome": "Bloqueio / Desbloqueio",
    "metodo": "POST",
    "caminho": "/recarga/alterarStatusRecargaAutomatica",
    "descricao": "Endpoint de bloqueio e desbloqueio de linha de recarga programada.",
    "aba": "recarga",
    "quem": "gestao",
    "efeito": "escrita",
    "corpoEmGet": false,
    "obrigatorios": [
      "linha",
      "iccid",
      "id",
      "operacao"
    ],
    "reconsultar": []
  },
  {
    "grupo": "Recarga",
    "nome": "Saldo - Programar",
    "metodo": "POST",
    "caminho": "/recarga/saldo/adicionar",
    "descricao": "Endpoint para programar / agendar recargas por SALDO.",
    "aba": "recarga",
    "quem": "gestao",
    "efeito": "escrita",
    "corpoEmGet": false,
    "obrigatorios": [
      "linha",
      "plano"
    ],
    "reconsultar": []
  },
  {
    "grupo": "Portabilidade",
    "nome": "Solicitar Portabilidade",
    "metodo": "POST",
    "caminho": "/portabilidade/solicitar",
    "descricao": "Solicitação de nova portabilidade.",
    "aba": "portabilidade",
    "quem": "loja",
    "efeito": "escrita",
    "corpoEmGet": false,
    "obrigatorios": [
      "numero_contel",
      "doador_numero",
      "doador_id_operadora"
    ],
    "reconsultar": [
      "/portabilidade/status"
    ]
  },
  {
    "grupo": "Portabilidade",
    "nome": "Consultar Status",
    "metodo": "GET",
    "caminho": "/portabilidade/status",
    "descricao": "Consulta o último status de uma portabilidade.",
    "aba": "portabilidade",
    "quem": "loja",
    "efeito": "leitura",
    "corpoEmGet": true,
    "obrigatorios": [
      "linha",
      "linha_doadora"
    ],
    "reconsultar": []
  },
  {
    "grupo": "Portabilidade",
    "nome": "Operadoras Disponíveis",
    "metodo": "GET",
    "caminho": "/portabilidade/operadorasDisponiveis",
    "descricao": "Listagem de operadoras disponíveis para solicitação de portabilidade.",
    "aba": "portabilidade",
    "quem": "loja",
    "efeito": "leitura",
    "corpoEmGet": false,
    "obrigatorios": [],
    "reconsultar": []
  },
  {
    "grupo": "Portabilidade",
    "nome": "Reenviar SMS",
    "metodo": "POST",
    "caminho": "/portabilidade/reenviarsms",
    "descricao": "Reenvio de SMS de aceite / confirmação de portabilidade.",
    "aba": "portabilidade",
    "quem": "loja",
    "efeito": "escrita",
    "corpoEmGet": false,
    "obrigatorios": [
      "linha",
      "linha_doadora"
    ],
    "reconsultar": []
  },
  {
    "grupo": "Compra",
    "nome": "Cadastrar Compra",
    "metodo": "POST",
    "caminho": "/compra/solicitar",
    "descricao": "Cadastro de nova compra, através de entrega de chip via logística.",
    "aba": "chips",
    "quem": "loja",
    "efeito": "escrita",
    "corpoEmGet": false,
    "obrigatorios": [
      "metodo_pagamento",
      "id_plano",
      "nome",
      "cpf",
      "endereco.rua",
      "endereco.numero",
      "endereco.bairro",
      "endereco.cep",
      "endereco.id_cidade"
    ],
    "reconsultar": [
      "/pagamento"
    ]
  },
  {
    "grupo": "Compra",
    "nome": "Rastreio",
    "metodo": "POST",
    "caminho": "/compra/rastrear",
    "descricao": "Rastreio de chip enviado via logística por transportadora.",
    "aba": "chips",
    "quem": "loja",
    "efeito": "leitura",
    "corpoEmGet": false,
    "obrigatorios": [
      "id"
    ],
    "reconsultar": []
  },
  {
    "grupo": "Atendimento",
    "nome": "Bloqueio",
    "metodo": "POST",
    "caminho": "/atendimento/bloqueio",
    "descricao": "Realização de bloqueio de linha.",
    "aba": "atendimento",
    "quem": "gestao",
    "efeito": "escrita",
    "corpoEmGet": false,
    "obrigatorios": [
      "numero",
      "motivo"
    ],
    "reconsultar": [
      "/linhas/detalhes"
    ]
  },
  {
    "grupo": "Atendimento",
    "nome": "Desbloqueio",
    "metodo": "POST",
    "caminho": "/atendimento/desbloqueio",
    "descricao": "Realização de desbloqueio de linha.",
    "aba": "atendimento",
    "quem": "gestao",
    "efeito": "escrita",
    "corpoEmGet": false,
    "obrigatorios": [
      "numero"
    ],
    "reconsultar": [
      "/linhas/detalhes"
    ]
  },
  {
    "grupo": "Relatórios",
    "nome": "Portabilidades",
    "metodo": "GET",
    "caminho": "/portabilidade/listar",
    "descricao": "Neste relatório você consegue listar todas as portabilidades.",
    "aba": "carteira",
    "quem": "gestao",
    "efeito": "leitura",
    "corpoEmGet": true,
    "obrigatorios": [],
    "reconsultar": []
  },
  {
    "grupo": "Relatórios",
    "nome": "Ativações",
    "metodo": "GET",
    "caminho": "/relatorios/ativacoes",
    "descricao": "Neste relatório você consegue listar todas as ativações.",
    "aba": "carteira",
    "quem": "gestao",
    "efeito": "leitura",
    "corpoEmGet": true,
    "obrigatorios": [
      "data_de",
      "data_ate",
      "page"
    ],
    "reconsultar": []
  },
  {
    "grupo": "Relatórios",
    "nome": "Recargas",
    "metodo": "GET",
    "caminho": "/relatorios/recargas",
    "descricao": "Neste relatório você consegue listar todas as recargas.",
    "aba": "carteira",
    "quem": "gestao",
    "efeito": "leitura",
    "corpoEmGet": true,
    "obrigatorios": [
      "data_de",
      "data_ate",
      "page"
    ],
    "reconsultar": []
  },
  {
    "grupo": "Relatórios",
    "nome": "Transações",
    "metodo": "GET",
    "caminho": "/relatorios/transacoes",
    "descricao": "Neste relatório você consegue listar todas as recargas E ativações.",
    "aba": "carteira",
    "quem": "gestao",
    "efeito": "leitura",
    "corpoEmGet": true,
    "obrigatorios": [
      "data_de",
      "data_ate",
      "page"
    ],
    "reconsultar": []
  },
  {
    "grupo": "FAQ",
    "nome": "Categorias",
    "metodo": "GET",
    "caminho": "/faq/categorias",
    "descricao": "Categorias do FAQ da Contel.",
    "aba": "atendimento",
    "quem": "loja",
    "efeito": "leitura",
    "corpoEmGet": false,
    "obrigatorios": [],
    "reconsultar": []
  },
  {
    "grupo": "FAQ",
    "nome": "Perguntas e Respostas",
    "metodo": "GET",
    "caminho": "/faq/categoria/X",
    "descricao": "Lista de perguntas e respostas, para determinada categoria, do FAQ da Contel.",
    "aba": "atendimento",
    "quem": "loja",
    "efeito": "leitura",
    "corpoEmGet": false,
    "obrigatorios": [],
    "reconsultar": []
  },
  {
    "grupo": "Validações",
    "nome": "CEP",
    "metodo": "POST",
    "caminho": "/validar/cep",
    "descricao": "Endpoint para validar um CEP.",
    "aba": "ativar",
    "quem": "loja",
    "efeito": "leitura",
    "corpoEmGet": false,
    "obrigatorios": [
      "cep"
    ],
    "reconsultar": []
  },
  {
    "grupo": "Validações",
    "nome": "CPF",
    "metodo": "POST",
    "caminho": "/validar/cpf",
    "descricao": "Endpoint para validar um CPF.",
    "aba": "ativar",
    "quem": "loja",
    "efeito": "leitura",
    "corpoEmGet": false,
    "obrigatorios": [
      "cpf"
    ],
    "reconsultar": []
  },
  {
    "grupo": "Validações",
    "nome": "CNPJ",
    "metodo": "POST",
    "caminho": "/validar/cnpj",
    "descricao": "Endpoint para validar um CNPJ.",
    "aba": "ativar",
    "quem": "loja",
    "efeito": "leitura",
    "corpoEmGet": false,
    "obrigatorios": [
      "cnpj"
    ],
    "reconsultar": []
  },
  {
    "grupo": "Pagamento",
    "nome": "Pagamento",
    "metodo": "POST",
    "caminho": "/pagamento",
    "descricao": "Todas as solicitações de ativação e recarga geram um ID.",
    "aba": "recarga",
    "quem": "loja",
    "efeito": "leitura",
    "corpoEmGet": false,
    "obrigatorios": [
      "tipo",
      "id"
    ],
    "reconsultar": []
  },
  {
    "grupo": "Saldo",
    "nome": "Consulta de saldo",
    "metodo": "GET",
    "caminho": "/saldo/saldo",
    "descricao": "Uma das formas de pagamento disponibilizadas é a opção de SALDO .",
    "aba": "carteira",
    "quem": "gestao",
    "efeito": "leitura",
    "corpoEmGet": false,
    "obrigatorios": [],
    "reconsultar": []
  },
  {
    "grupo": "Saldo",
    "nome": "Extrato",
    "metodo": "GET",
    "caminho": "/saldo/extrato",
    "descricao": "Consulta do histórico de envios de SMS de uma linha.",
    "aba": "carteira",
    "quem": "gestao",
    "efeito": "leitura",
    "corpoEmGet": true,
    "obrigatorios": [
      "data_inicio",
      "data_fim",
      "tipo"
    ],
    "reconsultar": []
  },
  {
    "grupo": "Saldo",
    "nome": "Recargas Programadas",
    "metodo": "GET",
    "caminho": "/saldo/programado",
    "descricao": "Retorna Estrutura do conteúdo de envio: Atributo Tipo Descrição Obrigatório data_renovacao_de String Filtro de data inicial da data de renovação de recarga.",
    "aba": "carteira",
    "quem": "gestao",
    "efeito": "leitura",
    "corpoEmGet": true,
    "obrigatorios": [
      "data_renovacao_de",
      "data_renovacao_ate"
    ],
    "reconsultar": []
  },
  {
    "grupo": "PDV",
    "nome": "Criar",
    "metodo": "POST",
    "caminho": "/pdv/cadastrar",
    "descricao": "Endpoint para criação de um novo ponto de venda.",
    "aba": "integracao",
    "quem": "administracao",
    "efeito": "escrita",
    "corpoEmGet": false,
    "obrigatorios": [
      "nome",
      "endereco.uf",
      "endereco.cidade"
    ],
    "reconsultar": []
  },
  {
    "grupo": "PDV",
    "nome": "Novo usuário",
    "metodo": "POST",
    "caminho": "/pdv/usuario",
    "descricao": "Endpoint para criação de um novo usuário, associado ao ponto de venda.",
    "aba": "integracao",
    "quem": "administracao",
    "efeito": "escrita",
    "corpoEmGet": false,
    "obrigatorios": [
      "id",
      "nome",
      "email",
      "senha"
    ],
    "reconsultar": []
  },
  {
    "grupo": "PDV",
    "nome": "Inativar",
    "metodo": "DELETE",
    "caminho": "/pdv/inativar",
    "descricao": "Endpoint para inativação de ponto de venda.",
    "aba": "integracao",
    "quem": "administracao",
    "efeito": "escrita",
    "corpoEmGet": false,
    "obrigatorios": [
      "id"
    ],
    "reconsultar": []
  },
  {
    "grupo": "PDV",
    "nome": "Atualizar",
    "metodo": "PUT",
    "caminho": "/pdv/atualizar",
    "descricao": "Endpoint para atualização cadastral de ponto de venda.",
    "aba": "integracao",
    "quem": "administracao",
    "efeito": "escrita",
    "corpoEmGet": false,
    "obrigatorios": [
      "id",
      "nome"
    ],
    "reconsultar": []
  },
  {
    "grupo": "PDV",
    "nome": "Buscar Estoque",
    "metodo": "GET",
    "caminho": "/pdv/estoque",
    "descricao": "Endpoint para buscar o estoque de chips disponíveis do PDV.",
    "aba": "chips",
    "quem": "loja",
    "efeito": "leitura",
    "corpoEmGet": true,
    "obrigatorios": [
      "id"
    ],
    "reconsultar": []
  },
  {
    "grupo": "PDV",
    "nome": "Listar",
    "metodo": "GET",
    "caminho": "/pdv/listar",
    "descricao": "Retorna a listagem de todos os pontos de venda.",
    "aba": "integracao",
    "quem": "administracao",
    "efeito": "leitura",
    "corpoEmGet": false,
    "obrigatorios": [],
    "reconsultar": []
  },
  {
    "grupo": "PDV",
    "nome": "Transferir chip físico - unidade",
    "metodo": "POST",
    "caminho": "/pdv/transferir-chip-fisico-unidade",
    "descricao": "Endpoint para transferência de uma unidade de chip físico para o estoque do PDV.",
    "aba": "chips",
    "quem": "gestao",
    "efeito": "escrita",
    "corpoEmGet": false,
    "obrigatorios": [
      "id",
      "iccid"
    ],
    "reconsultar": []
  },
  {
    "grupo": "PDV",
    "nome": "Transferir chip físico - lote",
    "metodo": "POST",
    "caminho": "/pdv/transferir-chip-fisico-lote",
    "descricao": "Endpoint para transferência em lote de chips físicos para o estoque do PDV.",
    "aba": "chips",
    "quem": "gestao",
    "efeito": "escrita",
    "corpoEmGet": false,
    "obrigatorios": [
      "id",
      "iccid_inicial",
      "iccid_final"
    ],
    "reconsultar": []
  },
  {
    "grupo": "PDV",
    "nome": "Transferir chip eSIM",
    "metodo": "POST",
    "caminho": "/pdv/transferir-chip-esim",
    "descricao": "Endpoint para transferência de eSIM para o estoque de um PDV.",
    "aba": "chips",
    "quem": "gestao",
    "efeito": "escrita",
    "corpoEmGet": false,
    "obrigatorios": [
      "id",
      "quantidade"
    ],
    "reconsultar": []
  }
];
