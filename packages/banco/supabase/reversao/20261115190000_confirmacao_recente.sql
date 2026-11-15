-- Reversão de 20261115190000_confirmacao_recente (lote ORG-006b): as dez funções voltam às versões em vigor antes
-- (sem a confirmação recente), e as duas funções da conferência saem.

-- convidar_pessoa: de volta à versão de 20261109150526_correcoes_acesso_lote1.sql.
create or replace function public.convidar_pessoa(
  p_organizacao uuid, p_nome text, p_email text, p_papel text, p_unidades uuid[], p_motivo text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ator uuid := (select auth.uid());
  motivo text;
  endereco text := lower(trim(coalesce(p_email, '')));
  lojas uuid[] := coalesce((select array_agg(distinct x) from unnest(coalesce(p_unidades, '{}')) as x where x is not null), '{}');
  escopo text;
  pessoa uuid;
  novo uuid;
begin
  if ator is null or not (select privado.gere_organizacao(p_organizacao)) then
    raise exception 'Sem permissão para gerir a equipe desta organização' using errcode = '42501';
  end if;
  motivo := privado.exigir_motivo(p_motivo);
  if p_nome is null or length(trim(p_nome)) not between 2 and 120 then
    raise exception 'Informe o nome da pessoa' using errcode = '22023';
  end if;
  if endereco !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'E-mail inválido' using errcode = '22023';
  end if;
  select pa.escopo_padrao into escopo from public.papeis pa where pa.codigo = p_papel and pa.ativo;
  if escopo is null then
    raise exception 'Papel inexistente ou inativo' using errcode = '22023';
  end if;
  if privado.papel_de_direcao(p_papel) and not (select privado.dono_da_organizacao(p_organizacao)) then
    raise exception 'Só o dono convida para o papel %', p_papel using errcode = '42501';
  end if;
  if escopo = 'organizacao' and cardinality(lojas) > 0 then
    raise exception 'Este papel vale para a organização inteira, sem loja' using errcode = '22023';
  end if;
  if escopo = 'unidade' and (cardinality(lojas) = 0 or exists (
       select 1 from unnest(lojas) as x (id)
       where not exists (select 1 from public.unidades u where u.id = x.id and u.organizacao_id = p_organizacao and u.status = 'ativa'))) then
    raise exception 'Escolha ao menos uma loja ativa desta organização' using errcode = '22023';
  end if;
  if p_papel = 'tecnico' and exists (
       select 1 from unnest(lojas) as x (id) join public.unidades u on u.id = x.id where u.tipo <> 'assistencia') then
    raise exception 'Técnico só em unidade de assistência' using errcode = '22023';
  end if;
  if exists (select 1 from public.perfis_usuario p where p.id = ator and p.email = endereco)
     or exists (select 1 from auth.users a where a.id = ator and lower(a.email) = endereco) then
    raise exception 'Ninguém altera o próprio acesso' using errcode = '42501';
  end if;
  select p.id into pessoa from public.perfis_usuario p where p.email = endereco;
  if pessoa is not null and exists (
       select 1 from public.vinculos v where v.usuario_id = pessoa and v.organizacao_id = p_organizacao and v.fim is null) then
    raise exception 'Esta pessoa já está na equipe: dê mais um vínculo a ela' using errcode = 'OR006';
  end if;
  perform set_config('ora.motivo', motivo, true);
  begin
    insert into public.convites (organizacao_id, nome, email, papel, unidades, motivo, criado_por)
    values (p_organizacao, trim(p_nome), endereco, p_papel, lojas, motivo, ator)
    returning id into novo;
  exception when unique_violation then
    raise exception 'Já existe um convite em aberto para este e-mail' using errcode = '23505';
  end;
  return novo;
end;
$$;

-- vincular_pessoa: de volta à versão de 20261108202654_acesso_sessao_e_equipe.sql.
create or replace function public.vincular_pessoa(p_usuario uuid, p_organizacao uuid, p_papel text, p_unidade uuid, p_motivo text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ator uuid := (select auth.uid());
  motivo text;
  escopo text;
  existente uuid;
  novo uuid;
begin
  if ator is null or not (select privado.gere_organizacao(p_organizacao)) then
    raise exception 'Sem permissão para gerir a equipe desta organização' using errcode = '42501';
  end if;
  motivo := privado.exigir_motivo(p_motivo);
  if p_usuario = ator then
    raise exception 'Ninguém altera o próprio acesso' using errcode = '42501';
  end if;
  select pa.escopo_padrao into escopo from public.papeis pa where pa.codigo = p_papel and pa.ativo;
  if escopo is null then
    raise exception 'Papel inexistente ou inativo' using errcode = '22023';
  end if;
  if privado.papel_de_direcao(p_papel) and not (select privado.dono_da_organizacao(p_organizacao)) then
    raise exception 'Só o dono concede o papel %', p_papel using errcode = '42501';
  end if;
  if escopo = 'organizacao' and p_unidade is not null then
    raise exception 'Este papel vale para a organização inteira, sem loja' using errcode = '22023';
  end if;
  if escopo = 'unidade' and not exists (
       select 1 from public.unidades u where u.id = p_unidade and u.organizacao_id = p_organizacao and u.status = 'ativa') then
    raise exception 'Escolha uma loja ativa desta organização' using errcode = '22023';
  end if;
  if not exists (select 1 from public.vinculos v where v.usuario_id = p_usuario and v.organizacao_id = p_organizacao) then
    raise exception 'Pessoa não encontrada nesta equipe: convide antes' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.perfis_usuario p where p.id = p_usuario and p.status = 'ativo') then
    raise exception 'Pessoa bloqueada: desbloqueie antes' using errcode = '22023';
  end if;
  select v.id into existente from public.vinculos v
  where v.usuario_id = p_usuario and v.organizacao_id = p_organizacao and v.papel = p_papel
    and v.unidade_id is not distinct from p_unidade and v.fim is null;
  if found then
    return existente;
  end if;
  begin
    insert into public.vinculos (usuario_id, organizacao_id, papel, escopo, unidade_id, criado_por, motivo)
    values (p_usuario, p_organizacao, p_papel, escopo, p_unidade, ator, motivo)
    returning id into novo;
  exception when unique_violation then
    select v.id into novo from public.vinculos v
    where v.usuario_id = p_usuario and v.organizacao_id = p_organizacao and v.papel = p_papel
      and v.unidade_id is not distinct from p_unidade and v.fim is null;
  end;
  return novo;
end;
$$;

-- encerrar_vinculo: de volta à versão de 20261109150526_correcoes_acesso_lote1.sql.
create or replace function public.encerrar_vinculo(p_vinculo uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ator uuid := (select auth.uid());
  motivo text;
  v public.vinculos;
begin
  select * into v from public.vinculos x where x.id = p_vinculo for update;
  if not found or ator is null or not (select privado.gere_organizacao(v.organizacao_id)) then
    raise exception 'Vínculo não encontrado' using errcode = 'P0002';
  end if;
  motivo := privado.exigir_motivo(p_motivo);
  if v.usuario_id = ator then
    raise exception 'Ninguém altera o próprio acesso' using errcode = '42501';
  end if;
  if privado.papel_de_direcao(v.papel) and not (select privado.dono_da_organizacao(v.organizacao_id)) then
    raise exception 'Só o dono retira o papel %', v.papel using errcode = '42501';
  end if;
  if v.fim is not null and v.fim <= now() then
    return false;
  end if;
  -- Último dono ativo (REV-028, #29): trava por organização e conferência depois da espera.
  if v.papel = 'dono' then
    perform pg_advisory_xact_lock(privado.trava_da_chave('equipe_donos', v.organizacao_id, 'donos'));
  end if;
  if v.papel = 'dono' and not exists (
       select 1 from public.vinculos o join public.perfis_usuario p on p.id = o.usuario_id and p.status = 'ativo'
       where o.organizacao_id = v.organizacao_id and o.papel = 'dono' and o.id <> v.id
         and o.inicio <= now() and (o.fim is null or o.fim > now())) then
    raise exception 'A organização precisa continuar com pelo menos um dono' using errcode = '23514';
  end if;
  perform set_config('ora.motivo', motivo, true);
  update public.vinculos set fim = now() where id = v.id;
  return true;
end;
$$;

-- alterar_situacao_pessoa: de volta à versão de 20261109150526_correcoes_acesso_lote1.sql.
create or replace function public.alterar_situacao_pessoa(p_usuario uuid, p_situacao text, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ator uuid := (select auth.uid());
  motivo text;
  atual text;
  organizacao uuid;
begin
  if ator is null or p_usuario not in (select privado.perfis_que_gero()) then
    raise exception 'Pessoa não encontrada' using errcode = 'P0002';
  end if;
  if p_situacao is null or p_situacao not in ('ativo', 'bloqueado') then
    raise exception 'Situação inválida' using errcode = '22023';
  end if;
  motivo := privado.exigir_motivo(p_motivo);
  if p_usuario = ator then
    raise exception 'Ninguém altera o próprio acesso' using errcode = '42501';
  end if;
  if exists (
       select 1 from public.vinculos v
       where v.usuario_id = p_usuario and privado.papel_de_direcao(v.papel) and v.fim is null
         and not (select privado.dono_da_organizacao(v.organizacao_id))) then
    raise exception 'Só o dono bloqueia ou desbloqueia dono e administrador' using errcode = '42501';
  end if;
  -- O perfil vale para todas as organizações (REV-026, #27): bloquear ou desbloquear exige gerir
  -- TODAS as organizações em que a pessoa tem vínculo vigente; senão, encerre o vínculo na sua equipe.
  if exists (
       select 1 from public.vinculos v
       where v.usuario_id = p_usuario and v.inicio <= now() and (v.fim is null or v.fim > now())
         and not (select privado.gere_organizacao(v.organizacao_id))) then
    raise exception 'Esta pessoa também tem acesso em outra organização: encerre o vínculo dela na sua equipe' using errcode = '42501';
  end if;
  -- Último dono ativo (REV-028, #29): uma trava por organização, em ordem, e a conferência depois dela.
  if p_situacao = 'bloqueado' then
    for organizacao in
      select distinct v.organizacao_id from public.vinculos v
      where v.usuario_id = p_usuario and v.papel = 'dono' and v.inicio <= now() and (v.fim is null or v.fim > now())
      order by 1
    loop
      perform pg_advisory_xact_lock(privado.trava_da_chave('equipe_donos', organizacao, 'donos'));
      if not exists (
           select 1 from public.vinculos o join public.perfis_usuario p on p.id = o.usuario_id and p.status = 'ativo'
           where o.organizacao_id = organizacao and o.papel = 'dono' and o.usuario_id <> p_usuario
             and o.inicio <= now() and (o.fim is null or o.fim > now())) then
        raise exception 'A organização precisa continuar com pelo menos um dono ativo' using errcode = '23514';
      end if;
    end loop;
  end if;
  select p.status into atual from public.perfis_usuario p where p.id = p_usuario for update;
  if atual = p_situacao then
    return false;
  end if;
  perform set_config('ora.motivo', motivo, true);
  update public.perfis_usuario set status = p_situacao where id = p_usuario;
  if p_situacao = 'bloqueado' then
    delete from public.contexto_sessao where usuario_id = p_usuario;
  end if;
  return true;
end;
$$;

-- cancelar_convite: de volta à versão de 20261108202654_acesso_sessao_e_equipe.sql.
create or replace function public.cancelar_convite(p_convite uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.convites;
  motivo text;
begin
  select * into c from public.convites x where x.id = p_convite for update;
  if not found or not (select privado.gere_organizacao(c.organizacao_id)) then
    raise exception 'Convite não encontrado' using errcode = 'P0002';
  end if;
  motivo := privado.exigir_motivo(p_motivo);
  if privado.papel_de_direcao(c.papel) and not (select privado.dono_da_organizacao(c.organizacao_id)) then
    raise exception 'Só o dono cancela convite de %', c.papel using errcode = '42501';
  end if;
  if c.situacao not in ('pendente', 'erro') then
    return false;
  end if;
  perform set_config('ora.motivo', motivo, true);
  update public.convites set situacao = 'cancelado', atualizado_em = now() where id = c.id;
  return true;
end;
$$;

-- repetir_convite: de volta à versão de 20261108202654_acesso_sessao_e_equipe.sql.
create or replace function public.repetir_convite(p_convite uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.convites;
begin
  select * into c from public.convites x where x.id = p_convite for update;
  if not found or not (select privado.gere_organizacao(c.organizacao_id)) then
    raise exception 'Convite não encontrado' using errcode = 'P0002';
  end if;
  if c.situacao <> 'erro' then
    return false;
  end if;
  perform set_config('ora.motivo', 'Convite enviado de novo depois de erro', true);
  update public.convites set situacao = 'pendente', erro = null, atualizado_em = now() where id = c.id;
  return true;
end;
$$;

-- decidir_aprovacao: de volta à versão de 20261109190240_integridade_vendas_lote2.sql.
create or replace function public.decidir_aprovacao(p_aprovacao uuid, p_aprovar boolean, p_observacao text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  pedido public.aprovacoes_desconto;
  item public.venda_itens;
begin
  select * into pedido from public.aprovacoes_desconto a where a.id = p_aprovacao;
  if not found or not (select public.tem_permissao('desconto.aprovar', pedido.unidade_id)) then
    raise exception 'Pedido de aprovação não encontrado' using errcode = 'P0002';
  end if;
  -- Ordem das travas (REV-051, #53): venda → aprovação, a mesma de editar, remover, pedir,
  -- concluir e cancelar. Antes a aprovação era travada primeiro e o desconto simultâneo dava 40P01.
  perform 1 from public.vendas v where v.id = pedido.venda_id for update;
  select * into pedido from public.aprovacoes_desconto a where a.id = p_aprovacao for update;
  if pedido.solicitado_por = usuario then
    raise exception 'Ninguém aprova o próprio desconto' using errcode = '42501';
  end if;
  if p_aprovar is null then
    raise exception 'Diga se aprova ou nega' using errcode = '22023';
  end if;
  if pedido.situacao <> 'pendente' then
    return false;
  end if;
  select * into item from public.venda_itens i where i.id = pedido.item_id;
  if pedido.expira_em <= now() or not found or privado.conteudo_do_item(item) <> pedido.conteudo then
    update public.aprovacoes_desconto a set situacao = 'invalidada' where a.id = pedido.id;
    perform privado.atualizar_espera_de_aprovacao(pedido.venda_id);
    return false;
  end if;
  update public.aprovacoes_desconto a
  set situacao = case when p_aprovar then 'aprovada' else 'negada' end, decidido_por = usuario, decidido_em = now(),
      observacao = nullif(trim(coalesce(p_observacao, '')), '')
  where a.id = pedido.id;
  perform privado.atualizar_espera_de_aprovacao(pedido.venda_id);
  return true;
end;
$$;

-- notas_decidir: de volta à versão de 20261109123757_fila_fiscal.sql.
create or replace function public.notas_decidir(p_pedido uuid, p_aprovar boolean, p_observacao text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  pedido public.notas_pedidos := privado.nota_para_aprovar(p_pedido);
  texto_observacao text := nullif(trim(coalesce(p_observacao, '')), '');
begin
  if p_aprovar is null then
    raise exception 'Diga se aprova ou pede correção' using errcode = '22023';
  end if;
  if pedido.situacao <> 'aguardando_aprovacao' then
    raise exception 'Este pedido não está aguardando aprovação (%)', pedido.situacao using errcode = '22023';
  end if;
  if not p_aprovar and (texto_observacao is null or length(texto_observacao) < 3) then
    raise exception 'Diga o que corrigir' using errcode = '22023';
  end if;
  update public.notas_pedidos p
  set situacao = case when p_aprovar then 'aprovada' else 'correcao_solicitada' end,
      aprovado_por = case when p_aprovar then (select auth.uid()) end,
      aprovado_em = case when p_aprovar then now() end,
      observacao = coalesce(texto_observacao, p.observacao), atualizado_em = now()
  where p.id = pedido.id;
  perform privado.nota_evento(pedido, case when p_aprovar then 'aprovada' else 'correcao_solicitada' end, texto_observacao);
  return case when p_aprovar then 'aprovada' else 'correcao_solicitada' end;
end;
$$;

-- conferir_caixa: de volta à versão de 20261108233546_vendas_pagamentos_e_caixa.sql.
create or replace function public.conferir_caixa(p_caixa uuid, p_observacao text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  caixa public.caixas;
begin
  select * into caixa from public.caixas c where c.id = p_caixa for update;
  if not found or not (select public.tem_permissao('caixa.conferir', caixa.unidade_id)) then
    raise exception 'Caixa não encontrado' using errcode = 'P0002';
  end if;
  if caixa.operador_id = usuario then
    raise exception 'Ninguém confere o próprio caixa' using errcode = '42501';
  end if;
  if caixa.situacao <> 'fechado' then
    return false;
  end if;
  update public.caixas c
  set situacao = 'conferido', conferido_por = usuario, conferido_em = now(), observacao_conferencia = nullif(trim(coalesce(p_observacao, '')), '')
  where c.id = caixa.id;
  return true;
end;
$$;

-- caixa_decidir_saida: de volta à versão de 20261114012802_caixa_saida_autorizada.sql.
create or replace function public.caixa_decidir_saida(p_saida uuid, p_autorizar boolean, p_motivo text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := nullif(regexp_replace(trim(coalesce(p_motivo, '')), '\s+', ' ', 'g'), '');
  v_s public.caixa_saidas;
  v_caixa public.caixas;
  v_movimento bigint;
begin
  select * into v_s from public.caixa_saidas s where s.id = p_saida for update;
  if v_s.id is null or not public.tem_permissao('caixa.conferir', v_s.unidade_id) then
    raise exception 'Pedido de saída não encontrado para você' using errcode = 'P0002';
  end if;
  if v_s.pedida_por = (select auth.uid()) then
    raise exception 'Quem pediu a saída não autoriza a própria saída' using errcode = '42501';
  end if;
  if p_autorizar is null then
    raise exception 'Diga se autoriza ou nega' using errcode = '22023';
  end if;
  if v_motivo is not null and length(v_motivo) not between 3 and 200 then
    raise exception 'O motivo tem de 3 a 200 letras' using errcode = '22023';
  end if;
  if v_s.situacao <> 'pendente' then
    -- Repetir a mesma decisão não muda nada; outra decisão sobre pedido já decidido é recusada.
    if (p_autorizar and v_s.situacao = 'autorizada') or (not p_autorizar and v_s.situacao = 'negada') then
      return v_s.situacao;
    end if;
    raise exception 'Pedido de saída já decidido' using errcode = '22023';
  end if;

  if not p_autorizar then
    if v_motivo is null then
      raise exception 'Diga o motivo de negar a saída' using errcode = '22023';
    end if;
    perform set_config('ora.motivo', 'Saída do caixa negada: ' || v_motivo, true);
    update public.caixa_saidas s set situacao = 'negada', decidida_por = (select auth.uid()), decidida_em = now(), motivo_decisao = v_motivo
    where s.id = v_s.id;
    return 'negada';
  end if;

  -- A mesma trava do fechamento: ou a saída entra antes e o fechamento a desconta, ou o caixa já fechou.
  select * into v_caixa from public.caixas c where c.id = v_s.caixa_id for update;
  if v_caixa.situacao <> 'aberto' then
    raise exception 'O caixa já foi fechado: negue o pedido ou peça de novo num caixa aberto' using errcode = '22023';
  end if;
  if privado.dinheiro_no_caixa(v_caixa.id) < v_s.valor_centavos then
    raise exception 'A saída passa do dinheiro que há no caixa' using errcode = '23514';
  end if;
  perform set_config('ora.motivo', 'Saída do caixa autorizada: ' || v_s.motivo, true);
  insert into public.caixa_movimentos (organizacao_id, caixa_id, tipo, meio, valor_centavos, motivo, usuario_id, chave_idempotencia)
  values (v_s.organizacao_id, v_caixa.id, 'saida_autorizada', 'dinheiro', -v_s.valor_centavos, 'Saída autorizada: ' || v_s.motivo, (select auth.uid()), 'saida:' || v_s.id)
  returning id into v_movimento;
  update public.caixa_saidas s set situacao = 'autorizada', decidida_por = (select auth.uid()), decidida_em = now(), motivo_decisao = v_motivo, movimento_id = v_movimento
  where s.id = v_s.id;
  return 'autorizada';
end;
$$;

drop function privado.exigir_autenticacao_recente();
drop function privado.autenticacao_recente();
