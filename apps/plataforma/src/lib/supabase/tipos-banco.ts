// ARQUIVO GERADO pelo Supabase (generate_typescript_types do projeto ora5g-dev) depois da
// migration 20261118155834_pagamentos_por_linha. Não edite à mão: gere de novo a cada
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
      anuncios_custos: {
        Row: {
          atualizado_em: string
          campanha: string
          campanha_chave: string
          cliques: number | null
          dia: string
          gasto_centavos: number
          importacao_id: string
          impressoes: number | null
          organizacao_id: string
          plataforma: string
          resultados: number | null
        }
        Insert: {
          atualizado_em?: string
          campanha: string
          campanha_chave: string
          cliques?: number | null
          dia: string
          gasto_centavos: number
          importacao_id: string
          impressoes?: number | null
          organizacao_id: string
          plataforma: string
          resultados?: number | null
        }
        Update: {
          atualizado_em?: string
          campanha?: string
          campanha_chave?: string
          cliques?: number | null
          dia?: string
          gasto_centavos?: number
          importacao_id?: string
          impressoes?: number | null
          organizacao_id?: string
          plataforma?: string
          resultados?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "anuncios_custos_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "anuncios_importacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anuncios_custos_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      anuncios_importacoes: {
        Row: {
          arquivo: string
          campanhas: number
          dias_de_campanha: number
          gasto_centavos: number
          id: string
          importado_em: string
          importado_por: string
          impressao: string
          linhas: number
          mapeamento: Json
          numero: number
          organizacao_id: string
          periodo_fim: string
          periodo_inicio: string
          plataforma: string
          substituidos: number
        }
        Insert: {
          arquivo: string
          campanhas: number
          dias_de_campanha: number
          gasto_centavos: number
          id?: string
          importado_em?: string
          importado_por: string
          impressao: string
          linhas: number
          mapeamento?: Json
          numero?: never
          organizacao_id: string
          periodo_fim: string
          periodo_inicio: string
          plataforma: string
          substituidos: number
        }
        Update: {
          arquivo?: string
          campanhas?: number
          dias_de_campanha?: number
          gasto_centavos?: number
          id?: string
          importado_em?: string
          importado_por?: string
          impressao?: string
          linhas?: number
          mapeamento?: Json
          numero?: never
          organizacao_id?: string
          periodo_fim?: string
          periodo_inicio?: string
          plataforma?: string
          substituidos?: number
        }
        Relationships: [
          {
            foreignKeyName: "anuncios_importacoes_importado_por_fkey"
            columns: ["importado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anuncios_importacoes_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
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
      atividades: {
        Row: {
          chave: string
          cliente_id: string | null
          conteudo: string
          criado_em: string
          criado_por: string
          descricao: string
          encerrada_em: string | null
          encerrada_por: string | null
          id: string
          oportunidade_id: string | null
          organizacao_id: string
          responsavel_id: string
          resultado: string | null
          situacao: string
          tipo: string
          unidade_id: string
          vence_em: string
        }
        Insert: {
          chave: string
          cliente_id?: string | null
          conteudo: string
          criado_em?: string
          criado_por: string
          descricao: string
          encerrada_em?: string | null
          encerrada_por?: string | null
          id?: string
          oportunidade_id?: string | null
          organizacao_id: string
          responsavel_id: string
          resultado?: string | null
          situacao?: string
          tipo: string
          unidade_id: string
          vence_em: string
        }
        Update: {
          chave?: string
          cliente_id?: string | null
          conteudo?: string
          criado_em?: string
          criado_por?: string
          descricao?: string
          encerrada_em?: string | null
          encerrada_por?: string | null
          id?: string
          oportunidade_id?: string | null
          organizacao_id?: string
          responsavel_id?: string
          resultado?: string | null
          situacao?: string
          tipo?: string
          unidade_id?: string
          vence_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "atividades_cliente_id_organizacao_id_fkey"
            columns: ["cliente_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "atividades_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividades_encerrada_por_fkey"
            columns: ["encerrada_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividades_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividades_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividades_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
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
      bonus_contestacoes: {
        Row: {
          contestada_em: string
          contestada_por: string
          decidida_em: string | null
          decidida_por: string | null
          decisao: string | null
          fechamento_id: string
          id: string
          motivo: string
          organizacao_id: string
          resposta: string | null
          unidade_id: string
          vendedor_id: string
        }
        Insert: {
          contestada_em?: string
          contestada_por: string
          decidida_em?: string | null
          decidida_por?: string | null
          decisao?: string | null
          fechamento_id: string
          id?: string
          motivo: string
          organizacao_id: string
          resposta?: string | null
          unidade_id: string
          vendedor_id: string
        }
        Update: {
          contestada_em?: string
          contestada_por?: string
          decidida_em?: string | null
          decidida_por?: string | null
          decisao?: string | null
          fechamento_id?: string
          id?: string
          motivo?: string
          organizacao_id?: string
          resposta?: string | null
          unidade_id?: string
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bonus_contestacoes_contestada_por_fkey"
            columns: ["contestada_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonus_contestacoes_decidida_por_fkey"
            columns: ["decidida_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonus_contestacoes_fechamento_id_vendedor_id_fkey"
            columns: ["fechamento_id", "vendedor_id"]
            isOneToOne: true
            referencedRelation: "bonus_fechamento_linhas"
            referencedColumns: ["fechamento_id", "vendedor_id"]
          },
          {
            foreignKeyName: "bonus_contestacoes_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
          },
        ]
      }
      bonus_fechamento_linhas: {
        Row: {
          ajuste_motivo: string | null
          aprovado_em: string | null
          fechamento_id: string
          id: string
          mes: string
          organizacao_id: string
          total_aprovado: number | null
          total_calculado: number
          unidade_id: string
          vendedor_id: string
        }
        Insert: {
          ajuste_motivo?: string | null
          aprovado_em?: string | null
          fechamento_id: string
          id?: string
          mes: string
          organizacao_id: string
          total_aprovado?: number | null
          total_calculado: number
          unidade_id: string
          vendedor_id: string
        }
        Update: {
          ajuste_motivo?: string | null
          aprovado_em?: string | null
          fechamento_id?: string
          id?: string
          mes?: string
          organizacao_id?: string
          total_aprovado?: number | null
          total_calculado?: number
          unidade_id?: string
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bonus_fechamento_linhas_fechamento_id_fkey"
            columns: ["fechamento_id"]
            isOneToOne: false
            referencedRelation: "bonus_fechamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonus_fechamento_linhas_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "bonus_fechamento_linhas_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      bonus_fechamentos: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          apuracao: Json
          enviado_em: string
          enviado_por: string
          id: string
          mes: string
          organizacao_id: string
          situacao: string
          total_aprovado: number | null
          total_calculado: number
          unidade_id: string
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          apuracao: Json
          enviado_em?: string
          enviado_por: string
          id?: string
          mes: string
          organizacao_id: string
          situacao?: string
          total_aprovado?: number | null
          total_calculado: number
          unidade_id: string
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          apuracao?: Json
          enviado_em?: string
          enviado_por?: string
          id?: string
          mes?: string
          organizacao_id?: string
          situacao?: string
          total_aprovado?: number | null
          total_calculado?: number
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bonus_fechamentos_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonus_fechamentos_enviado_por_fkey"
            columns: ["enviado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonus_fechamentos_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
          },
        ]
      }
      bonus_regras: {
        Row: {
          definida_em: string
          definida_por: string
          faixas: Json | null
          id: string
          medida: string
          motivo: string | null
          organizacao_id: string
          versao: number
          vigente_desde: string
        }
        Insert: {
          definida_em?: string
          definida_por: string
          faixas?: Json | null
          id?: string
          medida: string
          motivo?: string | null
          organizacao_id: string
          versao?: never
          vigente_desde: string
        }
        Update: {
          definida_em?: string
          definida_por?: string
          faixas?: Json | null
          id?: string
          medida?: string
          motivo?: string | null
          organizacao_id?: string
          versao?: never
          vigente_desde?: string
        }
        Relationships: [
          {
            foreignKeyName: "bonus_regras_definida_por_fkey"
            columns: ["definida_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonus_regras_organizacao_id_fkey"
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
      caixa_saidas: {
        Row: {
          caixa_id: string
          chave: string
          decidida_em: string | null
          decidida_por: string | null
          id: string
          motivo: string
          motivo_decisao: string | null
          movimento_id: number | null
          organizacao_id: string
          pedida_em: string
          pedida_por: string
          situacao: string
          unidade_id: string
          valor_centavos: number
        }
        Insert: {
          caixa_id: string
          chave: string
          decidida_em?: string | null
          decidida_por?: string | null
          id?: string
          motivo: string
          motivo_decisao?: string | null
          movimento_id?: number | null
          organizacao_id: string
          pedida_em?: string
          pedida_por: string
          situacao?: string
          unidade_id: string
          valor_centavos: number
        }
        Update: {
          caixa_id?: string
          chave?: string
          decidida_em?: string | null
          decidida_por?: string | null
          id?: string
          motivo?: string
          motivo_decisao?: string | null
          movimento_id?: number | null
          organizacao_id?: string
          pedida_em?: string
          pedida_por?: string
          situacao?: string
          unidade_id?: string
          valor_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "caixa_saidas_caixa_id_fkey"
            columns: ["caixa_id"]
            isOneToOne: false
            referencedRelation: "caixas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixa_saidas_decidida_por_fkey"
            columns: ["decidida_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixa_saidas_movimento_id_fkey"
            columns: ["movimento_id"]
            isOneToOne: false
            referencedRelation: "caixa_movimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixa_saidas_pedida_por_fkey"
            columns: ["pedida_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixa_saidas_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
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
          peca_de_assistencia: boolean
        }
        Insert: {
          ativa?: boolean
          criado_em?: string
          desconto_teto_pb?: number | null
          id?: string
          margem_minima_pb?: number | null
          nome: string
          organizacao_id: string
          peca_de_assistencia?: boolean
        }
        Update: {
          ativa?: boolean
          criado_em?: string
          desconto_teto_pb?: number | null
          id?: string
          margem_minima_pb?: number | null
          nome?: string
          organizacao_id?: string
          peca_de_assistencia?: boolean
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
      cliente_nao_duplicados: {
        Row: {
          cliente_a: string
          cliente_b: string
          decidido_em: string
          decidido_por: string
          motivo: string
          organizacao_id: string
        }
        Insert: {
          cliente_a: string
          cliente_b: string
          decidido_em?: string
          decidido_por: string
          motivo: string
          organizacao_id: string
        }
        Update: {
          cliente_a?: string
          cliente_b?: string
          decidido_em?: string
          decidido_por?: string
          motivo?: string
          organizacao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_nao_duplicados_cliente_a_organizacao_id_fkey"
            columns: ["cliente_a", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "cliente_nao_duplicados_cliente_b_organizacao_id_fkey"
            columns: ["cliente_b", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "cliente_nao_duplicados_decidido_por_fkey"
            columns: ["decidido_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
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
          mesclado_em: string | null
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
          mesclado_em?: string | null
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
          mesclado_em?: string | null
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
            foreignKeyName: "clientes_mesclado_em_fkey"
            columns: ["mesclado_em"]
            isOneToOne: false
            referencedRelation: "clientes"
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
      connect_conciliacao_linhas: {
        Row: {
          conciliacao_id: string
          dia: string | null
          forma_pagto: string | null
          iccid: string | null
          linha: string | null
          operacao_id: string | null
          ordem: number
          plano: string | null
          resultado: string
          tipo_linha: string | null
          valor_centavos: number | null
        }
        Insert: {
          conciliacao_id: string
          dia?: string | null
          forma_pagto?: string | null
          iccid?: string | null
          linha?: string | null
          operacao_id?: string | null
          ordem: number
          plano?: string | null
          resultado: string
          tipo_linha?: string | null
          valor_centavos?: number | null
        }
        Update: {
          conciliacao_id?: string
          dia?: string | null
          forma_pagto?: string | null
          iccid?: string | null
          linha?: string | null
          operacao_id?: string | null
          ordem?: number
          plano?: string | null
          resultado?: string
          tipo_linha?: string | null
          valor_centavos?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "connect_conciliacao_linhas_conciliacao_id_fkey"
            columns: ["conciliacao_id"]
            isOneToOne: false
            referencedRelation: "connect_conciliacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connect_conciliacao_linhas_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "connect_operacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      connect_conciliacao_so_aqui: {
        Row: {
          conciliacao_id: string
          operacao_id: string
        }
        Insert: {
          conciliacao_id: string
          operacao_id: string
        }
        Update: {
          conciliacao_id?: string
          operacao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connect_conciliacao_so_aqui_conciliacao_id_fkey"
            columns: ["conciliacao_id"]
            isOneToOne: false
            referencedRelation: "connect_conciliacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connect_conciliacao_so_aqui_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "connect_operacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      connect_conciliacoes: {
        Row: {
          ate: string
          de: string
          id: string
          numero: number
          organizacao_id: string
          recebida_em: string
          relatorio: string
          totais: Json
        }
        Insert: {
          ate: string
          de: string
          id?: string
          numero?: never
          organizacao_id: string
          recebida_em?: string
          relatorio: string
          totais?: Json
        }
        Update: {
          ate?: string
          de?: string
          id?: string
          numero?: never
          organizacao_id?: string
          recebida_em?: string
          relatorio?: string
          totais?: Json
        }
        Relationships: [
          {
            foreignKeyName: "connect_conciliacoes_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
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
      conta_pagar_anexos: {
        Row: {
          bytes: number
          caminho: string
          conta_id: string
          descricao: string | null
          enviado_em: string
          enviado_por: string
          formato: string
          id: string
          motivo_retirada: string | null
          organizacao_id: string
          retirado_em: string | null
          retirado_por: string | null
          sha256: string
          tipo: string
          unidade_id: string | null
        }
        Insert: {
          bytes: number
          caminho: string
          conta_id: string
          descricao?: string | null
          enviado_em?: string
          enviado_por: string
          formato: string
          id?: string
          motivo_retirada?: string | null
          organizacao_id: string
          retirado_em?: string | null
          retirado_por?: string | null
          sha256: string
          tipo: string
          unidade_id?: string | null
        }
        Update: {
          bytes?: number
          caminho?: string
          conta_id?: string
          descricao?: string | null
          enviado_em?: string
          enviado_por?: string
          formato?: string
          id?: string
          motivo_retirada?: string | null
          organizacao_id?: string
          retirado_em?: string | null
          retirado_por?: string | null
          sha256?: string
          tipo?: string
          unidade_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conta_pagar_anexos_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_a_pagar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conta_pagar_anexos_enviado_por_fkey"
            columns: ["enviado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conta_pagar_anexos_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conta_pagar_anexos_retirado_por_fkey"
            columns: ["retirado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conta_pagar_anexos_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
          },
        ]
      }
      contas_a_pagar: {
        Row: {
          atualizada_em: string
          cancelada_em: string | null
          cancelada_por: string | null
          categoria_id: string
          chave: string
          criada_em: string
          criada_por: string
          descricao: string
          documento: string | null
          entrada_id: string | null
          forma: string
          fornecedor_id: string | null
          grupo_id: string
          id: string
          motivo_cancelamento: string | null
          organizacao_id: string
          paga_em: string | null
          paga_por: string | null
          parcela: number
          parcelas: number
          referencia_pagamento: string | null
          situacao: string
          unidade_id: string | null
          valor_centavos: number
          valor_pago_centavos: number | null
          vencimento: string
        }
        Insert: {
          atualizada_em?: string
          cancelada_em?: string | null
          cancelada_por?: string | null
          categoria_id: string
          chave: string
          criada_em?: string
          criada_por: string
          descricao: string
          documento?: string | null
          entrada_id?: string | null
          forma: string
          fornecedor_id?: string | null
          grupo_id: string
          id?: string
          motivo_cancelamento?: string | null
          organizacao_id: string
          paga_em?: string | null
          paga_por?: string | null
          parcela?: number
          parcelas?: number
          referencia_pagamento?: string | null
          situacao?: string
          unidade_id?: string | null
          valor_centavos: number
          valor_pago_centavos?: number | null
          vencimento: string
        }
        Update: {
          atualizada_em?: string
          cancelada_em?: string | null
          cancelada_por?: string | null
          categoria_id?: string
          chave?: string
          criada_em?: string
          criada_por?: string
          descricao?: string
          documento?: string | null
          entrada_id?: string | null
          forma?: string
          fornecedor_id?: string | null
          grupo_id?: string
          id?: string
          motivo_cancelamento?: string | null
          organizacao_id?: string
          paga_em?: string | null
          paga_por?: string | null
          parcela?: number
          parcelas?: number
          referencia_pagamento?: string | null
          situacao?: string
          unidade_id?: string | null
          valor_centavos?: number
          valor_pago_centavos?: number | null
          vencimento?: string
        }
        Relationships: [
          {
            foreignKeyName: "contas_a_pagar_cancelada_por_fkey"
            columns: ["cancelada_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_a_pagar_categoria_id_organizacao_id_fkey"
            columns: ["categoria_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_categorias"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "contas_a_pagar_criada_por_fkey"
            columns: ["criada_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_a_pagar_entrada_fkey"
            columns: ["entrada_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "entradas_estoque"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "contas_a_pagar_fornecedor_id_organizacao_id_fkey"
            columns: ["fornecedor_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "contas_a_pagar_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_a_pagar_paga_por_fkey"
            columns: ["paga_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_a_pagar_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
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
          recebido_em: string | null
          referencia_recebimento: string | null
          registrado_por: string | null
          situacao: string
          unidade_id: string
          valor_centavos: number
          valor_recebido_centavos: number | null
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
          recebido_em?: string | null
          referencia_recebimento?: string | null
          registrado_por?: string | null
          situacao?: string
          unidade_id: string
          valor_centavos: number
          valor_recebido_centavos?: number | null
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
          recebido_em?: string | null
          referencia_recebimento?: string | null
          registrado_por?: string | null
          situacao?: string
          unidade_id?: string
          valor_centavos?: number
          valor_recebido_centavos?: number | null
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
            foreignKeyName: "contas_a_receber_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
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
      contas_pagar_categorias: {
        Row: {
          ativa: boolean
          criada_em: string
          criada_por: string | null
          entra_no_resultado: boolean
          id: string
          nome: string
          ordem: number
          organizacao_id: string
        }
        Insert: {
          ativa?: boolean
          criada_em?: string
          criada_por?: string | null
          entra_no_resultado?: boolean
          id?: string
          nome: string
          ordem?: number
          organizacao_id: string
        }
        Update: {
          ativa?: boolean
          criada_em?: string
          criada_por?: string | null
          entra_no_resultado?: boolean
          id?: string
          nome?: string
          ordem?: number
          organizacao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_categorias_criada_por_fkey"
            columns: ["criada_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_categorias_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
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
          reentradas: string[]
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
          reentradas?: string[]
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
          reentradas?: string[]
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
          pedido_id: string | null
          registrada_em: string | null
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
          pedido_id?: string | null
          registrada_em?: string | null
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
          pedido_id?: string | null
          registrada_em?: string | null
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
            foreignKeyName: "entradas_estoque_pedido_fkey"
            columns: ["pedido_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "pedidos_compra"
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
      estoque_carga_linhas: {
        Row: {
          acao: string
          carga_id: string
          desfeita_em: string | null
          disponivel: number | null
          fisico: number | null
          lancar: number | null
          motivo: string | null
          motivo_resolucao: string | null
          movimento_id: number | null
          numero: number
          pendencia: string | null
          resolucao: string | null
          resolvido_em: string | null
          resolvido_por: string | null
          saldo_no_corte: number
          sku: string
          variante_id: string | null
        }
        Insert: {
          acao: string
          carga_id: string
          desfeita_em?: string | null
          disponivel?: number | null
          fisico?: number | null
          lancar?: number | null
          motivo?: string | null
          motivo_resolucao?: string | null
          movimento_id?: number | null
          numero: number
          pendencia?: string | null
          resolucao?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          saldo_no_corte?: number
          sku: string
          variante_id?: string | null
        }
        Update: {
          acao?: string
          carga_id?: string
          desfeita_em?: string | null
          disponivel?: number | null
          fisico?: number | null
          lancar?: number | null
          motivo?: string | null
          motivo_resolucao?: string | null
          movimento_id?: number | null
          numero?: number
          pendencia?: string | null
          resolucao?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          saldo_no_corte?: number
          sku?: string
          variante_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estoque_carga_linhas_carga_id_fkey"
            columns: ["carga_id"]
            isOneToOne: false
            referencedRelation: "estoque_cargas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_carga_linhas_movimento_id_fkey"
            columns: ["movimento_id"]
            isOneToOne: false
            referencedRelation: "estoque_movimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_carga_linhas_resolvido_por_fkey"
            columns: ["resolvido_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_carga_linhas_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque_cargas: {
        Row: {
          aplicado_em: string | null
          aplicado_por: string | null
          arquivo_nome: string
          arquivo_sha256: string
          corte: string
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
          totais: Json
          unidade_id: string
        }
        Insert: {
          aplicado_em?: string | null
          aplicado_por?: string | null
          arquivo_nome: string
          arquivo_sha256: string
          corte: string
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
          totais?: Json
          unidade_id: string
        }
        Update: {
          aplicado_em?: string | null
          aplicado_por?: string | null
          arquivo_nome?: string
          arquivo_sha256?: string
          corte?: string
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
          totais?: Json
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estoque_cargas_aplicado_por_fkey"
            columns: ["aplicado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_cargas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_cargas_encerrado_por_fkey"
            columns: ["encerrado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_cargas_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_cargas_unidade_id_organizacao_id_fkey"
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
      extrato_linhas: {
        Row: {
          data: string
          data_liquidacao: string | null
          decidida_em: string | null
          decidida_por: string | null
          descricao: string | null
          extrato_id: string
          id: string
          liquido_centavos: number | null
          motivo: string | null
          numero: number
          organizacao_id: string
          pagamento_id: string | null
          referencia: string | null
          situacao: string
          taxa_centavos: number | null
          terminal: string | null
          valor_centavos: number
        }
        Insert: {
          data: string
          data_liquidacao?: string | null
          decidida_em?: string | null
          decidida_por?: string | null
          descricao?: string | null
          extrato_id: string
          id?: string
          liquido_centavos?: number | null
          motivo?: string | null
          numero: number
          organizacao_id: string
          pagamento_id?: string | null
          referencia?: string | null
          situacao?: string
          taxa_centavos?: number | null
          terminal?: string | null
          valor_centavos: number
        }
        Update: {
          data?: string
          data_liquidacao?: string | null
          decidida_em?: string | null
          decidida_por?: string | null
          descricao?: string | null
          extrato_id?: string
          id?: string
          liquido_centavos?: number | null
          motivo?: string | null
          numero?: number
          organizacao_id?: string
          pagamento_id?: string | null
          referencia?: string | null
          situacao?: string
          taxa_centavos?: number | null
          terminal?: string | null
          valor_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "extrato_linhas_decidida_por_fkey"
            columns: ["decidida_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extrato_linhas_extrato_id_fkey"
            columns: ["extrato_id"]
            isOneToOne: false
            referencedRelation: "extratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extrato_linhas_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extrato_linhas_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "venda_pagamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      extratos: {
        Row: {
          arquivo: string
          fonte: string
          id: string
          importado_em: string
          importado_por: string
          impressao: string
          linhas: number
          mapeamento: Json
          meios: string[]
          numero: number
          organizacao_id: string
          periodo_fim: string
          periodo_inicio: string
          tipo: string
          unidade_id: string | null
        }
        Insert: {
          arquivo: string
          fonte: string
          id?: string
          importado_em?: string
          importado_por: string
          impressao: string
          linhas: number
          mapeamento?: Json
          meios: string[]
          numero?: never
          organizacao_id: string
          periodo_fim: string
          periodo_inicio: string
          tipo: string
          unidade_id?: string | null
        }
        Update: {
          arquivo?: string
          fonte?: string
          id?: string
          importado_em?: string
          importado_por?: string
          impressao?: string
          linhas?: number
          mapeamento?: Json
          meios?: string[]
          numero?: never
          organizacao_id?: string
          periodo_fim?: string
          periodo_inicio?: string
          tipo?: string
          unidade_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "extratos_importado_por_fkey"
            columns: ["importado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extratos_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extratos_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
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
          auditoria_id: number | null
          base: Json | null
          custo_id: string | null
          dados: Json
          depois: Json | null
          desfeito: Json | null
          diferencas: Json
          erros: string[]
          erros_arquivo: string[]
          importacao_id: string
          numero: number
          preco_id: string | null
          variante_id: string | null
        }
        Insert: {
          acao: string
          antes?: Json | null
          auditoria_id?: number | null
          base?: Json | null
          custo_id?: string | null
          dados: Json
          depois?: Json | null
          desfeito?: Json | null
          diferencas?: Json
          erros?: string[]
          erros_arquivo?: string[]
          importacao_id: string
          numero: number
          preco_id?: string | null
          variante_id?: string | null
        }
        Update: {
          acao?: string
          antes?: Json | null
          auditoria_id?: number | null
          base?: Json | null
          custo_id?: string | null
          dados?: Json
          depois?: Json | null
          desfeito?: Json | null
          diferencas?: Json
          erros?: string[]
          erros_arquivo?: string[]
          importacao_id?: string
          numero?: number
          preco_id?: string | null
          variante_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "importacao_linhas_custo_id_fkey"
            columns: ["custo_id"]
            isOneToOne: false
            referencedRelation: "custos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "importacao_linhas_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "importacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "importacao_linhas_preco_id_fkey"
            columns: ["preco_id"]
            isOneToOne: false
            referencedRelation: "precos"
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
          comparacao: number
          comparado_em: string | null
          criado_em: string
          criado_por: string
          desfazer: Json | null
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
          comparacao?: number
          comparado_em?: string | null
          criado_em?: string
          criado_por: string
          desfazer?: Json | null
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
          comparacao?: number
          comparado_em?: string | null
          criado_em?: string
          criado_por?: string
          desfazer?: Json | null
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
      inventario_contagens: {
        Row: {
          contado_em: string
          contado_por: string
          contado_quantidade: number
          desconhecidos: string[] | null
          fora_da_loja: string[] | null
          id: string
          inventario_id: string
          lidos: string[] | null
          numero: number
          organizacao_id: string
          outra_variacao: string[] | null
          sistema_quantidade: number
          unidade_id: string
          variante_id: string
        }
        Insert: {
          contado_em?: string
          contado_por: string
          contado_quantidade: number
          desconhecidos?: string[] | null
          fora_da_loja?: string[] | null
          id?: string
          inventario_id: string
          lidos?: string[] | null
          numero?: never
          organizacao_id: string
          outra_variacao?: string[] | null
          sistema_quantidade: number
          unidade_id: string
          variante_id: string
        }
        Update: {
          contado_em?: string
          contado_por?: string
          contado_quantidade?: number
          desconhecidos?: string[] | null
          fora_da_loja?: string[] | null
          id?: string
          inventario_id?: string
          lidos?: string[] | null
          numero?: never
          organizacao_id?: string
          outra_variacao?: string[] | null
          sistema_quantidade?: number
          unidade_id?: string
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventario_contagens_contado_por_fkey"
            columns: ["contado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_contagens_inventario_id_variante_id_fkey"
            columns: ["inventario_id", "variante_id"]
            isOneToOne: false
            referencedRelation: "inventario_itens"
            referencedColumns: ["inventario_id", "variante_id"]
          },
          {
            foreignKeyName: "inventario_contagens_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
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
      loja_pedidos: {
        Row: {
          atendido_em: string | null
          atendido_por: string | null
          cancelado_em: string | null
          cancelado_por: string | null
          chave: string
          codigo: string
          criado_em: string
          expira_em: string
          id: string
          motivo_cancelamento: string | null
          nome: string
          numero: number
          organizacao_id: string
          situacao: string
          total_centavos: number
          unidade_id: string
          unidades: number
          venda_id: string | null
          whatsapp_mascarado: string
        }
        Insert: {
          atendido_em?: string | null
          atendido_por?: string | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          chave: string
          codigo: string
          criado_em?: string
          expira_em: string
          id?: string
          motivo_cancelamento?: string | null
          nome: string
          numero?: never
          organizacao_id: string
          situacao?: string
          total_centavos: number
          unidade_id: string
          unidades: number
          venda_id?: string | null
          whatsapp_mascarado: string
        }
        Update: {
          atendido_em?: string | null
          atendido_por?: string | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          chave?: string
          codigo?: string
          criado_em?: string
          expira_em?: string
          id?: string
          motivo_cancelamento?: string | null
          nome?: string
          numero?: never
          organizacao_id?: string
          situacao?: string
          total_centavos?: number
          unidade_id?: string
          unidades?: number
          venda_id?: string | null
          whatsapp_mascarado?: string
        }
        Relationships: [
          {
            foreignKeyName: "loja_pedidos_atendido_por_fkey"
            columns: ["atendido_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loja_pedidos_cancelado_por_fkey"
            columns: ["cancelado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loja_pedidos_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "loja_pedidos_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      loja_reservas: {
        Row: {
          atendida_em: string | null
          atendida_por: string | null
          cancelada_em: string | null
          cancelada_por: string | null
          chave: string
          codigo: string
          criada_em: string
          estoque_reserva_id: string
          expira_em: string
          id: string
          item_serializado_id: string | null
          motivo_cancelamento: string | null
          nome: string
          numero: number
          organizacao_id: string
          origem: string | null
          pedido_id: string | null
          preco_centavos: number
          referencia: string | null
          situacao: string
          unidade_id: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          variante_id: string
          venda_id: string | null
          whatsapp_mascarado: string
        }
        Insert: {
          atendida_em?: string | null
          atendida_por?: string | null
          cancelada_em?: string | null
          cancelada_por?: string | null
          chave: string
          codigo: string
          criada_em?: string
          estoque_reserva_id: string
          expira_em: string
          id?: string
          item_serializado_id?: string | null
          motivo_cancelamento?: string | null
          nome: string
          numero?: never
          organizacao_id: string
          origem?: string | null
          pedido_id?: string | null
          preco_centavos: number
          referencia?: string | null
          situacao?: string
          unidade_id: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          variante_id: string
          venda_id?: string | null
          whatsapp_mascarado: string
        }
        Update: {
          atendida_em?: string | null
          atendida_por?: string | null
          cancelada_em?: string | null
          cancelada_por?: string | null
          chave?: string
          codigo?: string
          criada_em?: string
          estoque_reserva_id?: string
          expira_em?: string
          id?: string
          item_serializado_id?: string | null
          motivo_cancelamento?: string | null
          nome?: string
          numero?: never
          organizacao_id?: string
          origem?: string | null
          pedido_id?: string | null
          preco_centavos?: number
          referencia?: string | null
          situacao?: string
          unidade_id?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          variante_id?: string
          venda_id?: string | null
          whatsapp_mascarado?: string
        }
        Relationships: [
          {
            foreignKeyName: "loja_reservas_atendida_por_fkey"
            columns: ["atendida_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loja_reservas_cancelada_por_fkey"
            columns: ["cancelada_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loja_reservas_estoque_reserva_id_fkey"
            columns: ["estoque_reserva_id"]
            isOneToOne: false
            referencedRelation: "estoque_reservas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loja_reservas_item_serializado_id_fkey"
            columns: ["item_serializado_id"]
            isOneToOne: false
            referencedRelation: "itens_serializados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loja_reservas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "loja_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loja_reservas_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "loja_reservas_variante_id_organizacao_id_fkey"
            columns: ["variante_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "loja_reservas_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
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
      marketplace_importacoes: {
        Row: {
          arquivo: string
          atualizados: number
          canal: string
          id: string
          importado_em: string
          importado_por: string
          impressao: string
          linhas: number
          mapeamento: Json
          novos: number
          numero: number
          organizacao_id: string
          pedidos: number
          periodo_fim: string
          periodo_inicio: string
        }
        Insert: {
          arquivo: string
          atualizados: number
          canal: string
          id?: string
          importado_em?: string
          importado_por: string
          impressao: string
          linhas: number
          mapeamento?: Json
          novos: number
          numero?: never
          organizacao_id: string
          pedidos: number
          periodo_fim: string
          periodo_inicio: string
        }
        Update: {
          arquivo?: string
          atualizados?: number
          canal?: string
          id?: string
          importado_em?: string
          importado_por?: string
          impressao?: string
          linhas?: number
          mapeamento?: Json
          novos?: number
          numero?: never
          organizacao_id?: string
          pedidos?: number
          periodo_fim?: string
          periodo_inicio?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_importacoes_importado_por_fkey"
            columns: ["importado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_importacoes_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_pedido_itens: {
        Row: {
          codigo: string | null
          id: string
          numero: number
          organizacao_id: string
          pedido_id: string
          quantidade: number
          titulo: string | null
          valor_centavos: number
          variante_id: string | null
        }
        Insert: {
          codigo?: string | null
          id?: string
          numero: number
          organizacao_id: string
          pedido_id: string
          quantidade: number
          titulo?: string | null
          valor_centavos: number
          variante_id?: string | null
        }
        Update: {
          codigo?: string | null
          id?: string
          numero?: number
          organizacao_id?: string
          pedido_id?: string
          quantidade?: number
          titulo?: string | null
          valor_centavos?: number
          variante_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_pedido_itens_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_pedido_itens_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "marketplace_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_pedido_itens_variante_id_organizacao_id_fkey"
            columns: ["variante_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id", "organizacao_id"]
          },
        ]
      }
      marketplace_pedidos: {
        Row: {
          atualizado_em: string
          bruto_centavos: number
          canal: string
          criado_em: string
          data: string
          data_repasse: string | null
          frete_centavos: number | null
          id: string
          id_externo: string
          importacao_id: string
          liquido_centavos: number | null
          organizacao_id: string
          reembolsos_centavos: number | null
          situacao_no_canal: string | null
          tarifas_centavos: number | null
        }
        Insert: {
          atualizado_em?: string
          bruto_centavos: number
          canal: string
          criado_em?: string
          data: string
          data_repasse?: string | null
          frete_centavos?: number | null
          id?: string
          id_externo: string
          importacao_id: string
          liquido_centavos?: number | null
          organizacao_id: string
          reembolsos_centavos?: number | null
          situacao_no_canal?: string | null
          tarifas_centavos?: number | null
        }
        Update: {
          atualizado_em?: string
          bruto_centavos?: number
          canal?: string
          criado_em?: string
          data?: string
          data_repasse?: string | null
          frete_centavos?: number | null
          id?: string
          id_externo?: string
          importacao_id?: string
          liquido_centavos?: number | null
          organizacao_id?: string
          reembolsos_centavos?: number | null
          situacao_no_canal?: string | null
          tarifas_centavos?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_pedidos_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "marketplace_importacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_pedidos_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      metas: {
        Row: {
          definida_em: string
          definida_por: string
          id: string
          medida: string
          mes: string
          motivo: string | null
          organizacao_id: string
          regra_contagem: number
          unidade_id: string
          valor: number | null
          vendedor_id: string | null
          versao: number
        }
        Insert: {
          definida_em?: string
          definida_por: string
          id?: string
          medida: string
          mes: string
          motivo?: string | null
          organizacao_id: string
          regra_contagem?: number
          unidade_id: string
          valor?: number | null
          vendedor_id?: string | null
          versao?: never
        }
        Update: {
          definida_em?: string
          definida_por?: string
          id?: string
          medida?: string
          mes?: string
          motivo?: string | null
          organizacao_id?: string
          regra_contagem?: number
          unidade_id?: string
          valor?: number | null
          vendedor_id?: string | null
          versao?: never
        }
        Relationships: [
          {
            foreignKeyName: "metas_definida_por_fkey"
            columns: ["definida_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metas_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "metas_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      notas_cartas_de_correcao: {
        Row: {
          correcao: string
          id: string
          numero: number
          organizacao_id: string
          pedido_id: string
          protocolo: string
          registrada_em: string
          registrada_por: string
        }
        Insert: {
          correcao: string
          id?: string
          numero: number
          organizacao_id: string
          pedido_id: string
          protocolo: string
          registrada_em?: string
          registrada_por: string
        }
        Update: {
          correcao?: string
          id?: string
          numero?: number
          organizacao_id?: string
          pedido_id?: string
          protocolo?: string
          registrada_em?: string
          registrada_por?: string
        }
        Relationships: [
          {
            foreignKeyName: "notas_cartas_de_correcao_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "notas_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_cartas_de_correcao_registrada_por_fkey"
            columns: ["registrada_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      notas_divergencias_conferidas: {
        Row: {
          conferida_em: string
          conferida_por: string
          id: string
          observacao: string
          organizacao_id: string
          pedido_id: string
          tipo: string
          unidade_id: string
        }
        Insert: {
          conferida_em?: string
          conferida_por: string
          id?: string
          observacao: string
          organizacao_id: string
          pedido_id: string
          tipo: string
          unidade_id: string
        }
        Update: {
          conferida_em?: string
          conferida_por?: string
          id?: string
          observacao?: string
          organizacao_id?: string
          pedido_id?: string
          tipo?: string
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notas_divergencias_conferidas_conferida_por_fkey"
            columns: ["conferida_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_divergencias_conferidas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "notas_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_divergencias_conferidas_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
          },
        ]
      }
      notas_documentos: {
        Row: {
          bytes: number
          caminho: string
          enviado_em: string
          enviado_por: string
          id: string
          organizacao_id: string
          pedido_id: string
          sha256: string
          substituido_em: string | null
          tipo: string
          unidade_id: string
        }
        Insert: {
          bytes: number
          caminho: string
          enviado_em?: string
          enviado_por: string
          id?: string
          organizacao_id: string
          pedido_id: string
          sha256: string
          substituido_em?: string | null
          tipo: string
          unidade_id: string
        }
        Update: {
          bytes?: number
          caminho?: string
          enviado_em?: string
          enviado_por?: string
          id?: string
          organizacao_id?: string
          pedido_id?: string
          sha256?: string
          substituido_em?: string | null
          tipo?: string
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notas_documentos_enviado_por_fkey"
            columns: ["enviado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_documentos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "notas_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_documentos_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
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
          cancelada_no_fisco_em: string | null
          cancelada_no_fisco_por: string | null
          chave: string
          chave_acesso: string | null
          cliente_conferido_em: string | null
          cliente_conferido_por: string | null
          cliente_id: string | null
          cliente_origem: string | null
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
          protocolo: string | null
          protocolo_cancelamento: string | null
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
          cancelada_no_fisco_em?: string | null
          cancelada_no_fisco_por?: string | null
          chave: string
          chave_acesso?: string | null
          cliente_conferido_em?: string | null
          cliente_conferido_por?: string | null
          cliente_id?: string | null
          cliente_origem?: string | null
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
          protocolo?: string | null
          protocolo_cancelamento?: string | null
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
          cancelada_no_fisco_em?: string | null
          cancelada_no_fisco_por?: string | null
          chave?: string
          chave_acesso?: string | null
          cliente_conferido_em?: string | null
          cliente_conferido_por?: string | null
          cliente_id?: string | null
          cliente_origem?: string | null
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
          protocolo?: string | null
          protocolo_cancelamento?: string | null
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
            foreignKeyName: "notas_pedidos_cancelada_no_fisco_por_fkey"
            columns: ["cancelada_no_fisco_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_pedidos_cliente_conferido_por_fkey"
            columns: ["cliente_conferido_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
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
      oportunidade_eventos: {
        Row: {
          de: string | null
          em: string
          id: number
          oportunidade_id: string
          organizacao_id: string
          para: string | null
          texto: string | null
          tipo: string
          usuario_id: string
        }
        Insert: {
          de?: string | null
          em?: string
          id?: never
          oportunidade_id: string
          organizacao_id: string
          para?: string | null
          texto?: string | null
          tipo: string
          usuario_id: string
        }
        Update: {
          de?: string | null
          em?: string
          id?: never
          oportunidade_id?: string
          organizacao_id?: string
          para?: string | null
          texto?: string | null
          tipo?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oportunidade_eventos_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidade_eventos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      oportunidades: {
        Row: {
          atendente_id: string
          atualizado_em: string
          campanha: string | null
          chave: string
          cliente_id: string
          conteudo: string
          criado_em: string
          criado_por: string
          encerrado_em: string | null
          etapa: string
          id: string
          interesse: string
          motivo_perda: string | null
          numero: number
          observacao_encerramento: string | null
          organizacao_id: string
          origem: string
          proximo_passo: string | null
          proximo_passo_em: string | null
          responsavel_id: string
          unidade_id: string
          valor_estimado_centavos: number | null
          venda_id: string | null
        }
        Insert: {
          atendente_id: string
          atualizado_em?: string
          campanha?: string | null
          chave: string
          cliente_id: string
          conteudo: string
          criado_em?: string
          criado_por: string
          encerrado_em?: string | null
          etapa?: string
          id?: string
          interesse: string
          motivo_perda?: string | null
          numero?: never
          observacao_encerramento?: string | null
          organizacao_id: string
          origem: string
          proximo_passo?: string | null
          proximo_passo_em?: string | null
          responsavel_id: string
          unidade_id: string
          valor_estimado_centavos?: number | null
          venda_id?: string | null
        }
        Update: {
          atendente_id?: string
          atualizado_em?: string
          campanha?: string | null
          chave?: string
          cliente_id?: string
          conteudo?: string
          criado_em?: string
          criado_por?: string
          encerrado_em?: string | null
          etapa?: string
          id?: string
          interesse?: string
          motivo_perda?: string | null
          numero?: never
          observacao_encerramento?: string | null
          organizacao_id?: string
          origem?: string
          proximo_passo?: string | null
          proximo_passo_em?: string | null
          responsavel_id?: string
          unidade_id?: string
          valor_estimado_centavos?: number | null
          venda_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oportunidades_atendente_id_fkey"
            columns: ["atendente_id"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidades_cliente_id_organizacao_id_fkey"
            columns: ["cliente_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "oportunidades_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidades_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidades_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "oportunidades_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      ordens_servico: {
        Row: {
          aberta_em: string
          aberta_por: string
          acessorios: string[]
          acessorios_obs: string | null
          aparelho: string
          assistencia_id: string | null
          atualizada_em: string
          chave: string
          cliente_id: string
          cliente_nome: string
          cobrada_em: string | null
          contato_mascarado: string
          conteudo: string
          defeito: string
          encerrada_em: string | null
          estado_entrada: string
          id: string
          imei: string | null
          local: string
          motivo_encerramento: string | null
          numero: number
          numero_serie: string | null
          organizacao_id: string
          prazo: string | null
          servico: string
          situacao: string
          unidade_id: string
          venda_id: string | null
        }
        Insert: {
          aberta_em?: string
          aberta_por: string
          acessorios?: string[]
          acessorios_obs?: string | null
          aparelho: string
          assistencia_id?: string | null
          atualizada_em?: string
          chave: string
          cliente_id: string
          cliente_nome: string
          cobrada_em?: string | null
          contato_mascarado: string
          conteudo: string
          defeito: string
          encerrada_em?: string | null
          estado_entrada: string
          id?: string
          imei?: string | null
          local?: string
          motivo_encerramento?: string | null
          numero?: never
          numero_serie?: string | null
          organizacao_id: string
          prazo?: string | null
          servico?: string
          situacao?: string
          unidade_id: string
          venda_id?: string | null
        }
        Update: {
          aberta_em?: string
          aberta_por?: string
          acessorios?: string[]
          acessorios_obs?: string | null
          aparelho?: string
          assistencia_id?: string | null
          atualizada_em?: string
          chave?: string
          cliente_id?: string
          cliente_nome?: string
          cobrada_em?: string | null
          contato_mascarado?: string
          conteudo?: string
          defeito?: string
          encerrada_em?: string | null
          estado_entrada?: string
          id?: string
          imei?: string | null
          local?: string
          motivo_encerramento?: string | null
          numero?: never
          numero_serie?: string | null
          organizacao_id?: string
          prazo?: string | null
          servico?: string
          situacao?: string
          unidade_id?: string
          venda_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ordens_servico_aberta_por_fkey"
            columns: ["aberta_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_assistencia_id_fkey"
            columns: ["assistencia_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "ordens_servico_venda_id_fkey"
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
      os_eventos: {
        Row: {
          em_nome_do_tecnico: boolean
          id: number
          local_de: string | null
          local_para: string | null
          observacao: string | null
          ocorrido_em: string
          organizacao_id: string
          os_id: string
          tipo: string
          unidade_id: string
          usuario_id: string
        }
        Insert: {
          em_nome_do_tecnico?: boolean
          id?: never
          local_de?: string | null
          local_para?: string | null
          observacao?: string | null
          ocorrido_em?: string
          organizacao_id: string
          os_id: string
          tipo: string
          unidade_id: string
          usuario_id: string
        }
        Update: {
          em_nome_do_tecnico?: boolean
          id?: never
          local_de?: string | null
          local_para?: string | null
          observacao?: string | null
          ocorrido_em?: string
          organizacao_id?: string
          os_id?: string
          tipo?: string
          unidade_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "os_eventos_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_eventos_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_eventos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      os_fotos: {
        Row: {
          bytes: number
          caminho: string
          enviada_em: string
          enviada_por: string
          id: string
          organizacao_id: string
          os_id: string
          sha256: string
          tipo: string
        }
        Insert: {
          bytes: number
          caminho: string
          enviada_em?: string
          enviada_por: string
          id?: string
          organizacao_id: string
          os_id: string
          sha256: string
          tipo: string
        }
        Update: {
          bytes?: number
          caminho?: string
          enviada_em?: string
          enviada_por?: string
          id?: string
          organizacao_id?: string
          os_id?: string
          sha256?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "os_fotos_enviada_por_fkey"
            columns: ["enviada_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_fotos_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
        ]
      }
      os_orcamentos: {
        Row: {
          chave: string
          conteudo: string
          diagnostico: string
          em_nome_do_tecnico: boolean
          id: string
          mao_de_obra_centavos: number
          numero: number
          observacao: string | null
          organizacao_id: string
          os_id: string
          pecas: Json
          pecas_centavos: number
          prazo_dias: number | null
          registrado_em: string
          registrado_por: string
          respondido_em: string | null
          respondido_por: string | null
          resposta_canal: string | null
          resposta_observacao: string | null
          situacao: string
          total_centavos: number
        }
        Insert: {
          chave: string
          conteudo: string
          diagnostico: string
          em_nome_do_tecnico?: boolean
          id?: string
          mao_de_obra_centavos: number
          numero?: never
          observacao?: string | null
          organizacao_id: string
          os_id: string
          pecas?: Json
          pecas_centavos: number
          prazo_dias?: number | null
          registrado_em?: string
          registrado_por: string
          respondido_em?: string | null
          respondido_por?: string | null
          resposta_canal?: string | null
          resposta_observacao?: string | null
          situacao?: string
          total_centavos: number
        }
        Update: {
          chave?: string
          conteudo?: string
          diagnostico?: string
          em_nome_do_tecnico?: boolean
          id?: string
          mao_de_obra_centavos?: number
          numero?: never
          observacao?: string | null
          organizacao_id?: string
          os_id?: string
          pecas?: Json
          pecas_centavos?: number
          prazo_dias?: number | null
          registrado_em?: string
          registrado_por?: string
          respondido_em?: string | null
          respondido_por?: string | null
          resposta_canal?: string | null
          resposta_observacao?: string | null
          situacao?: string
          total_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "os_orcamentos_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_orcamentos_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_orcamentos_respondido_por_fkey"
            columns: ["respondido_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      os_pecas: {
        Row: {
          chave: string
          devolvida_em: string | null
          devolvida_por: string | null
          em_nome_do_tecnico: boolean
          estorno_movimento_id: number | null
          id: string
          motivo_devolucao: string | null
          movimento_id: number
          observacao: string | null
          organizacao_id: string
          os_id: string
          quantidade: number
          registrado_em: string
          registrado_por: string
          unidade_id: string
          variante_id: string
        }
        Insert: {
          chave: string
          devolvida_em?: string | null
          devolvida_por?: string | null
          em_nome_do_tecnico?: boolean
          estorno_movimento_id?: number | null
          id?: string
          motivo_devolucao?: string | null
          movimento_id: number
          observacao?: string | null
          organizacao_id: string
          os_id: string
          quantidade: number
          registrado_em?: string
          registrado_por: string
          unidade_id: string
          variante_id: string
        }
        Update: {
          chave?: string
          devolvida_em?: string | null
          devolvida_por?: string | null
          em_nome_do_tecnico?: boolean
          estorno_movimento_id?: number | null
          id?: string
          motivo_devolucao?: string | null
          movimento_id?: number
          observacao?: string | null
          organizacao_id?: string
          os_id?: string
          quantidade?: number
          registrado_em?: string
          registrado_por?: string
          unidade_id?: string
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "os_pecas_devolvida_por_fkey"
            columns: ["devolvida_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_pecas_estorno_movimento_id_fkey"
            columns: ["estorno_movimento_id"]
            isOneToOne: false
            referencedRelation: "estoque_movimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_pecas_movimento_id_fkey"
            columns: ["movimento_id"]
            isOneToOne: false
            referencedRelation: "estoque_movimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_pecas_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_pecas_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_pecas_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_pecas_variante_id_organizacao_id_fkey"
            columns: ["variante_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id", "organizacao_id"]
          },
        ]
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
      pedido_compra_itens: {
        Row: {
          custo_unitario_centavos: number | null
          linha: number
          organizacao_id: string
          pedido_id: string
          quantidade: number
          variante_id: string
        }
        Insert: {
          custo_unitario_centavos?: number | null
          linha: number
          organizacao_id: string
          pedido_id: string
          quantidade: number
          variante_id: string
        }
        Update: {
          custo_unitario_centavos?: number | null
          linha?: number
          organizacao_id?: string
          pedido_id?: string
          quantidade?: number
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_compra_itens_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_compra_itens_variante_id_organizacao_id_fkey"
            columns: ["variante_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id", "organizacao_id"]
          },
        ]
      }
      pedidos_compra: {
        Row: {
          chave: string
          conteudo: string
          criado_em: string
          criado_por: string
          documento: string | null
          encerrado_em: string | null
          encerrado_por: string | null
          fornecedor_id: string
          id: string
          motivo_encerramento: string | null
          numero: number
          observacao: string | null
          organizacao_id: string
          previsto_para: string | null
          situacao: string
          total_previsto_centavos: number | null
          total_unidades: number
          unidade_id: string
        }
        Insert: {
          chave: string
          conteudo: string
          criado_em?: string
          criado_por: string
          documento?: string | null
          encerrado_em?: string | null
          encerrado_por?: string | null
          fornecedor_id: string
          id?: string
          motivo_encerramento?: string | null
          numero?: never
          observacao?: string | null
          organizacao_id: string
          previsto_para?: string | null
          situacao?: string
          total_previsto_centavos?: number | null
          total_unidades: number
          unidade_id: string
        }
        Update: {
          chave?: string
          conteudo?: string
          criado_em?: string
          criado_por?: string
          documento?: string | null
          encerrado_em?: string | null
          encerrado_por?: string | null
          fornecedor_id?: string
          id?: string
          motivo_encerramento?: string | null
          numero?: never
          observacao?: string | null
          organizacao_id?: string
          previsto_para?: string | null
          situacao?: string
          total_previsto_centavos?: number | null
          total_unidades?: number
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_compra_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_compra_encerrado_por_fkey"
            columns: ["encerrado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_compra_fornecedor_id_organizacao_id_fkey"
            columns: ["fornecedor_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "pedidos_compra_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_compra_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
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
          reservado_para: string | null
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
          reservado_para?: string | null
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
          reservado_para?: string | null
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
      regioes: {
        Row: {
          ativa: boolean
          criado_em: string
          criado_por: string
          id: string
          nome: string
          organizacao_id: string
        }
        Insert: {
          ativa?: boolean
          criado_em?: string
          criado_por: string
          id?: string
          nome: string
          organizacao_id: string
        }
        Update: {
          ativa?: boolean
          criado_em?: string
          criado_por?: string
          id?: string
          nome?: string
          organizacao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "regioes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regioes_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      terminais: {
        Row: {
          apelido: string
          ativo: boolean
          criado_em: string
          criado_por: string
          id: string
          identificador: string
          organizacao_id: string
          provedor: string
          unidade_id: string
        }
        Insert: {
          apelido: string
          ativo?: boolean
          criado_em?: string
          criado_por: string
          id?: string
          identificador: string
          organizacao_id: string
          provedor: string
          unidade_id: string
        }
        Update: {
          apelido?: string
          ativo?: boolean
          criado_em?: string
          criado_por?: string
          id?: string
          identificador?: string
          organizacao_id?: string
          provedor?: string
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "terminais_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terminais_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
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
      transferencia_remessas: {
        Row: {
          chave: string
          conteudo: string
          destino_id: string
          id: string
          motivo: string
          numero: number
          organizacao_id: string
          origem_id: string
          solicitado_em: string
          solicitado_por: string
        }
        Insert: {
          chave: string
          conteudo: string
          destino_id: string
          id?: string
          motivo: string
          numero?: never
          organizacao_id: string
          origem_id: string
          solicitado_em?: string
          solicitado_por: string
        }
        Update: {
          chave?: string
          conteudo?: string
          destino_id?: string
          id?: string
          motivo?: string
          numero?: never
          organizacao_id?: string
          origem_id?: string
          solicitado_em?: string
          solicitado_por?: string
        }
        Relationships: [
          {
            foreignKeyName: "transferencia_remessas_destino_id_organizacao_id_fkey"
            columns: ["destino_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "transferencia_remessas_origem_id_organizacao_id_fkey"
            columns: ["origem_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "transferencia_remessas_solicitado_por_fkey"
            columns: ["solicitado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
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
          remessa_id: string | null
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
          remessa_id?: string | null
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
          remessa_id?: string | null
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
            foreignKeyName: "transferencias_remessa_id_fkey"
            columns: ["remessa_id"]
            isOneToOne: false
            referencedRelation: "transferencia_remessas"
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
          regiao_id: string | null
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
          regiao_id?: string | null
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
          regiao_id?: string | null
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
            foreignKeyName: "unidades_regiao_fkey"
            columns: ["regiao_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "regioes"
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
      variante_codigos_externos: {
        Row: {
          canal: string
          codigo: string
          desligado_em: string | null
          desligado_por: string | null
          id: string
          ligado_em: string
          ligado_por: string
          motivo_desligamento: string | null
          organizacao_id: string
          sku_no_canal: string | null
          variante_id: string
        }
        Insert: {
          canal: string
          codigo: string
          desligado_em?: string | null
          desligado_por?: string | null
          id?: string
          ligado_em?: string
          ligado_por: string
          motivo_desligamento?: string | null
          organizacao_id: string
          sku_no_canal?: string | null
          variante_id: string
        }
        Update: {
          canal?: string
          codigo?: string
          desligado_em?: string | null
          desligado_por?: string | null
          id?: string
          ligado_em?: string
          ligado_por?: string
          motivo_desligamento?: string | null
          organizacao_id?: string
          sku_no_canal?: string | null
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "variante_codigos_externos_desligado_por_fkey"
            columns: ["desligado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variante_codigos_externos_ligado_por_fkey"
            columns: ["ligado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variante_codigos_externos_variante_id_organizacao_id_fkey"
            columns: ["variante_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id", "organizacao_id"]
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
      venda_anexos: {
        Row: {
          bytes: number
          caminho: string
          descricao: string | null
          enviado_em: string
          enviado_por: string
          formato: string
          id: string
          motivo_retirada: string | null
          organizacao_id: string
          retirado_em: string | null
          retirado_por: string | null
          sha256: string
          tipo: string
          unidade_id: string
          venda_id: string
        }
        Insert: {
          bytes: number
          caminho: string
          descricao?: string | null
          enviado_em?: string
          enviado_por: string
          formato: string
          id?: string
          motivo_retirada?: string | null
          organizacao_id: string
          retirado_em?: string | null
          retirado_por?: string | null
          sha256: string
          tipo: string
          unidade_id: string
          venda_id: string
        }
        Update: {
          bytes?: number
          caminho?: string
          descricao?: string | null
          enviado_em?: string
          enviado_por?: string
          formato?: string
          id?: string
          motivo_retirada?: string | null
          organizacao_id?: string
          retirado_em?: string | null
          retirado_por?: string | null
          sha256?: string
          tipo?: string
          unidade_id?: string
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venda_anexos_enviado_por_fkey"
            columns: ["enviado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_anexos_retirado_por_fkey"
            columns: ["retirado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_anexos_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "venda_anexos_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
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
          os_id: string | null
          preco_id: string | null
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
          os_id?: string | null
          preco_id?: string | null
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
          os_id?: string | null
          preco_id?: string | null
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
            foreignKeyName: "venda_itens_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_itens_preco_id_fkey"
            columns: ["preco_id"]
            isOneToOne: false
            referencedRelation: "precos"
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
          conciliado_em: string | null
          conciliado_por: string | null
          confirmacao: string
          confirmado_por: string | null
          criado_em: string
          entrada_centavos: number
          entrada_do_financiamento: boolean
          estornado_em: string | null
          id: string
          liquidado_em: string | null
          meio: string
          meio_entrada: string | null
          ordem: number
          organizacao_id: string
          parcelas: number | null
          referencia_conciliacao: string | null
          situacao: string
          terminal_id: string | null
          valor_centavos: number
          valor_liquido_centavos: number | null
          venda_id: string
        }
        Insert: {
          comprovante?: string | null
          conciliado_em?: string | null
          conciliado_por?: string | null
          confirmacao: string
          confirmado_por?: string | null
          criado_em?: string
          entrada_centavos?: number
          entrada_do_financiamento?: boolean
          estornado_em?: string | null
          id?: string
          liquidado_em?: string | null
          meio: string
          meio_entrada?: string | null
          ordem: number
          organizacao_id: string
          parcelas?: number | null
          referencia_conciliacao?: string | null
          situacao?: string
          terminal_id?: string | null
          valor_centavos: number
          valor_liquido_centavos?: number | null
          venda_id: string
        }
        Update: {
          comprovante?: string | null
          conciliado_em?: string | null
          conciliado_por?: string | null
          confirmacao?: string
          confirmado_por?: string | null
          criado_em?: string
          entrada_centavos?: number
          entrada_do_financiamento?: boolean
          estornado_em?: string | null
          id?: string
          liquidado_em?: string | null
          meio?: string
          meio_entrada?: string | null
          ordem?: number
          organizacao_id?: string
          parcelas?: number | null
          referencia_conciliacao?: string | null
          situacao?: string
          terminal_id?: string | null
          valor_centavos?: number
          valor_liquido_centavos?: number | null
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venda_pagamentos_conciliado_por_fkey"
            columns: ["conciliado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_pagamentos_confirmado_por_fkey"
            columns: ["confirmado_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_pagamentos_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "terminais"
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
      whatsapp_envio_eventos: {
        Row: {
          detalhe: string | null
          envio_id: string
          id: number
          ocorrido_em: string
          organizacao_id: string
          origem: string
          situacao: string
          usuario_id: string | null
        }
        Insert: {
          detalhe?: string | null
          envio_id: string
          id?: never
          ocorrido_em?: string
          organizacao_id: string
          origem: string
          situacao: string
          usuario_id?: string | null
        }
        Update: {
          detalhe?: string | null
          envio_id?: string
          id?: never
          ocorrido_em?: string
          organizacao_id?: string
          origem?: string
          situacao?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_envio_eventos_envio_id_fkey"
            columns: ["envio_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_envios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_envio_eventos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_envios: {
        Row: {
          atualizado_em: string
          chave: string
          cliente_id: string
          destino_mascarado: string
          documento_id: string
          enviando_desde: string | null
          erro: string | null
          finalidade: string
          id: string
          motivo: string | null
          numero: number
          organizacao_id: string
          pedido_em: string
          pedido_id: string
          pedido_por: string
          provedor_id: string | null
          situacao: string
          tentativas: number
          unidade_id: string
          venda_id: string
        }
        Insert: {
          atualizado_em?: string
          chave: string
          cliente_id: string
          destino_mascarado: string
          documento_id: string
          enviando_desde?: string | null
          erro?: string | null
          finalidade?: string
          id?: string
          motivo?: string | null
          numero?: never
          organizacao_id: string
          pedido_em?: string
          pedido_id: string
          pedido_por: string
          provedor_id?: string | null
          situacao?: string
          tentativas?: number
          unidade_id: string
          venda_id: string
        }
        Update: {
          atualizado_em?: string
          chave?: string
          cliente_id?: string
          destino_mascarado?: string
          documento_id?: string
          enviando_desde?: string | null
          erro?: string | null
          finalidade?: string
          id?: string
          motivo?: string | null
          numero?: never
          organizacao_id?: string
          pedido_em?: string
          pedido_id?: string
          pedido_por?: string
          provedor_id?: string | null
          situacao?: string
          tentativas?: number
          unidade_id?: string
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_envios_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_envios_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "notas_documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_envios_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "notas_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_envios_pedido_por_fkey"
            columns: ["pedido_por"]
            isOneToOne: false
            referencedRelation: "perfis_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_envios_unidade_id_organizacao_id_fkey"
            columns: ["unidade_id", "organizacao_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id", "organizacao_id"]
          },
          {
            foreignKeyName: "whatsapp_envios_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
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
      anuncios_importar: {
        Args: {
          p_arquivo: string
          p_impressao: string
          p_linhas: Json
          p_mapeamento: Json
          p_plataforma: string
        }
        Returns: Json
      }
      anuncios_painel: {
        Args: { p_fim: string; p_inicio: string }
        Returns: Json
      }
      aplicar_desconto: {
        Args: { p_desconto: number; p_item: string }
        Returns: string
      }
      atividade_criar: {
        Args: { p_chave: string; p_dados: Json }
        Returns: Json
      }
      atividade_encerrar: {
        Args: { p_atividade: string; p_feita: boolean; p_resultado: string }
        Returns: boolean
      }
      aviso_cancelar: { Args: { p_endpoint: string }; Returns: boolean }
      aviso_inscrever: {
        Args: {
          p_auth: string
          p_dispositivo?: string
          p_endpoint: string
          p_p256dh: string
        }
        Returns: Json
      }
      aviso_minhas_inscricoes: { Args: never; Returns: Json }
      aviso_teste: { Args: never; Returns: Json }
      avisos_a_enviar: {
        Args: { p_limite?: number; p_segredo: string }
        Returns: Json
      }
      avisos_resultado: {
        Args: { p_resultados: Json; p_segredo: string }
        Returns: Json
      }
      bonus_definir: {
        Args: { p_faixas: Json; p_motivo: string; p_vigente_desde: string }
        Returns: number
      }
      bonus_do_mes: {
        Args: { p_mes: string; p_unidade: string }
        Returns: Json
      }
      bonus_fechamento_aprovar: {
        Args: { p_decisoes: Json; p_fechamento: string }
        Returns: number
      }
      bonus_fechamento_do_mes: {
        Args: { p_mes: string; p_unidade: string }
        Returns: Json
      }
      bonus_fechamento_enviar: {
        Args: {
          p_contestacoes: Json
          p_mes: string
          p_totais: Json
          p_unidade: string
        }
        Returns: string
      }
      caixa_cancelar_saida: { Args: { p_saida: string }; Returns: boolean }
      caixa_decidir_saida: {
        Args: { p_autorizar: boolean; p_motivo: string; p_saida: string }
        Returns: string
      }
      caixa_pedir_saida: {
        Args: { p_chave: string; p_motivo: string; p_valor: number }
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
      catalogo_definir_peca_de_assistencia: {
        Args: {
          p_categoria: string
          p_motivo: string
          p_organizacao: string
          p_peca: boolean
        }
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
      catalogo_desligar_codigo: {
        Args: { p_motivo: string; p_vinculo: string }
        Returns: boolean
      }
      catalogo_ligar_codigo: {
        Args: {
          p_canal: string
          p_codigo: string
          p_motivo: string
          p_sku_no_canal: string
          p_variante: string
        }
        Returns: Json
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
      catalogo_variante_por_codigo: {
        Args: { p_canal: string; p_codigo: string }
        Returns: string
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
      cliente_dados_do_titular: {
        Args: { p_cliente: string; p_motivo: string }
        Returns: Json
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
      clientes_duplicados: { Args: never; Returns: Json }
      clientes_marcar_diferentes: {
        Args: { p_a: string; p_b: string; p_motivo: string }
        Returns: boolean
      }
      clientes_mesclar: {
        Args: { p_absorver: string; p_manter: string; p_motivo: string }
        Returns: Json
      }
      clientes_segmentos: { Args: never; Returns: Json }
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
      connect_painel: {
        Args: {
          p_fim: string
          p_inicio: string
          p_unidade?: string
          p_vendedor?: string
        }
        Returns: Json
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
      connect_worker_registrar_conciliacao: {
        Args: {
          p_ate: string
          p_de: string
          p_linhas: Json
          p_organizacao: string
          p_relatorio: string
        }
        Returns: Json
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
      conta_pagar_anexar: {
        Args: {
          p_caminho: string
          p_conta: string
          p_descricao: string
          p_sha256: string
          p_tipo: string
        }
        Returns: Json
      }
      conta_pagar_cancelar: {
        Args: { p_conta: string; p_e_seguintes: boolean; p_motivo: string }
        Returns: number
      }
      conta_pagar_categoria_salvar: {
        Args: {
          p_ativa: boolean
          p_categoria: string
          p_entra_no_resultado?: boolean
          p_nome: string
        }
        Returns: string
      }
      conta_pagar_corrigir: {
        Args: { p_conta: string; p_dados: Json; p_motivo: string }
        Returns: boolean
      }
      conta_pagar_desfazer_pagamento: {
        Args: { p_conta: string; p_motivo: string }
        Returns: boolean
      }
      conta_pagar_lancar: {
        Args: { p_chave: string; p_dados: Json }
        Returns: string
      }
      conta_pagar_ligar_entrada: {
        Args: { p_conta: string; p_entrada: string; p_motivo: string }
        Returns: number
      }
      conta_pagar_pagar: {
        Args: {
          p_conta: string
          p_pago_em: string
          p_referencia: string
          p_valor_pago: number
        }
        Returns: boolean
      }
      conta_pagar_retirar_anexo: {
        Args: { p_anexo: string; p_motivo: string }
        Returns: boolean
      }
      contas_a_pagar_resumo: {
        Args: { p_rede?: boolean; p_unidade?: string }
        Returns: Json
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
      crm_agenda: { Args: never; Returns: Json }
      crm_funil: { Args: never; Returns: Json }
      custo_corrigir: {
        Args: { p_motivo: string; p_valor_centavos: number; p_variante: string }
        Returns: boolean
      }
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
      equipe_por_papel: { Args: { p_organizacao: string }; Returns: Json }
      estoque_carga_aplicar: {
        Args: { p_carga: string; p_motivo: string }
        Returns: Json
      }
      estoque_carga_descartar: {
        Args: { p_carga: string; p_motivo: string }
        Returns: boolean
      }
      estoque_carga_desfazer: {
        Args: { p_carga: string; p_motivo: string }
        Returns: Json
      }
      estoque_carga_previa: {
        Args: {
          p_arquivo_nome: string
          p_corte: string
          p_linhas: Json
          p_mapeamento: Json
          p_organizacao: string
          p_sha256: string
          p_unidade: string
        }
        Returns: Json
      }
      estoque_carga_resolver: {
        Args: {
          p_carga: string
          p_motivo: string
          p_numero?: number
          p_resolucao: string
        }
        Returns: Json
      }
      estoque_entrada: {
        Args: { p_entrada: string; p_numero: number; p_unidade: string }
        Returns: Json
      }
      estoque_entradas: {
        Args: { p_antes?: number; p_limite?: number; p_unidade: string }
        Returns: Json
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
      estoque_painel: { Args: { p_unidade?: string }; Returns: Json }
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
      estoque_valor_em_custo: { Args: { p_unidade?: string }; Returns: Json }
      extrato_conciliar: {
        Args: { p_linha: string; p_pagamento: string }
        Returns: Json
      }
      extrato_conciliar_certas: { Args: { p_extrato: string }; Returns: Json }
      extrato_desfazer: {
        Args: { p_linha: string; p_motivo: string }
        Returns: boolean
      }
      extrato_do_vendedor: {
        Args: { p_mes: string; p_unidade: string; p_vendedor: string }
        Returns: Json
      }
      extrato_ignorar: {
        Args: { p_linha: string; p_motivo: string }
        Returns: boolean
      }
      extrato_importar: {
        Args: {
          p_arquivo: string
          p_fonte: string
          p_impressao: string
          p_linhas: Json
          p_mapeamento: Json
          p_meios: string[]
          p_tipo: string
          p_unidade: string
        }
        Returns: Json
      }
      extrato_resumo: { Args: { p_extrato: string }; Returns: Json }
      extrato_sugestoes: {
        Args: { p_extrato: string }
        Returns: {
          concluida_em: string
          linha_id: string
          loja: string
          meio: string
          pagamento_id: string
          pela_referencia: boolean
          terminal: string
          valor_centavos: number
          venda_numero: number
        }[]
      }
      extratos_recentes: {
        Args: { p_limite: number }
        Returns: {
          arquivo: string
          conciliadas: number
          fonte: string
          id: string
          ignoradas: number
          importado_em: string
          linhas: number
          loja: string
          numero: number
          pendentes: number
          periodo_fim: string
          periodo_inicio: string
          tipo: string
          unidade_id: string
        }[]
      }
      fechar_caixa: {
        Args: { p_contado: number; p_observacao: string }
        Returns: {
          contado: number
          diferenca: number
          esperado: number
        }[]
      }
      financeira_corrigir_recebimento: {
        Args: {
          p_conta: string
          p_motivo: string
          p_recebido_em: string
          p_referencia: string
          p_valor_recebido: number
        }
        Returns: boolean
      }
      financeira_desfazer_recebimento: {
        Args: { p_conta: string; p_motivo: string }
        Returns: boolean
      }
      financeira_receber: {
        Args: {
          p_conta: string
          p_recebido_em: string
          p_referencia: string
          p_valor_recebido: number
        }
        Returns: boolean
      }
      financeiras_a_receber: { Args: never; Returns: Json }
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
      fotos_limpeza_concluir: { Args: { p_caminhos: string[] }; Returns: Json }
      fotos_sem_registro: { Args: never; Returns: Json }
      fotos_sem_registro_limpar: {
        Args: { p_caminhos: string[] }
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
        Args: { p_comparacao: number; p_importacao: string; p_motivo: string }
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
      loja_definir_regiao: {
        Args: { p_motivo: string; p_regiao: string; p_unidade: string }
        Returns: boolean
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
      loja_pedido_atender: {
        Args: { p_chave: string; p_pedido: string }
        Returns: Json
      }
      loja_pedido_cancelar: {
        Args: { p_motivo: string; p_pedido: string }
        Returns: boolean
      }
      loja_pedido_consultar: {
        Args: { p_codigo: string; p_organizacao: string; p_whatsapp: string }
        Returns: Json
      }
      loja_pedir: {
        Args: {
          p_chave: string
          p_itens: Json
          p_nome: string
          p_organizacao: string
          p_origem?: Json
          p_unidade: string
          p_whatsapp: string
        }
        Returns: Json
      }
      loja_produto: {
        Args: { p_organizacao: string; p_produto: string }
        Returns: Json
      }
      loja_reserva_atender: {
        Args: { p_chave: string; p_reserva: string }
        Returns: Json
      }
      loja_reserva_cancelar: {
        Args: { p_motivo: string; p_reserva: string }
        Returns: boolean
      }
      loja_reserva_contato: { Args: { p_reserva: string }; Returns: string }
      loja_reservar: {
        Args: {
          p_chave: string
          p_nome: string
          p_organizacao: string
          p_origem?: Json
          p_unidade: string
          p_variante: string
          p_whatsapp: string
        }
        Returns: Json
      }
      loja_reservas_liberar_vencidas: { Args: never; Returns: number }
      loja_vitrine: {
        Args: { p_busca?: string; p_categoria?: string; p_organizacao: string }
        Returns: Json
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
      margem_itens: {
        Args: {
          p_apos?: number
          p_fim: string
          p_inicio: string
          p_limite?: number
          p_unidade?: string
        }
        Returns: Json
      }
      margem_painel: {
        Args: { p_fim: string; p_inicio: string; p_unidade?: string }
        Returns: Json
      }
      margem_por_vendedor: {
        Args: { p_fim: string; p_inicio: string; p_unidade?: string }
        Returns: Json
      }
      marketplace_importar: {
        Args: {
          p_arquivo: string
          p_canal: string
          p_impressao: string
          p_linhas: number
          p_mapeamento: Json
          p_pedidos: Json
        }
        Returns: Json
      }
      marketplace_painel: {
        Args: { p_fim: string; p_inicio: string }
        Returns: Json
      }
      metas_definir: {
        Args: {
          p_mes: string
          p_motivo: string
          p_unidade: string
          p_valores: Json
          p_vendedor: string
        }
        Returns: number
      }
      metas_equipe: {
        Args: { p_mes: string; p_unidade: string }
        Returns: Json
      }
      metas_lojas: {
        Args: { p_mes: string; p_unidade?: string }
        Returns: Json
      }
      metas_painel: {
        Args: { p_mes: string; p_unidade: string }
        Returns: Json
      }
      molde_da_sessao: {
        Args: {
          p_permissoes_da_loja: string[]
          p_permissoes_da_rede?: string[]
        }
        Returns: Json
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
      nota_confirmar_destinatario: {
        Args: { p_motivo: string; p_pedido: string }
        Returns: boolean
      }
      nota_enviar_whatsapp: {
        Args: { p_chave: string; p_motivo: string; p_pedido: string }
        Returns: string
      }
      notas_anexar_documento: {
        Args: {
          p_caminho: string
          p_pedido: string
          p_protocolo: string
          p_sha256: string
          p_tipo: string
        }
        Returns: string
      }
      notas_cancelar: {
        Args: { p_motivo: string; p_pedido: string }
        Returns: boolean
      }
      notas_conciliacao: {
        Args: { p_fim: string; p_inicio: string; p_unidade?: string }
        Returns: Json
      }
      notas_conferir_divergencia: {
        Args: { p_observacao: string; p_pedido: string; p_tipo: string }
        Returns: boolean
      }
      notas_corrigir: {
        Args: { p_destinatario: Json; p_pedido: string }
        Returns: boolean
      }
      notas_corrigir_chave: {
        Args: { p_chave_acesso: string; p_motivo: string; p_pedido: string }
        Returns: boolean
      }
      notas_dados_para_emitir: { Args: { p_pedido: string }; Returns: Json }
      notas_decidir: {
        Args: { p_aprovar: boolean; p_observacao: string; p_pedido: string }
        Returns: string
      }
      notas_registrar_cancelamento: {
        Args: { p_justificativa: string; p_pedido: string; p_protocolo: string }
        Returns: boolean
      }
      notas_registrar_carta_de_correcao: {
        Args: {
          p_correcao: string
          p_numero: number
          p_pedido: string
          p_protocolo: string
        }
        Returns: boolean
      }
      notas_registrar_emissao: {
        Args: { p_chave_acesso: string; p_observacao: string; p_pedido: string }
        Returns: string
      }
      notas_solicitar: {
        Args: { p_chave: string; p_destinatario: Json; p_venda: string }
        Returns: string
      }
      notas_vendas_sem_pedido: { Args: never; Returns: Json }
      oportunidade_anotar: {
        Args: { p_oportunidade: string; p_texto: string }
        Returns: boolean
      }
      oportunidade_atribuir: {
        Args: {
          p_motivo: string
          p_oportunidade: string
          p_responsavel: string
        }
        Returns: boolean
      }
      oportunidade_detalhe: { Args: { p_oportunidade: string }; Returns: Json }
      oportunidade_mover: {
        Args: { p_dados: Json; p_etapa: string; p_oportunidade: string }
        Returns: boolean
      }
      oportunidade_registrar: {
        Args: { p_chave: string; p_cliente: string; p_dados: Json }
        Returns: Json
      }
      os_abrir: { Args: { p_chave: string; p_dados: Json }; Returns: Json }
      os_anexar_foto: {
        Args: { p_caminho: string; p_os: string; p_sha256: string }
        Returns: string
      }
      os_assistencias: { Args: never; Returns: Json }
      os_cobrar: {
        Args: { p_chave: string; p_os: string; p_venda: string }
        Returns: string
      }
      os_concluir_servico: {
        Args: { p_observacao: string; p_os: string }
        Returns: boolean
      }
      os_contato_whatsapp: {
        Args: { p_aviso: string; p_os: string }
        Returns: string
      }
      os_custodia: {
        Args: {
          p_assistencia: string
          p_observacao: string
          p_os: string
          p_passo: string
        }
        Returns: boolean
      }
      os_devolver_peca: {
        Args: { p_motivo: string; p_peca: string }
        Returns: boolean
      }
      os_entregar: {
        Args: { p_observacao: string; p_os: string }
        Returns: boolean
      }
      os_orcar: {
        Args: { p_chave: string; p_dados: Json; p_os: string }
        Returns: Json
      }
      os_relatorio: {
        Args: { p_fim: string; p_inicio: string; p_unidade?: string }
        Returns: Json
      }
      os_responder_orcamento: {
        Args: {
          p_canal: string
          p_observacao: string
          p_orcamento: string
          p_resposta: string
        }
        Returns: boolean
      }
      os_usar_peca: {
        Args: {
          p_chave: string
          p_observacao: string
          p_os: string
          p_quantidade: number
          p_variante: string
        }
        Returns: Json
      }
      pagamento_conciliar: {
        Args: {
          p_liquidado_em: string
          p_pagamento: string
          p_referencia: string
          p_valor_liquido: number
        }
        Returns: boolean
      }
      pagamento_desconciliar: {
        Args: { p_motivo: string; p_pagamento: string }
        Returns: boolean
      }
      pagamentos_do_periodo: {
        Args: { p_fim: string; p_inicio: string }
        Returns: Json
      }
      pagamentos_por_terminal: {
        Args: { p_fim: string; p_inicio: string; p_unidade?: string }
        Returns: Json
      }
      pdv_tela: { Args: never; Returns: Json }
      pedido_compra: { Args: { p_pedido: string }; Returns: Json }
      pedido_compra_criar: {
        Args: {
          p_chave: string
          p_documento: string
          p_fornecedor: string
          p_itens: Json
          p_observacao: string
          p_previsto: string
          p_unidade: string
        }
        Returns: Json
      }
      pedido_compra_encerrar: {
        Args: { p_motivo: string; p_pedido: string }
        Returns: string
      }
      pedido_compra_ligar_entrada: {
        Args: { p_entrada: string; p_motivo: string; p_pedido: string }
        Returns: boolean
      }
      pedidos_compra: {
        Args: { p_situacao?: string; p_unidade?: string }
        Returns: Json
      }
      pedir_aprovacao: {
        Args: { p_item: string; p_motivo: string }
        Returns: string
      }
      pendencias_da_loja: { Args: never; Returns: Json }
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
      precos_vigentes: {
        Args: { p_unidade: string; p_variantes: string[] }
        Returns: {
          preco_centavos: number
          variante_id: string
        }[]
      }
      previsao_de_caixa: {
        Args: { p_semanas?: number; p_unidade?: string }
        Returns: Json
      }
      ranking_nomes: {
        Args: { p_vendedores: string[] }
        Returns: {
          id: string
          nome: string
        }[]
      }
      recebiveis_painel: {
        Args: { p_dias?: number; p_unidade?: string }
        Returns: Json
      }
      regiao_salvar: {
        Args: {
          p_ativa: boolean
          p_id: string
          p_motivo: string
          p_nome: string
          p_organizacao: string
        }
        Returns: Json
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
      reservas_do_site_painel: {
        Args: { p_fim: string; p_inicio: string; p_unidade?: string }
        Returns: Json
      }
      resultado_do_mes: {
        Args: { p_mes: string; p_meses?: number; p_unidade?: string }
        Returns: Json
      }
      rotinas_situacao: {
        Args: never
        Returns: {
          descricao: string
          erro: string
          frequencia: string
          nome: string
          situacao: string
          ultima_falha: string
          ultima_ok: string
        }[]
      }
      saude_do_banco: { Args: { p_migracao?: string }; Returns: Json }
      selecionar_unidade: { Args: { p_unidade: string }; Returns: boolean }
      situacao_da_sessao: {
        Args: never
        Returns: {
          segundo_fator_pendente: boolean
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
      terminal_salvar: {
        Args: {
          p_apelido: string
          p_ativo: boolean
          p_id: string
          p_identificador: string
          p_motivo: string
          p_provedor: string
          p_unidade: string
        }
        Returns: string
      }
      transferencia_encerrar: {
        Args: { p_motivo: string; p_situacao: string; p_transferencia: string }
        Returns: string
      }
      transferencia_enviar: {
        Args: { p_transferencia: string }
        Returns: string
      }
      transferencia_lojas: {
        Args: never
        Returns: {
          id: string
          nome: string
          tipo: string
        }[]
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
      transferencia_remessa_enviar: {
        Args: { p_remessa: string }
        Returns: Json
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
      transferencia_solicitar_remessa: {
        Args: {
          p_chave: string
          p_destino: string
          p_itens: Json
          p_motivo: string
          p_origem: string
        }
        Returns: Json
      }
      unidade_atual: { Args: never; Returns: string }
      venda_anexar_documento: {
        Args: {
          p_caminho: string
          p_descricao: string
          p_sha256: string
          p_tipo: string
          p_venda: string
        }
        Returns: Json
      }
      venda_retirar_anexo: {
        Args: { p_anexo: string; p_motivo: string }
        Returns: boolean
      }
      venda_vincular_cliente: {
        Args: { p_cliente: string; p_motivo: string; p_venda: string }
        Returns: boolean
      }
      vendas_painel: {
        Args: {
          p_fim: string
          p_inicio: string
          p_por_hora?: boolean
          p_unidade?: string
          p_vendedor?: string
        }
        Returns: Json
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
      whatsapp_aviso_de_status: {
        Args: { p_detalhe: string; p_provedor_id: string; p_status: string }
        Returns: boolean
      }
      whatsapp_envio_resolver: {
        Args: { p_envio: string; p_motivo: string }
        Returns: boolean
      }
      whatsapp_worker_reivindicar: {
        Args: { p_limite: number }
        Returns: {
          chave_acesso: string
          cliente_nome: string
          documento_caminho: string
          envio_id: string
          nota_numero: number
          nota_serie: number
          organizacao_id: string
          telefone: string
        }[]
      }
      whatsapp_worker_resultado: {
        Args: { p_envio: string; p_resultado: Json }
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
