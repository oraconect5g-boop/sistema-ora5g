-- =============================================================================
-- Lote TRF-d (ORA-INV-007; o achado F21-04 da auditoria integral do Codex de 21/11/2026, PR #105; a ordem do
-- proprietário de 23/11): resolver a divergência do recebimento da transferência.
--
-- O defeito: o destino recebe e confere; o que faltar vira "recebida com divergência", com a explicação. Daí em diante o
-- que não chegou não tinha destino no sistema: o aparelho ou o chip ficava "em trânsito" para sempre (a entrada de
-- mercadoria o recusa), e a quantidade do acessório tinha saído da origem e não entrava em lugar nenhum.
--
-- Agora o que faltou tem três destinos, e só eles:
--   * chegou depois: a loja de DESTINO confere e dá a entrada (pelo IMEI/ICCID lido, ou pela quantidade contada);
--   * voltou à origem: a loja de ORIGEM confere e dá a entrada de volta (do mesmo jeito);
--   * baixa: quem ajusta estoque na origem (o dono) dá baixa em TUDO o que ainda falta, com o motivo. No livro da origem
--     ficam a volta e a perda, uma depois da outra: o saldo não muda, e a perda aparece como perda, com quem e por quê.
--
--   * public.transferencia_resolucoes: cada resolução, só de inserção (uma por item com IMEI/ICCID; uma por chamada na
--     quantidade). O item é resolvido uma vez; a soma das resoluções nunca passa do que faltou;
--   * public.transferencias.divergencia_resolvida_em: quando o que faltou ficou todo resolvido;
--   * public.transferencia_resolver_divergencia(transferência, decisão, identificadores, quantidade, motivo, chave);
--   * public.transferencias_tela: traz o que faltou, o que já foi resolvido e como.
--
-- A mesma trava de todos os passos da transferência (a linha dela): duas resoluções ao mesmo tempo esperam uma pela outra.
-- A mesma chave devolve o que já estava; a mesma chave com outro conteúdo é recusada (OR004).
-- Códigos: 42501 quem não é do lado certo ou não tem a permissão; P0002 transferência de outra loja ou inexistente;
-- 22023 dados (decisão, motivo, quantidade, IMEI/ICCID que não é um item pendente desta transferência); OR004 a chave
-- repetida com outro conteúdo, ou nada mais a resolver.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

alter table public.transferencias add column divergencia_resolvida_em timestamptz;
alter table public.transferencias add constraint divergencia_resolvida_so_com_divergencia
  check (divergencia_resolvida_em is null or situacao = 'recebida_com_divergencia');
comment on column public.transferencias.divergencia_resolvida_em is
  'TRF-d: quando tudo o que faltou no recebimento teve destino (chegou depois, voltou à origem ou baixa); nulo enquanto houver pendência.';

create table public.transferencia_resolucoes (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  transferencia_id uuid not null references public.transferencias (id),
  decisao text not null check (decisao in ('chegou_depois', 'voltou_a_origem', 'baixada')),
  quantidade int not null check (quantidade between 1 and 9999),
  item_serializado_id uuid references public.itens_serializados (id),
  motivo text not null check (length(motivo) between 10 and 500 and motivo = btrim(motivo)),
  chave text not null check (length(chave) between 1 and 200 and chave = btrim(chave)),
  conteudo text not null,
  criado_por uuid not null references public.perfis_usuario (id),
  -- O relógio de verdade, e não o começo da transação: duas resoluções na mesma transação ficam na ordem em que foram feitas.
  criado_em timestamptz not null default clock_timestamp(),
  foreign key (organizacao_id) references public.organizacoes (id),
  constraint resolucao_do_item_vale_um check (item_serializado_id is null or quantidade = 1)
);
comment on table public.transferencia_resolucoes is
  'TRF-d: o destino de cada unidade que faltou no recebimento de uma transferência (chegou depois, voltou à origem ou baixa). Só de inserção.';
-- O item com IMEI/ICCID é resolvido uma vez; na quantidade, a chave identifica a chamada.
create unique index transferencia_resolucoes_item on public.transferencia_resolucoes (transferencia_id, item_serializado_id)
  where item_serializado_id is not null;
create unique index transferencia_resolucoes_chave on public.transferencia_resolucoes (transferencia_id, chave)
  where item_serializado_id is null;
create index transferencia_resolucoes_transferencia on public.transferencia_resolucoes (transferencia_id);
create index transferencia_resolucoes_item_idx on public.transferencia_resolucoes (item_serializado_id);
create index transferencia_resolucoes_criado_por on public.transferencia_resolucoes (criado_por);
create index transferencia_resolucoes_organizacao on public.transferencia_resolucoes (organizacao_id);
create trigger transferencia_resolucoes_auditar after insert on public.transferencia_resolucoes
  for each row execute function privado.auditar_mudanca();

alter table public.transferencia_resolucoes enable row level security;
revoke all on public.transferencia_resolucoes from anon, authenticated;
grant select on public.transferencia_resolucoes to authenticated;
-- Lê quem lê a transferência (a origem ou o destino, com estoque.consultar): a política da transferência decide.
create policy transferencia_resolucoes_ler on public.transferencia_resolucoes for select to authenticated
  using (transferencia_id in (select t.id from public.transferencias t));

-- Nada muda nem some depois de gravado (a função é o único caminho de escrita, e ela só insere).
create or replace function privado.resolucao_nao_muda()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'A resolução da divergência não muda depois de gravada' using errcode = '42501';
end;
$$;
revoke all on function privado.resolucao_nao_muda() from public, anon, authenticated;
create trigger transferencia_resolucoes_nao_muda before update or delete on public.transferencia_resolucoes
  for each row execute function privado.resolucao_nao_muda();

create or replace function public.transferencia_resolver_divergencia(
  p_transferencia uuid, p_decisao text, p_identificadores text[], p_quantidade int, p_motivo text, p_chave text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  unidade uuid := (select public.unidade_atual());
  t public.transferencias;
  tipo_origem text;
  serializada boolean;
  lidos text[] := coalesce((select array_agg(distinct regexp_replace(x, '[^0-9]', '', 'g') order by regexp_replace(x, '[^0-9]', '', 'g'))
                            from unnest(coalesce(p_identificadores, '{}')) as x
                            where regexp_replace(coalesce(x, ''), '[^0-9]', '', 'g') <> ''), '{}');
  motivo_limpo text := nullif(left(btrim(coalesce(p_motivo, '')), 500), '');
  chave_limpa text := nullif(left(btrim(coalesce(p_chave, '')), 200), '');
  conteudo_novo text;
  ja_gravado text;
  faltaram int;
  resolvidos int;
  pendentes int;
  agora_resolve int := 0;
  loja_da_entrada uuid;
  texto_do_livro text;
  item record;
  lido text;
begin
  if p_decisao is null or p_decisao not in ('chegou_depois', 'voltou_a_origem', 'baixada') then
    raise exception 'Diga o que houve com o que faltou: chegou depois, voltou à origem ou baixa' using errcode = '22023';
  end if;
  if motivo_limpo is null or length(motivo_limpo) < 10 then
    raise exception 'Explique o que houve (pelo menos 10 caracteres)' using errcode = '22023';
  end if;
  if chave_limpa is null then
    raise exception 'Falta a chave do pedido' using errcode = '22023';
  end if;
  t := privado.transferencia_travada(p_transferencia);
  select u.tipo into tipo_origem from public.unidades u where u.id = t.origem_id;
  if p_decisao = 'chegou_depois' then
    if unidade <> t.destino_id or not (select public.tem_permissao('estoque.transferir', t.destino_id)) then
      raise exception 'Só a loja de destino confirma o que chegou depois' using errcode = '42501';
    end if;
  elsif p_decisao = 'voltou_a_origem' then
    if unidade <> t.origem_id
       or not (select public.tem_permissao(case when tipo_origem = 'excecao' then 'estoque.ajustar' else 'estoque.transferir' end, t.origem_id)) then
      raise exception 'Só a loja de origem confirma o que voltou para ela' using errcode = '42501';
    end if;
  else
    if unidade <> t.origem_id or not (select public.tem_permissao('estoque.ajustar', t.origem_id)) then
      raise exception 'Só quem ajusta estoque na loja de origem dá baixa no que não apareceu' using errcode = '42501';
    end if;
  end if;
  if t.situacao <> 'recebida_com_divergencia' then
    raise exception 'Esta transferência não tem divergência a resolver (situação: %)', t.situacao using errcode = '22023';
  end if;

  serializada := exists (select 1 from public.transferencia_itens i where i.transferencia_id = t.id);
  conteudo_novo := p_decisao || '|' || case when serializada and p_decisao <> 'baixada' then array_to_string(lidos, ',')
                                            when p_decisao = 'baixada' then 'tudo'
                                            else coalesce(p_quantidade::text, '') end || '|' || motivo_limpo;
  -- O mesmo pedido de novo devolve o que já estava; a mesma chave com outro conteúdo é recusada.
  select r.conteudo into ja_gravado from public.transferencia_resolucoes r
  where r.transferencia_id = t.id and r.chave = chave_limpa limit 1;
  faltaram := t.quantidade - t.quantidade_recebida;
  select coalesce(sum(r.quantidade), 0) into resolvidos from public.transferencia_resolucoes r where r.transferencia_id = t.id;
  if ja_gravado is not null then
    if ja_gravado <> conteudo_novo then
      raise exception 'Este pedido já foi feito com outros dados' using errcode = 'OR004';
    end if;
    return jsonb_build_object('situacao', t.situacao, 'faltaram', faltaram, 'resolvidos', resolvidos,
      'pendentes', faltaram - resolvidos, 'repetida', true);
  end if;
  pendentes := faltaram - resolvidos;
  if pendentes <= 0 then
    raise exception 'Tudo o que faltou nesta transferência já foi resolvido' using errcode = 'OR004';
  end if;

  loja_da_entrada := case when p_decisao = 'chegou_depois' then t.destino_id else t.origem_id end;
  texto_do_livro := 'Transferência nº ' || t.numero || ', o que faltou: '
    || case p_decisao when 'chegou_depois' then 'chegou depois' when 'voltou_a_origem' then 'voltou à origem' else 'baixa' end
    || '. ' || motivo_limpo;
  perform set_config('ora.motivo', left(texto_do_livro, 500), true);

  if serializada then
    -- Os itens pendentes: os que não foram conferidos no recebimento e ainda não têm resolução. Travados na ordem.
    perform 1 from public.itens_serializados s
    where s.id in (select i.item_serializado_id from public.transferencia_itens i where i.transferencia_id = t.id and i.recebido is false)
    order by s.id for update;
    if p_decisao = 'baixada' then
      if cardinality(lidos) > 0 then
        raise exception 'A baixa vale para tudo o que ainda falta: não informe IMEI/ICCID' using errcode = '22023';
      end if;
    else
      if cardinality(lidos) = 0 then
        raise exception 'Informe o IMEI/ICCID lido em cada item' using errcode = '22023';
      end if;
      foreach lido in array lidos loop
        if not exists (
          select 1 from public.transferencia_itens i join public.itens_serializados s on s.id = i.item_serializado_id
          where i.transferencia_id = t.id and i.recebido is false and lido in (s.imei, s.imei2, s.iccid)
            and not exists (select 1 from public.transferencia_resolucoes r where r.transferencia_id = t.id and r.item_serializado_id = i.item_serializado_id)
        ) then
          raise exception 'O IMEI/ICCID % não é um item pendente desta transferência', lido using errcode = '22023';
        end if;
      end loop;
    end if;
    for item in
      select i.item_serializado_id as id
      from public.transferencia_itens i join public.itens_serializados s on s.id = i.item_serializado_id
      where i.transferencia_id = t.id and i.recebido is false
        and not exists (select 1 from public.transferencia_resolucoes r where r.transferencia_id = t.id and r.item_serializado_id = i.item_serializado_id)
        and (p_decisao = 'baixada' or s.imei = any (lidos) or s.imei2 = any (lidos) or s.iccid = any (lidos))
      order by i.item_serializado_id
    loop
      perform privado.lancar_movimento(loja_da_entrada, t.variante_id, 1, 'transferencia_entrada', item.id, texto_do_livro,
        'transferencia', t.id::text, 'transferencia:' || t.id || ':resolucao:entrada:' || item.id, usuario);
      if p_decisao = 'baixada' then
        perform privado.lancar_movimento(t.origem_id, t.variante_id, -1, 'perda', item.id, texto_do_livro,
          'transferencia', t.id::text, 'transferencia:' || t.id || ':resolucao:perda:' || item.id, usuario);
      end if;
      insert into public.transferencia_resolucoes (organizacao_id, transferencia_id, decisao, quantidade, item_serializado_id, motivo, chave, conteudo, criado_por)
      values (t.organizacao_id, t.id, p_decisao, 1, item.id, motivo_limpo, chave_limpa, conteudo_novo, usuario);
      agora_resolve := agora_resolve + 1;
    end loop;
  else
    if p_decisao = 'baixada' then
      if p_quantidade is not null and p_quantidade <> pendentes then
        raise exception 'A baixa vale para tudo o que ainda falta (%)', pendentes using errcode = '22023';
      end if;
      agora_resolve := pendentes;
    else
      if p_quantidade is null or p_quantidade not between 1 and pendentes then
        raise exception 'Informe a quantidade contada (de 1 a %)', pendentes using errcode = '22023';
      end if;
      agora_resolve := p_quantidade;
    end if;
    perform privado.lancar_movimento(loja_da_entrada, t.variante_id, agora_resolve, 'transferencia_entrada', null, texto_do_livro,
      'transferencia', t.id::text, 'transferencia:' || t.id || ':resolucao:entrada:' || chave_limpa, usuario);
    if p_decisao = 'baixada' then
      perform privado.lancar_movimento(t.origem_id, t.variante_id, -agora_resolve, 'perda', null, texto_do_livro,
        'transferencia', t.id::text, 'transferencia:' || t.id || ':resolucao:perda:' || chave_limpa, usuario);
    end if;
    insert into public.transferencia_resolucoes (organizacao_id, transferencia_id, decisao, quantidade, motivo, chave, conteudo, criado_por)
    values (t.organizacao_id, t.id, p_decisao, agora_resolve, motivo_limpo, chave_limpa, conteudo_novo, usuario);
  end if;

  resolvidos := resolvidos + agora_resolve;
  if resolvidos > faltaram then
    raise exception 'A resolução passaria do que faltou' using errcode = '23514';
  end if;
  update public.transferencias x
  set divergencia_resolvida_em = case when resolvidos = faltaram then now() else null end, atualizado_em = now()
  where x.id = t.id;
  return jsonb_build_object('situacao', t.situacao, 'faltaram', faltaram, 'resolvidos', resolvidos,
    'pendentes', faltaram - resolvidos, 'repetida', false);
end;
$$;
revoke all on function public.transferencia_resolver_divergencia(uuid, text, text[], int, text, text) from public, anon;
grant execute on function public.transferencia_resolver_divergencia(uuid, text, text[], int, text, text) to authenticated;

-- A tela de Transferências (VEL-g) passa a trazer quando a divergência ficou resolvida e cada resolução: a mesma função,
-- com o RLS de quem chama. O resto é igual à definição anterior (20261119184550_transferencias_numa_ida).
create or replace function public.transferencias_tela(p_limite int default 50)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with
  u as (select public.unidade_atual() as id),
  lista as (
    select t.id, t.numero, t.origem_id, t.destino_id, t.variante_id, t.quantidade, t.motivo, t.situacao, t.solicitado_por,
      t.quantidade_recebida, t.observacao, t.solicitado_em, t.remessa_id, t.divergencia_resolvida_em
    from public.transferencias t
    where t.origem_id = (select u.id from u) or t.destino_id = (select u.id from u)
    order by t.numero desc
    limit greatest(1, least(coalesce(p_limite, 50), 200))
  ),
  variantes_da_lista as (
    select v.id, v.nome, v.sku, p.tipo
    from public.variantes v
    left join public.produtos p on p.id = v.produto_id
    where v.id in (select l.variante_id from lista l)
  ),
  lojas as (
    select x.id from lista l cross join lateral (values (l.origem_id), (l.destino_id)) as x(id) group by x.id
  ),
  a_separar as (
    select distinct l.variante_id
    from lista l join variantes_da_lista v on v.id = l.variante_id
    where l.situacao = 'solicitada' and l.origem_id = (select u.id from u) and v.tipo in ('aparelho', 'chip')
  )
  select jsonb_build_object(
    'transferencias', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'numero', l.numero, 'origem_id', l.origem_id,
      'destino_id', l.destino_id, 'variante_id', l.variante_id, 'quantidade', l.quantidade, 'motivo', l.motivo, 'situacao', l.situacao,
      'solicitado_por', l.solicitado_por, 'quantidade_recebida', l.quantidade_recebida, 'observacao', l.observacao,
      'solicitado_em', l.solicitado_em, 'remessa_id', l.remessa_id, 'divergencia_resolvida_em', l.divergencia_resolvida_em)
      order by l.numero desc) from lista l), '[]'::jsonb),
    'variantes', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'nome', v.nome, 'sku', v.sku, 'tipo', v.tipo) order by v.id)
      from variantes_da_lista v), '[]'::jsonb),
    'unidades', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'tipo', x.tipo) order by x.id)
      from public.unidades x where x.id in (select lj.id from lojas lj)), '[]'::jsonb),
    'itens', coalesce((select jsonb_agg(jsonb_build_object('transferencia_id', i.transferencia_id, 'item_serializado_id', i.item_serializado_id,
      'recebido', i.recebido) order by i.transferencia_id, i.item_serializado_id)
      from public.transferencia_itens i where i.transferencia_id in (select l.id from lista l)), '[]'::jsonb),
    'resolucoes', coalesce((select jsonb_agg(jsonb_build_object('transferencia_id', r.transferencia_id, 'decisao', r.decisao,
      'quantidade', r.quantidade, 'item_serializado_id', r.item_serializado_id, 'motivo', r.motivo, 'criado_em', r.criado_em)
      order by r.criado_em, r.id)
      from public.transferencia_resolucoes r where r.transferencia_id in (select l.id from lista l)), '[]'::jsonb),
    'remessas', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'numero', r.numero, 'origem_id', r.origem_id) order by r.numero)
      from public.transferencia_remessas r where r.id in (select l.remessa_id from lista l)), '[]'::jsonb),
    'saldos', coalesce((select jsonb_agg(jsonb_build_object('unidade_id', s.unidade_id, 'variante_id', s.variante_id, 'quantidade', s.quantidade,
      'reservado', s.reservado) order by s.unidade_id, s.variante_id)
      from public.estoque_saldos s where s.unidade_id in (select lj.id from lojas lj) and s.variante_id in (select l.variante_id from lista l)), '[]'::jsonb),
    'disponiveis', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'variante_id', d.variante_id, 'imei', d.imei, 'iccid', d.iccid)
      order by d.variante_id, d.id) from (
        select i.id, i.variante_id, i.imei, i.iccid
        from public.itens_serializados i
        where i.unidade_id = (select u.id from u) and i.em_estoque and i.situacao = 'disponivel'
          and i.variante_id in (select a.variante_id from a_separar a)
        order by i.variante_id, i.id
        limit 100
      ) d), '[]'::jsonb)
  );
$$;
comment on function public.transferencias_tela(int) is
  'VEL-g e TRF-d: a tela de Transferências numa ida (a lista da loja do turno, os produtos, as lojas, os aparelhos separados, as resoluções do que faltou, as remessas, os saldos e os aparelhos livres a separar), com o RLS de quem chama.';
revoke all on function public.transferencias_tela(int) from public, anon;
grant execute on function public.transferencias_tela(int) to authenticated;
