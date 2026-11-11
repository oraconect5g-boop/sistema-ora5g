-- Reversão de 20261111195120_clientes_mesclagem_e_segmentos (só em banco sem dados reais e sem cadastro mesclado).
-- Volta o texto de cliente_ficha aplicado em 20261111191909_clientes_compartilhados e as restrições de antes;
-- saem as funções, a tabela dos pares diferentes, o gatilho, a coluna e a permissão.
create or replace function public.cliente_ficha(p_cliente uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade uuid;
  v_organizacao uuid;
  v_cliente public.clientes;
begin
  select c.unidade_id, c.organizacao_id into v_unidade, v_organizacao from privado.cliente_contexto('cliente.buscar') c;
  select * into v_cliente from public.clientes c where c.id = p_cliente and c.organizacao_id = v_organizacao;
  if not found then
    raise exception 'Cliente não encontrado' using errcode = 'P0002';
  end if;
  perform privado.cliente_registrar_acesso('cliente.ficha', v_cliente.id, v_unidade, v_organizacao, '{}'::jsonb);
  return jsonb_build_object(
    'id', v_cliente.id, 'numero', v_cliente.numero, 'nome', v_cliente.nome, 'tipo', v_cliente.tipo, 'situacao', v_cliente.situacao,
    'finalidades', to_jsonb(v_cliente.finalidades), 'documento', v_cliente.documento_mascara, 'telefone', v_cliente.telefone_mascara,
    'email', v_cliente.email_mascara, 'nascimento_informado', v_cliente.nascimento_informado, 'endereco_informado', v_cliente.endereco_informado,
    'origem', v_cliente.origem, 'criado_em', v_cliente.criado_em, 'atualizado_em', v_cliente.atualizado_em,
    'loja_de_origem', (select u.nome from public.unidades u where u.id = v_cliente.unidade_origem_id),
    'consentimentos', coalesce((
      select jsonb_agg(jsonb_build_object('canal', x.canal, 'finalidade', x.finalidade, 'situacao', x.situacao, 'fonte', x.fonte,
                                          'registrado_em', x.registrado_em) order by x.canal, x.finalidade)
      from (select distinct on (k.canal, k.finalidade) k.* from public.cliente_consentimentos k
            where k.cliente_id = v_cliente.id order by k.canal, k.finalidade, k.id desc) x), '[]'::jsonb),
    'compras', (select jsonb_build_object('total', count(*), 'ultima', max(v.concluida_em)) from public.vendas v
                where v.cliente_id = v_cliente.id and v.situacao = 'concluida'));
end;
$$;

drop function if exists public.clientes_segmentos();
drop function if exists privado.cliente_explicacao(int, int, timestamptz);
drop function if exists privado.cliente_segmento(int, int, timestamptz, timestamptz);
drop function if exists privado.cliente_compras(uuid);
drop function if exists public.clientes_mesclar(uuid, uuid, text);
drop function if exists public.clientes_marcar_diferentes(uuid, uuid, text);
drop function if exists public.clientes_duplicados();
drop table if exists public.cliente_nao_duplicados;
drop trigger if exists clientes_mesclado_fixo on public.clientes;
drop function if exists privado.cliente_mesclado_fixo();
alter table public.clientes drop constraint if exists clientes_identificador;
alter table public.clientes add constraint clientes_check check (documento_resumo is not null or telefone_resumo is not null);
alter table public.clientes drop constraint if exists clientes_mesclado_coerente;
alter table public.clientes drop constraint if exists clientes_situacao_check;
alter table public.clientes add constraint clientes_situacao_check check (situacao in ('ativo', 'inativo'));
drop index if exists public.clientes_mesclado_em;
alter table public.clientes drop column if exists mesclado_em;
do $$
begin
  perform set_config('ora.motivo', 'Reversão da mesclagem de cadastros', true);
  delete from public.papel_permissoes where permissao = 'cliente.mesclar';
  delete from public.permissoes where codigo = 'cliente.mesclar';
end;
$$;
