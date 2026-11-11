// ARQUIVO GERADO pelo Supabase (generate_typescript_types do projeto ora5g-dev) depois da
// migration 20261111191909_clientes_compartilhados. Não edite à mão: gere de novo a cada
// migration aplicada (auditoria do Codex de 08/11, §7.2). O teste tipos-banco.test.ts confere
// que funções e tabelas públicas daqui são as mesmas das migrations.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      aprovacoes_desconto: {
        Row: {
          abaixo_do_custo: boolean
          conteudo: string
          decidido_em: string | null
          decidido_por: string | null
          desconto_centavos: number
          expira_em: string
          id: string
          item_id: string | null
          maximo_sem_aprovacao_centavos: number
          motivo: string
          observacao: string | null
          organizacao_id: string
          preco_centavos: number
          situacao: string
          solicitado_em: string
          solicitado_por: string
          unidade_id: string
          venda_id: string
        }
        Insert: {
          abaixo_do_custo?: boolean
          conteudo: string
          decidido_em?: string | null
          decidido_por?: string | null
          desconto_centavos: number
          expira_em: string
          id?: string
          item_id?: string | null
          maximo_sem_aprovacao_centavos: number
          motivo: string
          observacao?: string | null
          organizacao_id: string
          preco_centavos: number
          situacao?: string
          solicitado_em?: string
          solicitado_por: string
          unidade_id: string
          venda_id: string
        }
        Update: {
          abaixo_do_custo?: boolean
          conteudo?: string
          decidido_em?: string | null
          decidido_por?: string | null
          desconto_centavos?: number
          expira_em?: string
          id?: string
          item_id?: string | null
          maximo_sem_aprovacao_centavos?: number
          motivo?: string
          observacao?: string | null
          organizacao_id?: string
          preco_centavos?: number
          situacao?: string
          solicitado_em?: string
          solicitado_por?: string
          unidade_id?: string
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aprovacoes_desconto_decidido_por_fkey"
            columns: ["decidido_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aprovacoes_desconto_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "venda_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aprovacoes_desconto_solicitado_por_fkey"
            columns: ["solicitado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aprovacoes_desconto_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria: {
        Row: {
          acao: string
          alvo_id: string | null
          alvo_tipo: string | null
          antes: Json | null
          depois: Json | null
          id: number
          motivo: string | null
          ocorrido_em: string
          organizacao_id: string | null
          origem: string
          unidade_id: string | null
          usuario_id: string | null
        }
        Insert: {
          acao: string
          alvo_id?: string | null
          alvo_tipo?: string | null
          antes?: Json | null
          depois?: Json | null
          id?: never
          motivo?: string | null
          ocorrido_em?: string
          organizacao_id?: string | null
          origem?: string
          unidade_id?: string | null
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          alvo_id?: string | null
          alvo_tipo?: string | null
          antes?: Json | null
          depois?: Json | null
          id?: never
          motivo?: string | null
          ocorrido_em?: string
          organizacao_id?: string | null
          origem?: string
          unidade_id?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      caixa_movimentos: {
        Row: {
          caixa_id: string
          chave_idempotencia: string
          id: number
          meio: string
          motivo: string | null
          ocorrido_em: string
          organizacao_id: string
          pagamento_id: string | null
          tipo: string
          usuario_id: string | null
          valor_centavos: number
          venda_id: string | null
        }
        Insert: {
          caixa_id: string
          chave_idempotencia: string
          id?: never
          meio: string
          motivo?: string | null
          ocorrido_em?: string
          organizacao_id: string
          pagamento_id?: string | null
          tipo: string
          usuario_id?: string | null
          valor_centavos: number
          venda_id?: string | null
        }
        Update: {
          caixa_id?: string
          chave_idempotencia?: string
          id?: never
          meio?: string
          motivo?: string | null
          ocorrido_em?: string
          organizacao_id?: string
          pagamento_id?: string | null
          tipo?: string
          usuario_id?: string | null
          valor_centavos?: number
          venda_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "caixa_movimentos_caixa_id_fkey"
            columns: ["caixa_id"]
            isOneToOne: false
            referencedRelation: "caixas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixa_movimentos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      caixas: {
        Row: {
          aberto_em: string
          chave_abertura: string
          conferido_em: string | null
          conferido_por: string | null
          contado_centavos: number | null
          diferenca_centavos: number | null
          esperado_centavos: number | null
          fechado_em: string | null
          fundo_centavos: number
          id: string
          observacao_conferencia: string | null
          observacao_fechamento: string | null
          operador_id: string
          organizacao_id: string
          situacao: string
          unidade_id: string
        }
        Insert: {
          aberto_em?: string
          chave_abertura: string
          conferido_em?: string | null
          conferido_por?: string | null
          contado_centavos?: number | null
          diferenca_centavos?: number | null
          esperado_centavos?: number | null
          fechado_em?: string | null
          fundo_centavos: number
          id?: string
          observacao_conferencia?: string | null
          observacao_fechamento?: string | null
          operador_id: string
          organizacao_id: string
          situacao?: string
          unidade_id: string
        }
        Update: {
          aberto_em?: string
          chave_abertura?: string
          conferido_em?: string | null
          conferido_por?: string | null
          contado_centavos?: number | null
          diferenca_centavos?: number | null
          esperado_centavos?: number | null
          fechado_em?: string | null
          fundo_centavos?: number
          id?: string
          observacao_conferencia?: string | null
          observacao_fechamento?: string | null
          operador_id?: string
          organizacao_id?: string
          situacao?: string
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "caixas_conferido_por_fkey"
            columns: ["conferido_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixas_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixas_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
          },
        ]
      }
      categorias: {
        Row: {
          ativa: boolean
          criado_em: string
          desconto_teto_pb: number | null
          id: string
          margem_minima_pb: number | null
          nome: string
          organizacao_id: string
        }
        Insert: {
          ativa?: boolean
          criado_em?: string
          desconto_teto_pb?: number | null
          id?: string
          margem_minima_pb?: number | null
          nome: string
          organizacao_id: string
        }
        Update: {
          ativa?: boolean
          criado_em?: string
          desconto_teto_pb?: number | null
          id?: string
          margem_minima_pb?: number | null
          nome?: string
          organizacao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categorias_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_consentimentos: {
        Row: {
          canal: string
          cliente_id: string
          finalidade: string
          fonte: string
          id: number
          organizacao_id: string
          registrado_em: string
          registrado_por: string
          situacao: string
          unidade_id: string | null
        }
        Insert: {
          canal: string
          cliente_id: string
          finalidade: string
          fonte: string
          id?: never
          organizacao_id: string
          registrado_em?: string
          registrado_por: string
          situacao: string
          unidade_id?: string | null
        }
        Update: {
          canal?: string
          cliente_id?: string
          finalidade?: string
          fonte?: string
          id?: never
          organizacao_id?: string
          registrado_em?: string
          registrado_por?: string
          situacao?: string
          unidade_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_consentimentos_cliente_id_organizacao_id_fkey"
            columns: ["cliente_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "cliente_consentimentos_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_consentimentos_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          atualizado_em: string | null
          atualizado_por: string | null
          chave_criacao: string
          conteudo_criacao: string
          criado_em: string
          criado_por: string
          documento_mascara: string | null
          documento_resumo: string | null
          email_mascara: string | null
          endereco_informado: boolean
          finalidades: string[]
          id: string
          nascimento_informado: boolean
          nome: string
          numero: number
          organizacao_id: string
          origem: string
          situacao: string
          telefone_mascara: string | null
          telefone_resumo: string | null
          tipo: string
          unidade_origem_id: string | null
        }
        Insert: {
          atualizado_em?: string | null
          atualizado_por?: string | null
          chave_criacao: string
          conteudo_criacao: string
          criado_em?: string
          criado_por: string
          documento_mascara?: string | null
          documento_resumo?: string | null
          email_mascara?: string | null
          endereco_informado?: boolean
          finalidades?: string[]
          id?: string
          nascimento_informado?: boolean
          nome: string
          numero?: never
          organizacao_id: string
          origem?: string
          situacao?: string
          telefone_mascara?: string | null
          telefone_resumo?: string | null
          tipo: string
          unidade_origem_id?: string | null
        }
        Update: {
          atualizado_em?: string | null
          atualizado_por?: string | null
          chave_criacao?: string
          conteudo_criacao?: string
          criado_em?: string
          criado_por?: string
          documento_mascara?: string | null
          documento_resumo?: string | null
          email_mascara?: string | null
          endereco_informado?: boolean
          finalidades?: string[]
          id?: string
          nascimento_informado?: boolean
          nome?: string
          numero?: never
          organizacao_id?: string
          origem?: string
          situacao?: string
          telefone_mascara?: string | null
          telefone_resumo?: string | null
          tipo?: string
          unidade_origem_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_unidade_origem_id_organizacao_id_fkey"
            columns: ["unidade_origem_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
          },
        ]
      }
      connect_eventos: {
        Row: {
          dados: Json | null
          id: number
          mensagem: string | null
          ocorrido_em: string
          operacao_id: string
          organizacao_id: string
          situacao_anterior: string | null
          situacao_nova: string | null
          status_http: number | null
          tipo: string
          usuario_id: string | null
        }
        Insert: {
          dados?: Json | null
          id?: never
          mensagem?: string | null
          ocorrido_em?: string
          operacao_id: string
          organizacao_id: string
          situacao_anterior?: string | null
          situacao_nova?: string | null
          status_http?: number | null
          tipo: string
          usuario_id?: string | null
        }
        Update: {
          dados?: Json | null
          id?: never
          mensagem?: string | null
          ocorrido_em?: string
          operacao_id?: string
          organizacao_id?: string
          situacao_anterior?: string | null
          situacao_nova?: string | null
          status_http?: number | null
          tipo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "connect_eventos_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "connect_operacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connect_eventos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      connect_habilitacoes: {
        Row: {
          alterado_em: string
          alterado_por: string | null
          evidencia: string
          habilitada: boolean
          id: string
          organizacao_id: string
          tipo: string
        }
        Insert: {
          alterado_em?: string
          alterado_por?: string | null
          evidencia: string
          habilitada: boolean
          id?: string
          organizacao_id: string
          tipo: string
        }
        Update: {
          alterado_em?: string
          alterado_por?: string | null
          evidencia?: string
          habilitada?: boolean
          id?: string
          organizacao_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "connect_habilitacoes_alterado_por_fkey"
            columns: ["alterado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connect_habilitacoes_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      connect_operacoes: {
        Row: {
          atualizado_em: string
          chave: string
          cliente_nome: string | null
          concluida_em: string | null
          conteudo: string
          criado_em: string
          data_cadastro_externa: string | null
          ddd: number | null
          documento_mascarado: string | null
          enviado_em: string | null
          enviando_desde: string | null
          esim: boolean
          evidencia: Json | null
          evidencia_chave: string | null
          iccid: string | null
          id: string
          id_externo: string | null
          item_serializado_id: string | null
          linha: string | null
          linha_doadora: string | null
          link_esim: string | null
          link_pagamento: string | null
          mensagem_operadora: string | null
          metodo_pagamento: string | null
          motivo_resolucao: string | null
          numero: number
          numero_ativado: string | null
          operadora_doadora_id: number | null
          organizacao_id: string
          plano_id: number | null
          plano_nome: string | null
          proxima_consulta_em: string | null
          recebido_na_loja_centavos: number | null
          resolvida_por: string | null
          situacao: string
          tentativas_consulta: number
          tipo: string
          unidade_id: string
          uuid_externo: string | null
          valor_face_centavos: number | null
          venda_chip_id: string | null
          venda_item_id: string | null
          vendedor_id: string
        }
        Insert: {
          atualizado_em?: string
          chave: string
          cliente_nome?: string | null
          concluida_em?: string | null
          conteudo: string
          criado_em?: string
          data_cadastro_externa?: string | null
          ddd?: number | null
          documento_mascarado?: string | null
          enviado_em?: string | null
          enviando_desde?: string | null
          esim?: boolean
          evidencia?: Json | null
          evidencia_chave?: string | null
          iccid?: string | null
          id?: string
          id_externo?: string | null
          item_serializado_id?: string | null
          linha?: string | null
          linha_doadora?: string | null
          link_esim?: string | null
          link_pagamento?: string | null
          mensagem_operadora?: string | null
          metodo_pagamento?: string | null
          motivo_resolucao?: string | null
          numero?: never
          numero_ativado?: string | null
          operadora_doadora_id?: number | null
          organizacao_id: string
          plano_id?: number | null
          plano_nome?: string | null
          proxima_consulta_em?: string | null
          recebido_na_loja_centavos?: number | null
          resolvida_por?: string | null
          situacao?: string
          tentativas_consulta?: number
          tipo: string
          unidade_id: string
          uuid_externo?: string | null
          valor_face_centavos?: number | null
          venda_chip_id?: string | null
          venda_item_id?: string | null
          vendedor_id: string
        }
        Update: {
          atualizado_em?: string
          chave?: string
          cliente_nome?: string | null
          concluida_em?: string | null
          conteudo?: string
          criado_em?: string
          data_cadastro_externa?: string | null
          ddd?: number | null
          documento_mascarado?: string | null
          enviado_em?: string | null
          enviando_desde?: string | null
          esim?: boolean
          evidencia?: Json | null
          evidencia_chave?: string | null
          iccid?: string | null
          id?: string
          id_externo?: string | null
          item_serializado_id?: string | null
          linha?: string | null
          linha_doadora?: string | null
          link_esim?: string | null
          link_pagamento?: string | null
          mensagem_operadora?: string | null
          metodo_pagamento?: string | null
          motivo_resolucao?: string | null
          numero?: never
          numero_ativado?: string | null
          operadora_doadora_id?: number | null
          organizacao_id?: string
          plano_id?: number | null
          plano_nome?: string | null
          proxima_consulta_em?: string | null
          recebido_na_loja_centavos?: number | null
          resolvida_por?: string | null
          situacao?: string
          tentativas_consulta?: number
          tipo?: string
          unidade_id?: string
          uuid_externo?: string | null
          valor_face_centavos?: number | null
          venda_chip_id?: string | null
          venda_item_id?: string | null
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connect_operacoes_item_serializado_id_fkey"
            columns: ["item_serializado_id"]
            isOneToOne: false
            referencedRelation: "itens_serializados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connect_operacoes_resolvida_por_fkey"
            columns: ["resolvida_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connect_operacoes_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "connect_operacoes_venda_chip_id_fkey"
            columns: ["venda_chip_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connect_operacoes_venda_item_id_fkey"
            columns: ["venda_item_id"]
            isOneToOne: false
            referencedRelation: "venda_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connect_operacoes_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      connect_operacoes_custos: {
        Row: {
          atualizado_em: string
          operacao_id: string
          organizacao_id: string
          unidade_id: string
          valor_debitado_centavos: number
        }
        Insert: {
          atualizado_em?: string
          operacao_id: string
          organizacao_id: string
          unidade_id: string
          valor_debitado_centavos: number
        }
        Update: {
          atualizado_em?: string
          operacao_id?: string
          organizacao_id?: string
          unidade_id?: string
          valor_debitado_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "connect_operacoes_custos_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: true
            referencedRelation: "connect_operacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connect_operacoes_custos_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
          },
        ]
      }
      connect_producao: {
        Row: {
          confirmado_em: string
          id: number
          operacao_id: string
          organizacao_id: string
          origem: string
          tipo: string
          unidade_id: string
          valor_face_centavos: number | null
          vendedor_id: string
        }
        Insert: {
          confirmado_em?: string
          id?: never
          operacao_id: string
          organizacao_id: string
          origem: string
          tipo: string
          unidade_id: string
          valor_face_centavos?: number | null
          vendedor_id: string
        }
        Update: {
          confirmado_em?: string
          id?: never
          operacao_id?: string
          organizacao_id?: string
          origem?: string
          tipo?: string
          unidade_id?: string
          valor_face_centavos?: number | null
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connect_producao_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: true
            referencedRelation: "connect_operacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connect_producao_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "connect_producao_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      connect_referencias: {
        Row: {
          ativo: boolean
          atualizado_em: string
          codigo: string
          dados: Json
          nome: string
          organizacao_id: string
          tipo: string
          uf: string | null
          valor_centavos: number | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          codigo: string
          dados?: Json
          nome: string
          organizacao_id: string
          tipo: string
          uf?: string | null
          valor_centavos?: number | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          codigo?: string
          dados?: Json
          nome?: string
          organizacao_id?: string
          tipo?: string
          uf?: string | null
          valor_centavos?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "connect_referencias_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_a_receber: {
        Row: {
          atualizado_em: string
          criado_em: string
          devedor: string
          id: string
          organizacao_id: string
          pagamento_id: string
          situacao: string
          unidade_id: string
          valor_centavos: number
          vencimento: string | null
          venda_id: string
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          devedor: string
          id?: string
          organizacao_id: string
          pagamento_id: string
          situacao?: string
          unidade_id: string
          valor_centavos: number
          vencimento?: string | null
          venda_id: string
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          devedor?: string
          id?: string
          organizacao_id?: string
          pagamento_id?: string
          situacao?: string
          unidade_id?: string
          valor_centavos?: number
          vencimento?: string | null
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contas_a_receber_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "venda_pagamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_a_receber_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      contexto_sessao: {
        Row: {
          iniciado_em: string
          sessao_id: string
          trocado_em: string
          unidade_atual_id: string
          usuario_id: string
        }
        Insert: {
          iniciado_em?: string
          sessao_id: string
          trocado_em?: string
          unidade_atual_id: string
          usuario_id: string
        }
        Update: {
          iniciado_em?: string
          sessao_id?: string
          trocado_em?: string
          unidade_atual_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contexto_sessao_unidade_atual_id_fkey"
            columns: ["unidade_atual_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contexto_sessao_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      convites: {
        Row: {
          atualizado_em: string
          criado_em: string
          criado_por: string
          email: string
          erro: string | null
          id: string
          motivo: string
          nome: string
          organizacao_id: string
          papel: string
          situacao: string
          tentativas: number
          unidades: string[]
          usuario_id: string | null
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          criado_por: string
          email: string
          erro?: string | null
          id?: string
          motivo: string
          nome: string
          organizacao_id: string
          papel: string
          situacao?: string
          tentativas?: number
          unidades?: string[]
          usuario_id?: string | null
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          criado_por?: string
          email?: string
          erro?: string | null
          id?: string
          motivo?: string
          nome?: string
          organizacao_id?: string
          papel?: string
          situacao?: string
          tentativas?: number
          unidades?: string[]
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "convites_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "convites_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "convites_papel_fkey"
            columns: ["papel"]
            isOneToOne: false
            referencedRelation: "papeis"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "convites_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      custos: {
        Row: {
          criado_em: string
          criado_por: string | null
          id: string
          inicio: string
          organizacao_id: string
          origem: string
          referencia: string | null
          valor_centavos: number
          variante_id: string
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          id?: string
          inicio?: string
          organizacao_id: string
          origem: string
          referencia?: string | null
          valor_centavos: number
          variante_id: string
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          id?: string
          inicio?: string
          organizacao_id?: string
          origem?: string
          referencia?: string | null
          valor_centavos?: number
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custos_variante_id_organizacao_id_fkey"
            columns: ["variante_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id", "organizacao_id"]
          },
        ]
      }
      empresas: {
        Row: {
          cnpj_raiz: string
          criado_em: string
          id: string
          nome_fantasia: string | null
          organizacao_id: string
          razao_social: string
          status: string
        }
        Insert: {
          cnpj_raiz: string
          criado_em?: string
          id?: string
          nome_fantasia?: string | null
          organizacao_id: string
          razao_social: string
          status?: string
        }
        Update: {
          cnpj_raiz?: string
          criado_em?: string
          id?: string
          nome_fantasia?: string | null
          organizacao_id?: string
          razao_social?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "empresas_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      entrada_itens: {
        Row: {
          condicao: string
          custo_unitario_centavos: number | null
          entrada_id: string
          itens: string[]
          linha: number
          organizacao_id: string
          quantidade: number
          variante_id: string
        }
        Insert: {
          condicao: string
          custo_unitario_centavos?: number | null
          entrada_id: string
          itens?: string[]
          linha: number
          organizacao_id: string
          quantidade: number
          variante_id: string
        }
        Update: {
          condicao?: string
          custo_unitario_centavos?: number | null
          entrada_id?: string
          itens?: string[]
          linha?: number
          organizacao_id?: string
          quantidade?: number
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entrada_itens_entrada_id_fkey"
            columns: ["entrada_id"]
            isOneToOne: false
            referencedRelation: "entradas_estoque"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entrada_itens_variante_id_organizacao_id_fkey"
            columns: ["variante_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id", "organizacao_id"]
          },
        ]
      }
      entradas_estoque: {
        Row: {
          chave: string
          conteudo: string
          criado_em: string
          criado_por: string
          documento: string | null
          estornado_em: string | null
          estornado_por: string | null
          fornecedor_id: string | null
          id: string
          motivo_estorno: string | null
          numero: number
          organizacao_id: string
          situacao: string
          tipo: string
          total_custo_centavos: number | null
          total_unidades: number
          unidade_id: string
        }
        Insert: {
          chave: string
          conteudo: string
          criado_em?: string
          criado_por: string
          documento?: string | null
          estornado_em?: string | null
          estornado_por?: string | null
          fornecedor_id?: string | null
          id?: string
          motivo_estorno?: string | null
          numero?: never
          organizacao_id: string
          situacao?: string
          tipo: string
          total_custo_centavos?: number | null
          total_unidades: number
          unidade_id: string
        }
        Update: {
          chave?: string
          conteudo?: string
          criado_em?: string
          criado_por?: string
          documento?: string | null
          estornado_em?: string | null
          estornado_por?: string | null
          fornecedor_id?: string | null
          id?: string
          motivo_estorno?: string | null
          numero?: never
          organizacao_id?: string
          situacao?: string
          tipo?: string
          total_custo_centavos?: number | null
          total_unidades?: number
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entradas_estoque_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entradas_estoque_estornado_por_fkey"
            columns: ["estornado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entradas_estoque_fornecedor_id_organizacao_id_fkey"
            columns: ["fornecedor_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "entradas_estoque_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
          },
        ]
      }
      estoque_movimentos: {
        Row: {
          chave_idempotencia: string | null
          id: number
          item_serializado_id: string | null
          motivo: string | null
          ocorrido_em: string
          organizacao_id: string
          quantidade: number
          referencia_id: string | null
          referencia_tipo: string | null
          tipo: string
          unidade_id: string
          usuario_id: string | null
          variante_id: string
        }
        Insert: {
          chave_idempotencia?: string | null
          id?: never
          item_serializado_id?: string | null
          motivo?: string | null
          ocorrido_em?: string
          organizacao_id: string
          quantidade: number
          referencia_id?: string | null
          referencia_tipo?: string | null
          tipo: string
          unidade_id: string
          usuario_id?: string | null
          variante_id: string
        }
        Update: {
          chave_idempotencia?: string | null
          id?: never
          item_serializado_id?: string | null
          motivo?: string | null
          ocorrido_em?: string
          organizacao_id?: string
          quantidade?: number
          referencia_id?: string | null
          referencia_tipo?: string | null
          tipo?: string
          unidade_id?: string
          usuario_id?: string | null
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estoque_movimentos_item_serializado_id_fkey"
            columns: ["item_serializado_id"]
            isOneToOne: false
            referencedRelation: "itens_serializados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimentos_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "estoque_movimentos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimentos_variante_id_organizacao_id_fkey"
            columns: ["variante_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id", "organizacao_id"]
          },
        ]
      }
      estoque_reservas: {
        Row: {
          chave_idempotencia: string
          criado_em: string
          criado_por: string | null
          encerrada_em: string | null
          expira_em: string
          id: string
          item_serializado_id: string | null
          organizacao_id: string
          origem: string
          quantidade: number
          situacao: string
          unidade_id: string
          variante_id: string
        }
        Insert: {
          chave_idempotencia: string
          criado_em?: string
          criado_por?: string | null
          encerrada_em?: string | null
          expira_em: string
          id?: string
          item_serializado_id?: string | null
          organizacao_id: string
          origem: string
          quantidade: number
          situacao?: string
          unidade_id: string
          variante_id: string
        }
        Update: {
          chave_idempotencia?: string
          criado_em?: string
          criado_por?: string | null
          encerrada_em?: string | null
          expira_em?: string
          id?: string
          item_serializado_id?: string | null
          organizacao_id?: string
          origem?: string
          quantidade?: number
          situacao?: string
          unidade_id?: string
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estoque_reservas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_reservas_item_serializado_id_fkey"
            columns: ["item_serializado_id"]
            isOneToOne: false
            referencedRelation: "itens_serializados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_reservas_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "estoque_reservas_variante_id_organizacao_id_fkey"
            columns: ["variante_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id", "organizacao_id"]
          },
        ]
      }
      estoque_saldos: {
        Row: {
          atualizado_em: string
          organizacao_id: string
          quantidade: number
          reservado: number
          unidade_id: string
          variante_id: string
        }
        Insert: {
          atualizado_em?: string
          organizacao_id: string
          quantidade?: number
          reservado?: number
          unidade_id: string
          variante_id: string
        }
        Update: {
          atualizado_em?: string
          organizacao_id?: string
          quantidade?: number
          reservado?: number
          unidade_id?: string
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estoque_saldos_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "estoque_saldos_variante_id_organizacao_id_fkey"
            columns: ["variante_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id", "organizacao_id"]
          },
        ]
      }
      estornos_externos: {
        Row: {
          comprovante: string | null
          confirmado_em: string | null
          confirmado_por: string | null
          devolucao_id: string | null
          id: string
          meio: string
          numero: number
          observacao: string | null
          organizacao_id: string
          pagamento_id: string | null
          situacao: string
          solicitado_em: string
          solicitado_por: string
          unidade_id: string
          valor_centavos: number
          venda_id: string
        }
        Insert: {
          comprovante?: string | null
          confirmado_em?: string | null
          confirmado_por?: string | null
          devolucao_id?: string | null
          id?: string
          meio: string
          numero?: never
          observacao?: string | null
          organizacao_id: string
          pagamento_id?: string | null
          situacao?: string
          solicitado_em?: string
          solicitado_por: string
          unidade_id: string
          valor_centavos: number
          venda_id: string
        }
        Update: {
          comprovante?: string | null
          confirmado_em?: string | null
          confirmado_por?: string | null
          devolucao_id?: string | null
          id?: string
          meio?: string
          numero?: never
          observacao?: string | null
          organizacao_id?: string
          pagamento_id?: string | null
          situacao?: string
          solicitado_em?: string
          solicitado_por?: string
          unidade_id?: string
          valor_centavos?: number
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estornos_externos_confirmado_por_fkey"
            columns: ["confirmado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estornos_externos_devolucao_id_fkey"
            columns: ["devolucao_id"]
            isOneToOne: false
            referencedRelation: "venda_devolucoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estornos_externos_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "venda_pagamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estornos_externos_solicitado_por_fkey"
            columns: ["solicitado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estornos_externos_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "estornos_externos_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_politicas: {
        Row: {
          alerta_minutos: number | null
          alterado_em: string
          alterado_por: string | null
          fonte: string
          id: string
          organizacao_id: string
        }
        Insert: {
          alerta_minutos?: number | null
          alterado_em?: string
          alterado_por?: string | null
          fonte: string
          id?: string
          organizacao_id: string
        }
        Update: {
          alerta_minutos?: number | null
          alterado_em?: string
          alterado_por?: string | null
          fonte?: string
          id?: string
          organizacao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_politicas_alterado_por_fkey"
            columns: ["alterado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_politicas_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: true
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      fornecedores: {
        Row: {
          ativo: boolean
          cnpj: string | null
          contato: string | null
          criado_em: string
          criado_por: string
          id: string
          nome: string
          organizacao_id: string
        }
        Insert: {
          ativo?: boolean
          cnpj?: string | null
          contato?: string | null
          criado_em?: string
          criado_por: string
          id?: string
          nome: string
          organizacao_id: string
        }
        Update: {
          ativo?: boolean
          cnpj?: string | null
          contato?: string | null
          criado_em?: string
          criado_por?: string
          id?: string
          nome?: string
          organizacao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fornecedores_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fornecedores_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      fotos_produto: {
        Row: {
          altura: number
          bytes: number
          caminho: string
          criado_em: string
          criado_por: string | null
          id: string
          ilustracao: boolean
          largura: number
          organizacao_id: string
          produto_id: string
          substituida_em: string | null
          tipo: string
          variante_id: string | null
        }
        Insert: {
          altura: number
          bytes: number
          caminho: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          ilustracao?: boolean
          largura: number
          organizacao_id: string
          produto_id: string
          substituida_em?: string | null
          tipo: string
          variante_id?: string | null
        }
        Update: {
          altura?: number
          bytes?: number
          caminho?: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          ilustracao?: boolean
          largura?: number
          organizacao_id?: string
          produto_id?: string
          substituida_em?: string | null
          tipo?: string
          variante_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fotos_produto_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fotos_produto_produto_id_organizacao_id_fkey"
            columns: ["produto_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "fotos_produto_variante_id_organizacao_id_fkey"
            columns: ["variante_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id", "organizacao_id"]
          },
        ]
      }
      importacao_linhas: {
        Row: {
          acao: string
          antes: Json | null
          dados: Json
          depois: Json | null
          diferencas: Json
          erros: string[]
          importacao_id: string
          numero: number
          variante_id: string | null
        }
        Insert: {
          acao: string
          antes?: Json | null
          dados: Json
          depois?: Json | null
          diferencas?: Json
          erros?: string[]
          importacao_id: string
          numero: number
          variante_id?: string | null
        }
        Update: {
          acao?: string
          antes?: Json | null
          dados?: Json
          depois?: Json | null
          diferencas?: Json
          erros?: string[]
          importacao_id?: string
          numero?: number
          variante_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "importacao_linhas_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "importacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "importacao_linhas_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      importacoes: {
        Row: {
          aplicado_em: string | null
          aplicado_por: string | null
          arquivo_nome: string
          arquivo_sha256: string
          criado_em: string
          criado_por: string
          encerrado_em: string | null
          encerrado_por: string | null
          id: string
          mapeamento: Json
          motivo: string | null
          numero: number
          organizacao_id: string
          situacao: string
          tipo: string
          totais: Json
        }
        Insert: {
          aplicado_em?: string | null
          aplicado_por?: string | null
          arquivo_nome: string
          arquivo_sha256: string
          criado_em?: string
          criado_por: string
          encerrado_em?: string | null
          encerrado_por?: string | null
          id?: string
          mapeamento: Json
          motivo?: string | null
          numero?: never
          organizacao_id: string
          situacao?: string
          tipo?: string
          totais?: Json
        }
        Update: {
          aplicado_em?: string | null
          aplicado_por?: string | null
          arquivo_nome?: string
          arquivo_sha256?: string
          criado_em?: string
          criado_por?: string
          encerrado_em?: string | null
          encerrado_por?: string | null
          id?: string
          mapeamento?: Json
          motivo?: string | null
          numero?: never
          organizacao_id?: string
          situacao?: string
          tipo?: string
          totais?: Json
        }
        Relationships: [
          {
            foreignKeyName: "importacoes_aplicado_por_fkey"
            columns: ["aplicado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "importacoes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "importacoes_encerrado_por_fkey"
            columns: ["encerrado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "importacoes_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      inventario_itens: {
        Row: {
          ajuste_quantidade: number | null
          contado_em: string | null
          contado_por: string | null
          contado_quantidade: number | null
          contados: string[] | null
          encontrados_fora: string[] | null
          inventario_id: string
          itens_baixados: string[] | null
          nao_baixados: string[] | null
          organizacao_id: string
          sistema_itens: string[] | null
          sistema_quantidade: number | null
          tipo: string
          variante_id: string
        }
        Insert: {
          ajuste_quantidade?: number | null
          contado_em?: string | null
          contado_por?: string | null
          contado_quantidade?: number | null
          contados?: string[] | null
          encontrados_fora?: string[] | null
          inventario_id: string
          itens_baixados?: string[] | null
          nao_baixados?: string[] | null
          organizacao_id: string
          sistema_itens?: string[] | null
          sistema_quantidade?: number | null
          tipo: string
          variante_id: string
        }
        Update: {
          ajuste_quantidade?: number | null
          contado_em?: string | null
          contado_por?: string | null
          contado_quantidade?: number | null
          contados?: string[] | null
          encontrados_fora?: string[] | null
          inventario_id?: string
          itens_baixados?: string[] | null
          nao_baixados?: string[] | null
          organizacao_id?: string
          sistema_itens?: string[] | null
          sistema_quantidade?: number | null
          tipo?: string
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventario_itens_contado_por_fkey"
            columns: ["contado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_itens_inventario_id_fkey"
            columns: ["inventario_id"]
            isOneToOne: false
            referencedRelation: "inventarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_itens_variante_id_organizacao_id_fkey"
            columns: ["variante_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id", "organizacao_id"]
          },
        ]
      }
      inventarios: {
        Row: {
          chave: string
          criado_em: string
          criado_por: string
          decidido_em: string | null
          decidido_por: string | null
          descricao: string
          enviado_em: string | null
          enviado_por: string | null
          id: string
          motivo_decisao: string | null
          motivo_envio: string | null
          numero: number
          organizacao_id: string
          situacao: string
          unidade_id: string
        }
        Insert: {
          chave: string
          criado_em?: string
          criado_por: string
          decidido_em?: string | null
          decidido_por?: string | null
          descricao: string
          enviado_em?: string | null
          enviado_por?: string | null
          id?: string
          motivo_decisao?: string | null
          motivo_envio?: string | null
          numero?: never
          organizacao_id: string
          situacao?: string
          unidade_id: string
        }
        Update: {
          chave?: string
          criado_em?: string
          criado_por?: string
          decidido_em?: string | null
          decidido_por?: string | null
          descricao?: string
          enviado_em?: string | null
          enviado_por?: string | null
          id?: string
          motivo_decisao?: string | null
          motivo_envio?: string | null
          numero?: never
          organizacao_id?: string
          situacao?: string
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventarios_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventarios_decidido_por_fkey"
            columns: ["decidido_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventarios_enviado_por_fkey"
            columns: ["enviado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventarios_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
          },
        ]
      }
      itens_serializados: {
        Row: {
          condicao: string
          conferido_em: string | null
          conferido_por: string | null
          criado_em: string
          em_estoque: boolean
          iccid: string | null
          id: string
          imei: string | null
          imei2: string | null
          numero_serie: string | null
          organizacao_id: string
          situacao: string
          unidade_id: string
          variante_id: string
        }
        Insert: {
          condicao?: string
          conferido_em?: string | null
          conferido_por?: string | null
          criado_em?: string
          em_estoque?: boolean
          iccid?: string | null
          id?: string
          imei?: string | null
          imei2?: string | null
          numero_serie?: string | null
          organizacao_id: string
          situacao?: string
          unidade_id: string
          variante_id: string
        }
        Update: {
          condicao?: string
          conferido_em?: string | null
          conferido_por?: string | null
          criado_em?: string
          em_estoque?: boolean
          iccid?: string | null
          id?: string
          imei?: string | null
          imei2?: string | null
          numero_serie?: string | null
          organizacao_id?: string
          situacao?: string
          unidade_id?: string
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "itens_serializados_conferido_por_fkey"
            columns: ["conferido_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_serializados_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "itens_serializados_variante_id_organizacao_id_fkey"
            columns: ["variante_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id", "organizacao_id"]
          },
        ]
      }
      marcas: {
        Row: {
          criado_em: string
          id: string
          nome: string
          organizacao_id: string
        }
        Insert: {
          criado_em?: string
          id?: string
          nome: string
          organizacao_id: string
        }
        Update: {
          criado_em?: string
          id?: string
          nome?: string
          organizacao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marcas_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      notas_eventos: {
        Row: {
          id: number
          observacao: string | null
          ocorrido_em: string
          organizacao_id: string
          pedido_id: string
          tipo: string
          usuario_id: string | null
        }
        Insert: {
          id?: never
          observacao?: string | null
          ocorrido_em?: string
          organizacao_id: string
          pedido_id: string
          tipo: string
          usuario_id?: string | null
        }
        Update: {
          id?: never
          observacao?: string | null
          ocorrido_em?: string
          organizacao_id?: string
          pedido_id?: string
          tipo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notas_eventos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "notas_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_eventos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      notas_pedidos: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          atualizado_em: string
          chave: string
          chave_acesso: string | null
          criado_em: string
          destinatario_mascarado: string | null
          destinatario_nome: string | null
          devolucao_id: string | null
          emitida_em: string | null
          emitida_por: string | null
          id: string
          modelo: string | null
          motivo_cancelamento: string | null
          numero: number
          numero_documento: number | null
          observacao: string | null
          organizacao_id: string
          origem_emissao: string | null
          serie: number | null
          situacao: string
          solicitado_por: string
          tipo: string
          unidade_id: string
          venda_concluida_em: string
          venda_id: string
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          atualizado_em?: string
          chave: string
          chave_acesso?: string | null
          criado_em?: string
          destinatario_mascarado?: string | null
          destinatario_nome?: string | null
          devolucao_id?: string | null
          emitida_em?: string | null
          emitida_por?: string | null
          id?: string
          modelo?: string | null
          motivo_cancelamento?: string | null
          numero?: never
          numero_documento?: number | null
          observacao?: string | null
          organizacao_id: string
          origem_emissao?: string | null
          serie?: number | null
          situacao?: string
          solicitado_por: string
          tipo?: string
          unidade_id: string
          venda_concluida_em: string
          venda_id: string
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          atualizado_em?: string
          chave?: string
          chave_acesso?: string | null
          criado_em?: string
          destinatario_mascarado?: string | null
          destinatario_nome?: string | null
          devolucao_id?: string | null
          emitida_em?: string | null
          emitida_por?: string | null
          id?: string
          modelo?: string | null
          motivo_cancelamento?: string | null
          numero?: never
          numero_documento?: number | null
          observacao?: string | null
          organizacao_id?: string
          origem_emissao?: string | null
          serie?: number | null
          situacao?: string
          solicitado_por?: string
          tipo?: string
          unidade_id?: string
          venda_concluida_em?: string
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notas_pedidos_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_pedidos_devolucao_id_fkey"
            columns: ["devolucao_id"]
            isOneToOne: false
            referencedRelation: "venda_devolucoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_pedidos_emitida_por_fkey"
            columns: ["emitida_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_pedidos_solicitado_por_fkey"
            columns: ["solicitado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_pedidos_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "notas_pedidos_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      organizacoes: {
        Row: {
          criado_em: string
          id: string
          nome: string
          status: string
        }
        Insert: {
          criado_em?: string
          id?: string
          nome: string
          status?: string
        }
        Update: {
          criado_em?: string
          id?: string
          nome?: string
          status?: string
        }
        Relationships: []
      }
      papeis: {
        Row: {
          ativo: boolean
          codigo: string
          escopo_padrao: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          codigo: string
          escopo_padrao: string
          nome: string
        }
        Update: {
          ativo?: boolean
          codigo?: string
          escopo_padrao?: string
          nome?: string
        }
        Relationships: []
      }
      papel_permissoes: {
        Row: {
          papel: string
          permissao: string
        }
        Insert: {
          papel: string
          permissao: string
        }
        Update: {
          papel?: string
          permissao?: string
        }
        Relationships: [
          {
            foreignKeyName: "papel_permissoes_papel_fkey"
            columns: ["papel"]
            isOneToOne: false
            referencedRelation: "papeis"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "papel_permissoes_permissao_fkey"
            columns: ["permissao"]
            isOneToOne: false
            referencedRelation: "permissoes"
            referencedColumns: ["codigo"]
          },
        ]
      }
      perfis_usuario: {
        Row: {
          criado_em: string
          email: string
          id: string
          nome: string
          status: string
          ultimo_acesso_em: string | null
        }
        Insert: {
          criado_em?: string
          email: string
          id: string
          nome: string
          status?: string
          ultimo_acesso_em?: string | null
        }
        Update: {
          criado_em?: string
          email?: string
          id?: string
          nome?: string
          status?: string
          ultimo_acesso_em?: string | null
        }
        Relationships: []
      }
      permissoes: {
        Row: {
          codigo: string
          descricao: string
          modulo: string
        }
        Insert: {
          codigo: string
          descricao: string
          modulo: string
        }
        Update: {
          codigo?: string
          descricao?: string
          modulo?: string
        }
        Relationships: []
      }
      precos: {
        Row: {
          canal: string
          cancelado_em: string | null
          cancelado_por: string | null
          criado_em: string
          criado_por: string | null
          fim: string | null
          id: string
          inicio: string
          motivo: string | null
          motivo_cancelamento: string | null
          organizacao_id: string
          origem: string
          unidade_id: string | null
          valor_centavos: number
          variante_id: string
        }
        Insert: {
          canal?: string
          cancelado_em?: string | null
          cancelado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          fim?: string | null
          id?: string
          inicio?: string
          motivo?: string | null
          motivo_cancelamento?: string | null
          organizacao_id: string
          origem: string
          unidade_id?: string | null
          valor_centavos: number
          variante_id: string
        }
        Update: {
          canal?: string
          cancelado_em?: string | null
          cancelado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          fim?: string | null
          id?: string
          inicio?: string
          motivo?: string | null
          motivo_cancelamento?: string | null
          organizacao_id?: string
          origem?: string
          unidade_id?: string | null
          valor_centavos?: number
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "precos_cancelado_por_fkey"
            columns: ["cancelado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "precos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "precos_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "precos_variante_id_organizacao_id_fkey"
            columns: ["variante_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id", "organizacao_id"]
          },
        ]
      }
      produtos: {
        Row: {
          ativo: boolean
          categoria_id: string
          chave_criacao: string | null
          criado_em: string
          descricao: string | null
          id: string
          marca_id: string | null
          modelo: string | null
          nome: string
          organizacao_id: string
          publicar_online: boolean
          tipo: string
        }
        Insert: {
          ativo?: boolean
          categoria_id: string
          chave_criacao?: string | null
          criado_em?: string
          descricao?: string | null
          id?: string
          marca_id?: string | null
          modelo?: string | null
          nome: string
          organizacao_id: string
          publicar_online?: boolean
          tipo: string
        }
        Update: {
          ativo?: boolean
          categoria_id?: string
          chave_criacao?: string | null
          criado_em?: string
          descricao?: string | null
          id?: string
          marca_id?: string | null
          modelo?: string | null
          nome?: string
          organizacao_id?: string
          publicar_online?: boolean
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "produtos_categoria_id_organizacao_id_fkey"
            columns: ["categoria_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "produtos_marca_id_organizacao_id_fkey"
            columns: ["marca_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "marcas"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "produtos_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      transferencia_itens: {
        Row: {
          item_serializado_id: string
          recebido: boolean | null
          reserva_id: string
          transferencia_id: string
        }
        Insert: {
          item_serializado_id: string
          recebido?: boolean | null
          reserva_id: string
          transferencia_id: string
        }
        Update: {
          item_serializado_id?: string
          recebido?: boolean | null
          reserva_id?: string
          transferencia_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transferencia_itens_item_serializado_id_fkey"
            columns: ["item_serializado_id"]
            isOneToOne: false
            referencedRelation: "itens_serializados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencia_itens_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "estoque_reservas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencia_itens_transferencia_id_fkey"
            columns: ["transferencia_id"]
            isOneToOne: false
            referencedRelation: "transferencias"
            referencedColumns: ["id"]
          },
        ]
      }
      transferencias: {
        Row: {
          atualizado_em: string
          chave: string
          conteudo: string
          destino_id: string
          encerrado_em: string | null
          encerrado_por: string | null
          enviado_em: string | null
          enviado_por: string | null
          id: string
          motivo: string
          numero: number
          observacao: string | null
          organizacao_id: string
          origem_id: string
          quantidade: number
          quantidade_recebida: number | null
          recebido_em: string | null
          recebido_por: string | null
          reserva_id: string | null
          separado_em: string | null
          separado_por: string | null
          situacao: string
          solicitado_em: string
          solicitado_por: string
          variante_id: string
        }
        Insert: {
          atualizado_em?: string
          chave: string
          conteudo: string
          destino_id: string
          encerrado_em?: string | null
          encerrado_por?: string | null
          enviado_em?: string | null
          enviado_por?: string | null
          id?: string
          motivo: string
          numero?: never
          observacao?: string | null
          organizacao_id: string
          origem_id: string
          quantidade: number
          quantidade_recebida?: number | null
          recebido_em?: string | null
          recebido_por?: string | null
          reserva_id?: string | null
          separado_em?: string | null
          separado_por?: string | null
          situacao?: string
          solicitado_em?: string
          solicitado_por: string
          variante_id: string
        }
        Update: {
          atualizado_em?: string
          chave?: string
          conteudo?: string
          destino_id?: string
          encerrado_em?: string | null
          encerrado_por?: string | null
          enviado_em?: string | null
          enviado_por?: string | null
          id?: string
          motivo?: string
          numero?: never
          observacao?: string | null
          organizacao_id?: string
          origem_id?: string
          quantidade?: number
          quantidade_recebida?: number | null
          recebido_em?: string | null
          recebido_por?: string | null
          reserva_id?: string | null
          separado_em?: string | null
          separado_por?: string | null
          situacao?: string
          solicitado_em?: string
          solicitado_por?: string
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transferencias_destino_id_organizacao_id_fkey"
            columns: ["destino_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "transferencias_encerrado_por_fkey"
            columns: ["encerrado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencias_enviado_por_fkey"
            columns: ["enviado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencias_origem_id_organizacao_id_fkey"
            columns: ["origem_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "transferencias_recebido_por_fkey"
            columns: ["recebido_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencias_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "estoque_reservas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencias_separado_por_fkey"
            columns: ["separado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencias_solicitado_por_fkey"
            columns: ["solicitado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencias_variante_id_organizacao_id_fkey"
            columns: ["variante_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id", "organizacao_id"]
          },
        ]
      }
      unidade_configuracoes: {
        Row: {
          bairro: string | null
          cep: string | null
          complemento: string | null
          criado_em: string
          criado_por: string
          horarios: Json
          id: number
          inscricao_estadual: string | null
          inscricao_municipal: string | null
          logradouro: string | null
          motivo: string
          numero: string | null
          organizacao_id: string
          telefone: string | null
          unidade_id: string
          vigente_desde: string
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          complemento?: string | null
          criado_em?: string
          criado_por: string
          horarios?: Json
          id?: never
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          logradouro?: string | null
          motivo: string
          numero?: string | null
          organizacao_id: string
          telefone?: string | null
          unidade_id: string
          vigente_desde: string
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          complemento?: string | null
          criado_em?: string
          criado_por?: string
          horarios?: Json
          id?: never
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          logradouro?: string | null
          motivo?: string
          numero?: string | null
          organizacao_id?: string
          telefone?: string | null
          unidade_id?: string
          vigente_desde?: string
        }
        Relationships: [
          {
            foreignKeyName: "unidade_configuracoes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unidade_configuracoes_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
          },
        ]
      }
      unidades: {
        Row: {
          cidade: string | null
          cnpj: string | null
          codigo: string
          criado_em: string
          empresa_id: string
          endereco: string | null
          fuso: string
          id: string
          nome: string
          organizacao_id: string
          status: string
          tipo: string
          uf: string | null
          unidade_emissora_id: string | null
        }
        Insert: {
          cidade?: string | null
          cnpj?: string | null
          codigo: string
          criado_em?: string
          empresa_id: string
          endereco?: string | null
          fuso?: string
          id?: string
          nome: string
          organizacao_id: string
          status?: string
          tipo: string
          uf?: string | null
          unidade_emissora_id?: string | null
        }
        Update: {
          cidade?: string | null
          cnpj?: string | null
          codigo?: string
          criado_em?: string
          empresa_id?: string
          endereco?: string | null
          fuso?: string
          id?: string
          nome?: string
          organizacao_id?: string
          status?: string
          tipo?: string
          uf?: string | null
          unidade_emissora_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unidades_empresa_id_organizacao_id_fkey"
            columns: ["empresa_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "unidades_unidade_emissora_id_fkey"
            columns: ["unidade_emissora_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      vales_troca: {
        Row: {
          cliente_nome: string | null
          criado_em: string
          devolucao_id: string
          id: string
          numero: number
          organizacao_id: string
          saldo_centavos: number
          unidade_id: string
          valor_centavos: number
        }
        Insert: {
          cliente_nome?: string | null
          criado_em?: string
          devolucao_id: string
          id?: string
          numero?: never
          organizacao_id: string
          saldo_centavos: number
          unidade_id: string
          valor_centavos: number
        }
        Update: {
          cliente_nome?: string | null
          criado_em?: string
          devolucao_id?: string
          id?: string
          numero?: never
          organizacao_id?: string
          saldo_centavos?: number
          unidade_id?: string
          valor_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "vales_troca_devolucao_id_fkey"
            columns: ["devolucao_id"]
            isOneToOne: true
            referencedRelation: "venda_devolucoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vales_troca_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
          },
        ]
      }
      vales_troca_usos: {
        Row: {
          devolvido_em: string | null
          id: number
          pagamento_id: string
          usado_em: string
          vale_id: string
          valor_centavos: number
          venda_id: string
        }
        Insert: {
          devolvido_em?: string | null
          id?: never
          pagamento_id: string
          usado_em?: string
          vale_id: string
          valor_centavos: number
          venda_id: string
        }
        Update: {
          devolvido_em?: string | null
          id?: never
          pagamento_id?: string
          usado_em?: string
          vale_id?: string
          valor_centavos?: number
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vales_troca_usos_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: true
            referencedRelation: "venda_pagamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vales_troca_usos_vale_id_fkey"
            columns: ["vale_id"]
            isOneToOne: false
            referencedRelation: "vales_troca"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vales_troca_usos_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      variantes: {
        Row: {
          ativa: boolean
          capacidade: string | null
          codigo_barras: string | null
          cor: string | null
          criado_em: string
          estoque_minimo: number
          id: string
          nome: string
          organizacao_id: string
          produto_id: string
          sku: string
        }
        Insert: {
          ativa?: boolean
          capacidade?: string | null
          codigo_barras?: string | null
          cor?: string | null
          criado_em?: string
          estoque_minimo?: number
          id?: string
          nome: string
          organizacao_id: string
          produto_id: string
          sku: string
        }
        Update: {
          ativa?: boolean
          capacidade?: string | null
          codigo_barras?: string | null
          cor?: string | null
          criado_em?: string
          estoque_minimo?: number
          id?: string
          nome?: string
          organizacao_id?: string
          produto_id?: string
          sku?: string
        }
        Relationships: [
          {
            foreignKeyName: "variantes_produto_id_organizacao_id_fkey"
            columns: ["produto_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id", "organizacao_id"]
          },
        ]
      }
      venda_devolucao_itens: {
        Row: {
          condicao: string | null
          devolucao_id: string
          id: number
          quantidade: number
          valor_centavos: number
          venda_item_id: string
        }
        Insert: {
          condicao?: string | null
          devolucao_id: string
          id?: never
          quantidade: number
          valor_centavos: number
          venda_item_id: string
        }
        Update: {
          condicao?: string | null
          devolucao_id?: string
          id?: never
          quantidade?: number
          valor_centavos?: number
          venda_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venda_devolucao_itens_devolucao_id_fkey"
            columns: ["devolucao_id"]
            isOneToOne: false
            referencedRelation: "venda_devolucoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_devolucao_itens_venda_item_id_fkey"
            columns: ["venda_item_id"]
            isOneToOne: false
            referencedRelation: "venda_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      venda_devolucao_reembolsos: {
        Row: {
          devolucao_id: string
          id: number
          meio: string
          valor_centavos: number
        }
        Insert: {
          devolucao_id: string
          id?: never
          meio: string
          valor_centavos: number
        }
        Update: {
          devolucao_id?: string
          id?: never
          meio?: string
          valor_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "venda_devolucao_reembolsos_devolucao_id_fkey"
            columns: ["devolucao_id"]
            isOneToOne: false
            referencedRelation: "venda_devolucoes"
            referencedColumns: ["id"]
          },
        ]
      }
      venda_devolucoes: {
        Row: {
          caixa_id: string | null
          chave: string
          conteudo: string
          criado_em: string
          criado_por: string
          id: string
          motivo: string
          numero: number
          organizacao_id: string
          unidade_id: string
          valor_centavos: number
          venda_id: string
        }
        Insert: {
          caixa_id?: string | null
          chave: string
          conteudo: string
          criado_em?: string
          criado_por: string
          id?: string
          motivo: string
          numero?: never
          organizacao_id: string
          unidade_id: string
          valor_centavos: number
          venda_id: string
        }
        Update: {
          caixa_id?: string | null
          chave?: string
          conteudo?: string
          criado_em?: string
          criado_por?: string
          id?: string
          motivo?: string
          numero?: never
          organizacao_id?: string
          unidade_id?: string
          valor_centavos?: number
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venda_devolucoes_caixa_id_fkey"
            columns: ["caixa_id"]
            isOneToOne: false
            referencedRelation: "caixas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_devolucoes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_devolucoes_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "venda_devolucoes_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      venda_itens: {
        Row: {
          chave: string
          criado_em: string
          desconto_centavos: number
          id: string
          item_serializado_id: string | null
          organizacao_id: string
          preco_unitario_centavos: number
          quantidade: number
          reserva_id: string | null
          tipo: string
          variante_id: string
          venda_id: string
        }
        Insert: {
          chave: string
          criado_em?: string
          desconto_centavos?: number
          id?: string
          item_serializado_id?: string | null
          organizacao_id: string
          preco_unitario_centavos: number
          quantidade: number
          reserva_id?: string | null
          tipo: string
          variante_id: string
          venda_id: string
        }
        Update: {
          chave?: string
          criado_em?: string
          desconto_centavos?: number
          id?: string
          item_serializado_id?: string | null
          organizacao_id?: string
          preco_unitario_centavos?: number
          quantidade?: number
          reserva_id?: string | null
          tipo?: string
          variante_id?: string
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venda_itens_item_serializado_id_fkey"
            columns: ["item_serializado_id"]
            isOneToOne: false
            referencedRelation: "itens_serializados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_itens_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "estoque_reservas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_itens_variante_id_organizacao_id_fkey"
            columns: ["variante_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "venda_itens_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      venda_itens_custos: {
        Row: {
          custo_unitario_centavos: number
          item_id: string
          organizacao_id: string
          unidade_id: string
        }
        Insert: {
          custo_unitario_centavos: number
          item_id: string
          organizacao_id: string
          unidade_id: string
        }
        Update: {
          custo_unitario_centavos?: number
          item_id?: string
          organizacao_id?: string
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venda_itens_custos_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "venda_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      venda_pagamentos: {
        Row: {
          comprovante: string | null
          confirmacao: string
          confirmado_por: string | null
          criado_em: string
          entrada_centavos: number
          estornado_em: string | null
          id: string
          meio: string
          meio_entrada: string | null
          ordem: number
          organizacao_id: string
          situacao: string
          valor_centavos: number
          venda_id: string
        }
        Insert: {
          comprovante?: string | null
          confirmacao: string
          confirmado_por?: string | null
          criado_em?: string
          entrada_centavos?: number
          estornado_em?: string | null
          id?: string
          meio: string
          meio_entrada?: string | null
          ordem: number
          organizacao_id: string
          situacao?: string
          valor_centavos: number
          venda_id: string
        }
        Update: {
          comprovante?: string | null
          confirmacao?: string
          confirmado_por?: string | null
          criado_em?: string
          entrada_centavos?: number
          estornado_em?: string | null
          id?: string
          meio?: string
          meio_entrada?: string | null
          ordem?: number
          organizacao_id?: string
          situacao?: string
          valor_centavos?: number
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venda_pagamentos_confirmado_por_fkey"
            columns: ["confirmado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_pagamentos_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      venda_retornos: {
        Row: {
          condicao: string | null
          conferido_em: string | null
          conferido_por: string | null
          id: string
          motivo: string
          observacao: string | null
          organizacao_id: string
          quantidade: number
          situacao: string
          solicitado_em: string
          solicitado_por: string
          unidade_id: string
          venda_id: string
          venda_item_id: string
        }
        Insert: {
          condicao?: string | null
          conferido_em?: string | null
          conferido_por?: string | null
          id?: string
          motivo: string
          observacao?: string | null
          organizacao_id: string
          quantidade: number
          situacao?: string
          solicitado_em?: string
          solicitado_por: string
          unidade_id: string
          venda_id: string
          venda_item_id: string
        }
        Update: {
          condicao?: string | null
          conferido_em?: string | null
          conferido_por?: string | null
          id?: string
          motivo?: string
          observacao?: string | null
          organizacao_id?: string
          quantidade?: number
          situacao?: string
          solicitado_em?: string
          solicitado_por?: string
          unidade_id?: string
          venda_id?: string
          venda_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venda_retornos_conferido_por_fkey"
            columns: ["conferido_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_retornos_solicitado_por_fkey"
            columns: ["solicitado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_retornos_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "venda_retornos_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_retornos_venda_item_id_fkey"
            columns: ["venda_item_id"]
            isOneToOne: true
            referencedRelation: "venda_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas: {
        Row: {
          a_receber_centavos: number | null
          caixa_id: string | null
          canal: string
          cancelada_em: string | null
          cancelada_por: string | null
          chave_conclusao: string | null
          chave_criacao: string
          cliente_email: string | null
          cliente_id: string | null
          cliente_nome: string | null
          concluida_em: string | null
          conteudo_conclusao: string | null
          criado_em: string
          desconto_centavos: number | null
          devolvido_centavos: number
          id: string
          motivo_cancelamento: string | null
          numero: number
          organizacao_id: string
          recebido_centavos: number | null
          situacao: string
          subtotal_centavos: number | null
          total_centavos: number | null
          troco_centavos: number | null
          unidade_id: string
          vendedor_id: string
        }
        Insert: {
          a_receber_centavos?: number | null
          caixa_id?: string | null
          canal?: string
          cancelada_em?: string | null
          cancelada_por?: string | null
          chave_conclusao?: string | null
          chave_criacao: string
          cliente_email?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          concluida_em?: string | null
          conteudo_conclusao?: string | null
          criado_em?: string
          desconto_centavos?: number | null
          devolvido_centavos?: number
          id?: string
          motivo_cancelamento?: string | null
          numero?: never
          organizacao_id: string
          recebido_centavos?: number | null
          situacao?: string
          subtotal_centavos?: number | null
          total_centavos?: number | null
          troco_centavos?: number | null
          unidade_id: string
          vendedor_id: string
        }
        Update: {
          a_receber_centavos?: number | null
          caixa_id?: string | null
          canal?: string
          cancelada_em?: string | null
          cancelada_por?: string | null
          chave_conclusao?: string | null
          chave_criacao?: string
          cliente_email?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          concluida_em?: string | null
          conteudo_conclusao?: string | null
          criado_em?: string
          desconto_centavos?: number | null
          devolvido_centavos?: number
          id?: string
          motivo_cancelamento?: string | null
          numero?: never
          organizacao_id?: string
          recebido_centavos?: number | null
          situacao?: string
          subtotal_centavos?: number | null
          total_centavos?: number | null
          troco_centavos?: number | null
          unidade_id?: string
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendas_caixa_id_fkey"
            columns: ["caixa_id"]
            isOneToOne: false
            referencedRelation: "caixas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_cancelada_por_fkey"
            columns: ["cancelada_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_cliente_fk"
            columns: ["cliente_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "vendas_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "vendas_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      vinculos: {
        Row: {
          criado_em: string
          criado_por: string | null
          escopo: string
          fim: string | null
          id: string
          inicio: string
          motivo: string | null
          organizacao_id: string
          papel: string
          unidade_id: string | null
          usuario_id: string
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          escopo: string
          fim?: string | null
          id?: string
          inicio?: string
          motivo?: string | null
          organizacao_id: string
          papel: string
          unidade_id?: string | null
          usuario_id: string
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          escopo?: string
          fim?: string | null
          id?: string
          inicio?: string
          motivo?: string | null
          organizacao_id?: string
          papel?: string
          unidade_id?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vinculos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_papel_fkey"
            columns: ["papel"]
            isOneToOne: false
            referencedRelation: "papeis"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "vinculos_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      abrir_caixa: {
        Args: { p_chave: string; p_fundo: number }
        Returns: string
      }
      adicionar_item: {
        Args: {
          p_chave: string
          p_item: string
          p_quantidade: number
          p_variante: string
          p_venda: string
        }
        Returns: string
      }
      alterar_situacao_pessoa: {
        Args: { p_motivo: string; p_situacao: string; p_usuario: string }
        Returns: boolean
      }
      aplicar_desconto: {
        Args: { p_desconto: number; p_item: string }
        Returns: string
      }
      cancelar_convite: {
        Args: { p_convite: string; p_motivo: string }
        Returns: boolean
      }
      cancelar_venda: {
        Args: { p_motivo: string; p_venda: string }
        Returns: boolean
      }
      catalogo_definir_politica_desconto: {
        Args: {
          p_categoria: string
          p_margem_minima_pb: number
          p_motivo: string
          p_teto_pb: number
        }
        Returns: boolean
      }
      catalogo_salvar_categoria: {
        Args: {
          p_ativa: boolean
          p_id: string
          p_motivo: string
          p_nome: string
          p_organizacao: string
        }
        Returns: Json
      }
      catalogo_salvar_marca: {
        Args: {
          p_id: string
          p_motivo: string
          p_nome: string
          p_organizacao: string
        }
        Returns: Json
      }
      catalogo_salvar_produto: {
        Args: {
          p_ativo: boolean
          p_categoria: string
          p_chave: string
          p_descricao: string
          p_id: string
          p_marca: string
          p_modelo: string
          p_motivo: string
          p_nome: string
          p_organizacao: string
          p_publicar_online: boolean
          p_tipo: string
        }
        Returns: Json
      }
      catalogo_salvar_variante: {
        Args: {
          p_ativa: boolean
          p_capacidade: string
          p_codigo_barras: string
          p_cor: string
          p_estoque_minimo: number
          p_id: string
          p_motivo: string
          p_nome: string
          p_produto: string
          p_sku: string
        }
        Returns: Json
      }
      cliente_buscar: {
        Args: { p_criterio: string; p_valor: string }
        Returns: Json
      }
      cliente_consentir: {
        Args: {
          p_canal: string
          p_cliente: string
          p_concedido: boolean
          p_finalidade: string
          p_fonte: string
        }
        Returns: boolean
      }
      cliente_ficha: { Args: { p_cliente: string }; Returns: Json }
      cliente_revelar: {
        Args: { p_campo: string; p_cliente: string }
        Returns: Json
      }
      cliente_salvar: {
        Args: {
          p_chave: string
          p_cliente: string
          p_dados: Json
          p_motivo: string
        }
        Returns: Json
      }
      concluir_venda: {
        Args: {
          p_chave: string
          p_cliente: Json
          p_pagamentos: Json
          p_venda: string
        }
        Returns: Json
      }
      conferir_caixa: {
        Args: { p_caixa: string; p_observacao: string }
        Returns: boolean
      }
      conferir_item: { Args: { p_item: string }; Returns: boolean }
      conferir_retorno: {
        Args: {
          p_condicao: string
          p_identificador: string
          p_observacao: string
          p_recebido: boolean
          p_retorno: string
        }
        Returns: string
      }
      confirmar_estorno_externo: {
        Args: { p_comprovante: string; p_estorno: string; p_observacao: string }
        Returns: string
      }
      connect_cancelar: {
        Args: { p_motivo: string; p_operacao: string }
        Returns: boolean
      }
      connect_habilitar: {
        Args: { p_evidencia: string; p_habilitar: boolean; p_tipo: string }
        Returns: boolean
      }
      connect_registrar: {
        Args: { p_chave: string; p_pedido: Json; p_tipo: string }
        Returns: string
      }
      connect_resolver: {
        Args: { p_motivo: string; p_operacao: string; p_resultado: string }
        Returns: string
      }
      connect_worker_atualizar_referencias: {
        Args: { p_itens: Json; p_organizacao: string; p_tipo: string }
        Returns: number
      }
      connect_worker_operacoes_a_consultar: {
        Args: { p_limite: number; p_organizacao: string; p_tipos: string[] }
        Returns: {
          data_cadastro_externa: string
          enviado_em: string
          iccid: string
          id_externo: string
          linha: string
          linha_doadora: string
          metodo_pagamento: string
          operacao_id: string
          situacao: string
          tentativas_consulta: number
          tipo: string
          uuid_externo: string
        }[]
      }
      connect_worker_registrar_consulta: {
        Args: { p_evidencia: Json; p_operacao: string }
        Returns: string
      }
      connect_worker_registrar_envio: {
        Args: { p_operacao: string; p_resultado: Json }
        Returns: string
      }
      connect_worker_reivindicar_envios: {
        Args: { p_limite: number; p_organizacao: string; p_tipos: string[] }
        Returns: {
          dados: Json
          ddd: number
          esim: boolean
          iccid: string
          linha: string
          linha_doadora: string
          metodo_pagamento: string
          operacao_id: string
          operadora_doadora_id: number
          plano_id: number
          tipo: string
        }[]
      }
      convidar_pessoa: {
        Args: {
          p_email: string
          p_motivo: string
          p_nome: string
          p_organizacao: string
          p_papel: string
          p_unidades: string[]
        }
        Returns: string
      }
      criar_venda: { Args: { p_chave: string }; Returns: string }
      decidir_aprovacao: {
        Args: { p_aprovacao: string; p_aprovar: boolean; p_observacao: string }
        Returns: boolean
      }
      devolver_itens: {
        Args: {
          p_chave: string
          p_itens: Json
          p_motivo: string
          p_reembolsos: Json
          p_venda: string
        }
        Returns: Json
      }
      disponibilidade_na_rede: {
        Args: { p_variante: string }
        Returns: {
          disponivel: number
          unidade: string
          unidade_id: string
        }[]
      }
      encerrar_vinculo: {
        Args: { p_motivo: string; p_vinculo: string }
        Returns: boolean
      }
      estoque_estornar_entrada: {
        Args: { p_entrada: string; p_motivo: string }
        Returns: string
      }
      estoque_na_rede: {
        Args: { p_variante: string }
        Returns: {
          chegando: number
          disponivel: number
          fisico: number
          pedidos_abertos: number
          reservado: number
          tipo: string
          unidade: string
          unidade_id: string
        }[]
      }
      estoque_registrar_entrada: {
        Args: {
          p_chave: string
          p_documento: string
          p_fornecedor: string
          p_itens: Json
          p_motivo: string
          p_tipo: string
          p_unidade: string
        }
        Returns: Json
      }
      fechar_caixa: {
        Args: { p_contado: number; p_observacao: string }
        Returns: {
          contado: number
          diferenca: number
          esperado: number
        }[]
      }
      financeiro_painel: {
        Args: {
          p_fim: string
          p_inicio: string
          p_por_hora?: boolean
          p_unidade?: string
        }
        Returns: Json
      }
      fiscal_definir_politica: {
        Args: { p_alerta_minutos: number; p_fonte: string }
        Returns: boolean
      }
      fornecedor_salvar: {
        Args: {
          p_ativo: boolean
          p_cnpj: string
          p_contato: string
          p_id: string
          p_motivo: string
          p_nome: string
          p_organizacao: string
        }
        Returns: Json
      }
      identidade_bloqueios_a_aplicar: {
        Args: never
        Returns: {
          bloquear: boolean
          usuario_id: string
        }[]
      }
      identidade_concluir_convite: {
        Args: { p_convite: string; p_ja_existia: boolean; p_usuario: string }
        Returns: string
      }
      identidade_convites_a_processar: {
        Args: { p_limite?: number }
        Returns: {
          atualizado_em: string
          criado_em: string
          criado_por: string
          email: string
          erro: string | null
          id: string
          motivo: string
          nome: string
          organizacao_id: string
          papel: string
          situacao: string
          tentativas: number
          unidades: string[]
          usuario_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "convites"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      identidade_falha_convite: {
        Args: { p_convite: string; p_erro: string }
        Returns: undefined
      }
      identidade_usuario_por_email: {
        Args: { p_email: string }
        Returns: string
      }
      importacao_aplicar: {
        Args: { p_importacao: string; p_motivo: string }
        Returns: Json
      }
      importacao_catalogo_previa: {
        Args: {
          p_arquivo_nome: string
          p_linhas: Json
          p_mapeamento: Json
          p_organizacao: string
          p_sha256: string
        }
        Returns: Json
      }
      importacao_descartar: {
        Args: { p_importacao: string; p_motivo: string }
        Returns: boolean
      }
      importacao_desfazer: {
        Args: { p_importacao: string; p_motivo: string }
        Returns: Json
      }
      inventario_abrir: {
        Args: {
          p_chave: string
          p_descricao: string
          p_unidade: string
          p_variantes: string[]
        }
        Returns: Json
      }
      inventario_cancelar: {
        Args: { p_inventario: string; p_motivo: string }
        Returns: boolean
      }
      inventario_contar: {
        Args: {
          p_identificadores: string[]
          p_inventario: string
          p_quantidade: number
          p_variante: string
        }
        Returns: Json
      }
      inventario_decidir: {
        Args: { p_aprovar: boolean; p_inventario: string; p_motivo: string }
        Returns: Json
      }
      inventario_enviar: {
        Args: { p_inventario: string; p_motivo: string }
        Returns: boolean
      }
      liberar_reserva: { Args: { p_reserva: string }; Returns: boolean }
      loja_atualizar: {
        Args: {
          p_cidade: string
          p_cnpj: string
          p_motivo: string
          p_nome: string
          p_uf: string
          p_unidade: string
        }
        Returns: boolean
      }
      loja_criar: {
        Args: {
          p_cidade: string
          p_cnpj: string
          p_codigo: string
          p_emissora: string
          p_empresa: string
          p_motivo: string
          p_nome: string
          p_tipo: string
          p_uf: string
        }
        Returns: Json
      }
      loja_definir_configuracao: {
        Args: {
          p_dados: Json
          p_motivo: string
          p_unidade: string
          p_vigente_desde: string
        }
        Returns: Json
      }
      loja_definir_situacao: {
        Args: { p_motivo: string; p_situacao: string; p_unidade: string }
        Returns: boolean
      }
      loja_historico: {
        Args: { p_unidade: string }
        Returns: {
          bairro: string
          cep: string
          complemento: string
          criado_em: string
          criado_por: string
          criado_por_nome: string
          horarios: Json
          id: number
          inscricao_estadual: string
          inscricao_municipal: string
          logradouro: string
          motivo: string
          numero: string
          telefone: string
          vigente_desde: string
        }[]
      }
      lojas_da_rede: {
        Args: never
        Returns: {
          bairro: string
          cep: string
          cidade: string
          cnpj: string
          codigo: string
          complemento: string
          configuracao_id: number
          criado_em: string
          empresa_id: string
          horarios: Json
          id: string
          inscricao_estadual: string
          inscricao_municipal: string
          logradouro: string
          nome: string
          numero: string
          organizacao_id: string
          proxima_versao: string
          status: string
          telefone: string
          tipo: string
          uf: string
          unidade_emissora_id: string
          versoes: number
          vigente_desde: string
        }[]
      }
      movimentar_caixa: {
        Args: {
          p_chave: string
          p_motivo: string
          p_tipo: string
          p_valor: number
        }
        Returns: number
      }
      notas_cancelar: {
        Args: { p_motivo: string; p_pedido: string }
        Returns: boolean
      }
      notas_corrigir: {
        Args: { p_destinatario: Json; p_pedido: string }
        Returns: boolean
      }
      notas_decidir: {
        Args: { p_aprovar: boolean; p_observacao: string; p_pedido: string }
        Returns: string
      }
      notas_registrar_emissao: {
        Args: { p_chave_acesso: string; p_observacao: string; p_pedido: string }
        Returns: string
      }
      notas_solicitar: {
        Args: { p_chave: string; p_destinatario: Json; p_venda: string }
        Returns: string
      }
      pedir_aprovacao: {
        Args: { p_item: string; p_motivo: string }
        Returns: string
      }
      pendencias_de_foto: {
        Args: never
        Returns: {
          motivo: string
          nome: string
          produto_id: string
          sku: string
          variante_id: string
        }[]
      }
      preco_campanha: {
        Args: {
          p_canal: string
          p_fim: string
          p_inicio: string
          p_motivo: string
          p_unidade: string
          p_valor: number
          p_variante: string
        }
        Returns: Json
      }
      preco_cancelar: {
        Args: { p_motivo: string; p_preco: string }
        Returns: string
      }
      preco_definir: {
        Args: {
          p_canal: string
          p_inicio: string
          p_motivo: string
          p_unidade: string
          p_valor: number
          p_variante: string
        }
        Returns: Json
      }
      preco_vigente: {
        Args: {
          p_canal?: string
          p_momento?: string
          p_unidade: string
          p_variante: string
        }
        Returns: number
      }
      precos_por_loja: {
        Args: { p_canal?: string; p_variante: string }
        Returns: {
          de_loja: boolean
          fim: string
          origem: string
          preco_id: string
          unidade: string
          unidade_id: string
          valor_centavos: number
        }[]
      }
      registrar_foto: {
        Args: {
          p_altura: number
          p_caminho: string
          p_ilustracao?: boolean
          p_largura: number
          p_produto: string
          p_variante: string
        }
        Returns: string
      }
      remover_item: { Args: { p_item: string }; Returns: boolean }
      repetir_convite: { Args: { p_convite: string }; Returns: boolean }
      reservar_estoque: {
        Args: {
          p_chave: string
          p_item: string
          p_minutos?: number
          p_origem?: string
          p_quantidade: number
          p_variante: string
        }
        Returns: string
      }
      selecionar_unidade: { Args: { p_unidade: string }; Returns: boolean }
      situacao_da_sessao: {
        Args: never
        Returns: {
          sessao_no_turno: boolean
          turno_termina_em: string
          unidade_id: string
          unidade_nome: string
          usuario_ativo: boolean
        }[]
      }
      tem_permissao: {
        Args: { p_permissao: string; p_unidade?: string }
        Returns: boolean
      }
      transferencia_encerrar: {
        Args: { p_motivo: string; p_situacao: string; p_transferencia: string }
        Returns: string
      }
      transferencia_enviar: {
        Args: { p_transferencia: string }
        Returns: string
      }
      transferencia_receber: {
        Args: {
          p_identificadores: string[]
          p_observacao: string
          p_quantidade: number
          p_transferencia: string
        }
        Returns: string
      }
      transferencia_separar: {
        Args: { p_itens: string[]; p_transferencia: string }
        Returns: string
      }
      transferencia_solicitar: {
        Args: {
          p_chave: string
          p_destino: string
          p_motivo: string
          p_origem: string
          p_quantidade: number
          p_variante: string
        }
        Returns: string
      }
      unidade_atual: { Args: never; Returns: string }
      venda_vincular_cliente: {
        Args: { p_cliente: string; p_motivo: string; p_venda: string }
        Returns: boolean
      }
      vincular_pessoa: {
        Args: {
          p_motivo: string
          p_organizacao: string
          p_papel: string
          p_unidade: string
          p_usuario: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
