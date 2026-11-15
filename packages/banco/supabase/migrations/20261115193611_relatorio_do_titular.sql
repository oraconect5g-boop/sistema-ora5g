-- =============================================================================
-- O relatório dos dados do titular (lote QUAL-011a: ORA-QUAL-011, em parte; LGPD, Lei 13.709/2018, art. 18, I e
-- II, e art. 19)
--
-- O cliente tem direito de confirmar que a rede trata dados dele e de acessá-los (art. 18, I e II): na hora, em formato
-- simplificado, ou numa declaração completa em até 15 dias, com a origem dos dados e a finalidade (art. 19, I e II),
-- impressa ou por meio eletrônico, à escolha dele (art. 19, § 2º). Até aqui, responder pedia ir tela por tela.
-- public.cliente_dados_do_titular(cliente, motivo) junta num só documento o que o banco guarda sobre a pessoa:
--   * o cadastro, com os dados guardados em privado (documento, telefone, e-mail, nascimento e endereço), as
--     finalidades (por que cada dado foi pedido) e a origem (canal, loja e data do cadastro);
--   * os cadastros mesclados nele (a mesclagem juntou o histórico; em cadeia, se houver);
--   * os consentimentos de contato, com o histórico inteiro;
--   * as compras: número, situação, loja, datas, o nome e o e-mail digitados na venda, os itens (com o IMEI do
--     aparelho), os valores, os meios de pagamento (sem comprovante nem dado de cartão) e as notas pedidas;
--   * o funil e a agenda: os interesses, as etapas, os próximos passos e as atividades;
--   * as ordens de serviço da assistência: o aparelho, o defeito, o estado na entrada e as datas;
--   * os documentos anexados às compras (só a lista: o arquivo sai pela tela da venda).
-- Quem gera: o dono (cliente.exportar, a mesma permissão de listar os clientes), na loja do turno, com a senha
-- digitada há pouco (ORG-006b) e um motivo (o pedido do titular). Cada relatório fica na auditoria
-- (cliente.relatorio_do_titular, com o motivo e sem o conteúdo) e entra na conta do limite de consultas da pessoa
-- (as buscas, as revelações e os relatórios dos últimos 10 minutos; com 30, OR028). Nada muda no cadastro. Ficam para o jurídico/encarregado (ORA-QUAL-011; ADR-008): a retenção, a anonimização a pedido e quem
-- mais pode gerar o relatório.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create or replace function public.cliente_dados_do_titular(p_cliente uuid, p_motivo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade uuid;
  v_organizacao uuid;
  v_motivo text;
  v_cliente public.clientes;
  v_dados privado.cliente_dados;
  v_ids uuid[];
  v_vendas uuid[];
begin
  perform privado.exigir_autenticacao_recente(); -- ORG-006b: o relatório inteiro de uma pessoa pede a senha digitada há pouco
  select c.unidade_id, c.organizacao_id into v_unidade, v_organizacao from privado.cliente_contexto('cliente.exportar') c;
  v_motivo := privado.exigir_motivo(p_motivo);
  if length(v_motivo) > 200 then
    raise exception 'O motivo tem até 200 letras' using errcode = '22023';
  end if;
  select * into v_cliente from public.clientes c where c.id = p_cliente and c.organizacao_id = v_organizacao;
  if not found then
    raise exception 'Cliente não encontrado' using errcode = 'P0002';
  end if;
  if v_cliente.situacao = 'mesclado' then
    raise exception 'Cadastro mesclado em outro: gere o relatório do cliente que ficou' using errcode = '22023';
  end if;
  -- O limite de consultas (30 em 10 minutos, OR028) conta as buscas, as revelações e também os relatórios: ninguém
  -- tira a base inteira, relatório atrás de relatório.
  if privado.cliente_consultas_recentes() + (
       select count(*)::int from public.auditoria a
       where a.usuario_id = (select auth.uid()) and a.acao = 'cliente.relatorio_do_titular'
         and a.ocorrido_em > now() - interval '10 minutes') >= 30 then
    raise exception 'Muitas consultas seguidas: aguarde alguns minutos' using errcode = 'OR028';
  end if;

  -- O cliente e os cadastros mesclados nele, em cadeia (A mesclado em B, B mesclado neste).
  with recursive cadeia (id) as (
    select p_cliente
    union
    select c.id from public.clientes c join cadeia on c.mesclado_em = cadeia.id where c.organizacao_id = v_organizacao
  )
  select array_agg(cadeia.id) into v_ids from cadeia;
  select coalesce(array_agg(v.id), '{}') into v_vendas
  from public.vendas v where v.cliente_id = any(v_ids) and v.organizacao_id = v_organizacao;
  select * into v_dados from privado.cliente_dados d where d.cliente_id = p_cliente;

  perform privado.cliente_registrar_acesso('cliente.relatorio_do_titular', p_cliente, v_unidade, v_organizacao,
    jsonb_build_object('motivo', v_motivo, 'cadastros', cardinality(v_ids), 'compras', cardinality(v_vendas)));

  return jsonb_build_object(
    'gerado_em', now(),
    'cadastro', jsonb_build_object(
      'codigo', v_cliente.numero, 'tipo', v_cliente.tipo, 'nome', v_cliente.nome, 'situacao', v_cliente.situacao,
      'documento', v_dados.documento, 'telefone', v_dados.telefone, 'email', v_dados.email, 'nascimento', v_dados.nascimento,
      'endereco', v_dados.endereco, 'finalidades', to_jsonb(v_cliente.finalidades), 'origem', v_cliente.origem,
      'loja_de_origem', (select u.nome from public.unidades u where u.id = v_cliente.unidade_origem_id),
      'cadastrado_em', v_cliente.criado_em, 'atualizado_em', v_cliente.atualizado_em),
    'mesclados', (
      select coalesce(jsonb_agg(jsonb_build_object('codigo', c.numero, 'nome', c.nome, 'origem', c.origem, 'cadastrado_em', c.criado_em) order by c.numero), '[]'::jsonb)
      from public.clientes c where c.id = any(v_ids) and c.id <> p_cliente),
    'consentimentos', (
      select coalesce(jsonb_agg(jsonb_build_object('canal', k.canal, 'finalidade', k.finalidade, 'situacao', k.situacao, 'fonte', k.fonte,
               'loja', u.nome, 'registrado_em', k.registrado_em) order by k.registrado_em, k.id), '[]'::jsonb)
      from public.cliente_consentimentos k left join public.unidades u on u.id = k.unidade_id
      where k.cliente_id = any(v_ids)),
    'compras', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'numero', v.numero, 'situacao', v.situacao, 'loja', u.nome, 'criada_em', v.criado_em, 'concluida_em', v.concluida_em,
               'nome_na_venda', v.cliente_nome, 'email_na_venda', v.cliente_email, 'total_centavos', v.total_centavos,
               'itens', (
                 select coalesce(jsonb_agg(jsonb_build_object('produto', va.nome, 'sku', va.sku, 'imei', s.imei, 'quantidade', i.quantidade,
                          'preco_unitario_centavos', i.preco_unitario_centavos, 'desconto_centavos', i.desconto_centavos) order by i.criado_em, i.id), '[]'::jsonb)
                 from public.venda_itens i
                 left join public.variantes va on va.id = i.variante_id
                 left join public.itens_serializados s on s.id = i.item_serializado_id
                 where i.venda_id = v.id),
               'pagamentos', (
                 select coalesce(jsonb_agg(jsonb_build_object('meio', p.meio, 'valor_centavos', p.valor_centavos, 'entrada_centavos', p.entrada_centavos,
                          'situacao', p.situacao) order by p.ordem), '[]'::jsonb)
                 from public.venda_pagamentos p where p.venda_id = v.id),
               'notas', (
                 select coalesce(jsonb_agg(jsonb_build_object('tipo', n.tipo, 'situacao', n.situacao, 'modelo', n.modelo, 'serie', n.serie,
                          'numero', n.numero_documento, 'chave_de_acesso', n.chave_acesso, 'emitida_em', n.emitida_em) order by n.criado_em), '[]'::jsonb)
                 from public.notas_pedidos n where n.venda_id = v.id))
             order by v.criado_em, v.numero), '[]'::jsonb)
      from public.vendas v join public.unidades u on u.id = v.unidade_id
      where v.id = any(v_vendas)),
    'oportunidades', (
      select coalesce(jsonb_agg(jsonb_build_object('numero', o.numero, 'loja', u.nome, 'origem', o.origem, 'campanha', o.campanha,
               'interesse', o.interesse, 'etapa', o.etapa, 'valor_estimado_centavos', o.valor_estimado_centavos, 'proximo_passo', o.proximo_passo,
               'proximo_passo_em', o.proximo_passo_em, 'motivo_perda', o.motivo_perda, 'observacao_encerramento', o.observacao_encerramento,
               'criada_em', o.criado_em, 'encerrada_em', o.encerrado_em) order by o.criado_em, o.numero), '[]'::jsonb)
      from public.oportunidades o join public.unidades u on u.id = o.unidade_id
      where o.cliente_id = any(v_ids)),
    'atividades', (
      select coalesce(jsonb_agg(jsonb_build_object('tipo', a.tipo, 'descricao', a.descricao, 'loja', u.nome, 'vence_em', a.vence_em,
               'situacao', a.situacao, 'resultado', a.resultado, 'encerrada_em', a.encerrada_em) order by a.vence_em, a.id), '[]'::jsonb)
      from public.atividades a join public.unidades u on u.id = a.unidade_id
      where a.cliente_id = any(v_ids)
         or a.oportunidade_id in (select o.id from public.oportunidades o where o.cliente_id = any(v_ids))),
    'ordens_de_servico', (
      select coalesce(jsonb_agg(jsonb_build_object('numero', s.numero, 'loja', u.nome, 'aparelho', s.aparelho, 'imei', s.imei,
               'numero_de_serie', s.numero_serie, 'defeito', s.defeito, 'estado_na_entrada', s.estado_entrada, 'acessorios', to_jsonb(s.acessorios),
               'situacao', s.situacao, 'prazo', s.prazo, 'aberta_em', s.aberta_em, 'encerrada_em', s.encerrada_em) order by s.aberta_em, s.numero), '[]'::jsonb)
      from public.ordens_servico s join public.unidades u on u.id = s.unidade_id
      where s.cliente_id = any(v_ids)),
    'documentos', (
      select coalesce(jsonb_agg(jsonb_build_object('venda', v.numero, 'tipo', d.tipo, 'descricao', d.descricao, 'enviado_em', d.enviado_em)
               order by d.enviado_em), '[]'::jsonb)
      from public.venda_anexos d join public.vendas v on v.id = d.venda_id
      where d.venda_id = any(v_vendas) and d.retirado_em is null)
  );
end;
$$;

revoke all on function public.cliente_dados_do_titular(uuid, text) from public, anon;
grant execute on function public.cliente_dados_do_titular(uuid, text) to authenticated;
