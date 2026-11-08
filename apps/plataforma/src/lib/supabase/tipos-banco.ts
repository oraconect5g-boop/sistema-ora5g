// ARQUIVO GERADO pelo Supabase (generate_typescript_types do projeto ora5g-dev) depois da
// migration 20261108204536_fotos_dos_produtos. Não edite à mão: gere de novo a cada
// migration aplicada (auditoria do Codex de 08/11, §7.2). O teste tipos-banco.test.ts confere
// que as funções que a aplicação chama existem aqui.
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
          criado_em: string
          criado_por: string | null
          fim: string | null
          id: string
          inicio: string
          motivo: string | null
          organizacao_id: string
          origem: string
          unidade_id: string | null
          valor_centavos: number
          variante_id: string
        }
        Insert: {
          canal?: string
          criado_em?: string
          criado_por?: string | null
          fim?: string | null
          id?: string
          inicio?: string
          motivo?: string | null
          organizacao_id: string
          origem: string
          unidade_id?: string | null
          valor_centavos: number
          variante_id: string
        }
        Update: {
          canal?: string
          criado_em?: string
          criado_por?: string | null
          fim?: string | null
          id?: string
          inicio?: string
          motivo?: string | null
          organizacao_id?: string
          origem?: string
          unidade_id?: string | null
          valor_centavos?: number
          variante_id?: string
        }
        Relationships: [
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
      alterar_situacao_pessoa: {
        Args: { p_motivo: string; p_situacao: string; p_usuario: string }
        Returns: boolean
      }
      cancelar_convite: {
        Args: { p_convite: string; p_motivo: string }
        Returns: boolean
      }
      conferir_item: { Args: { p_item: string }; Returns: boolean }
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
      identidade_bloqueios_a_aplicar: {
        Args: never
        Returns: {
          bloquear: boolean
          usuario_id: string
        }[]
      }
      identidade_concluir_convite: {
        Args: { p_convite: string; p_ja_existia: boolean; p_usuario: string }
        Returns: undefined
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
      liberar_reserva: { Args: { p_reserva: string }; Returns: boolean }
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
      preco_vigente: {
        Args: {
          p_canal?: string
          p_momento?: string
          p_unidade: string
          p_variante: string
        }
        Returns: number
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
      unidade_atual: { Args: never; Returns: string }
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
