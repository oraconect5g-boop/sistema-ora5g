-- Reversão de 20261117220000_alertas_das_filas (lote QUAL-a): tira a tarefa do agendador, volta o envio dos avisos e a
-- execução das rotinas às versões anteriores (PWA-b e ROT-a), tira a rotina dos alertas, os alertas da fila, o limite das
-- filas e as funções novas, e volta as regras da fila dos avisos.
select cron.unschedule('ora5g-alertas-das-filas');
create or replace function public.avisos_a_enviar(p_segredo text, p_limite int default 20)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a privado.avisos;
  ainda_espera boolean;
  inscricoes jsonb;
  lote jsonb := '[]'::jsonb;
begin
  if not privado.segredo_confere('avisos_no_celular', p_segredo) then
    raise exception 'Segredo dos avisos não confere' using errcode = '42501';
  end if;
  for a in
    with escolhidos as (
      select x.id from privado.avisos x
      where (x.situacao = 'pendente' or (x.situacao = 'enviando' and x.reservado_ate < now()))
        and x.tentativas < 5 and x.criado_em > now() - interval '1 day'
      order by x.criado_em, x.id
      limit least(greatest(coalesce(p_limite, 20), 1), 100)
      for update skip locked
    )
    update privado.avisos x set situacao = 'enviando', reservado_ate = now() + interval '2 minutes', tentativas = x.tentativas + 1
    from escolhidos e where x.id = e.id
    returning x.*
  loop
    -- O pedido já decidido não vira aviso.
    ainda_espera := case a.tipo
      when 'desconto' then exists (select 1 from public.aprovacoes_desconto d where d.id = a.alvo_id and d.situacao = 'pendente')
      when 'nota' then exists (select 1 from public.notas_pedidos n where n.id = a.alvo_id and n.situacao = 'aguardando_aprovacao')
      when 'saida_caixa' then exists (select 1 from public.caixa_saidas s where s.id = a.alvo_id and s.situacao = 'pendente')
      else true end;
    if not ainda_espera then
      update privado.avisos x set situacao = 'dispensado', reservado_ate = null where x.id = a.id;
      continue;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'endpoint', i.endpoint, 'p256dh', i.p256dh, 'auth', i.auth) order by i.criada_em), '[]'::jsonb)
    into inscricoes
    from privado.avisos_inscricoes i
    where (a.tipo = 'teste' and i.usuario_id = a.solicitante_id)
       or (a.tipo <> 'teste' and i.usuario_id <> a.solicitante_id
           and i.usuario_id in (select privado.quem_recebe_aviso(a.unidade_id, a.permissao)));
    if jsonb_array_length(inscricoes) = 0 then
      update privado.avisos x set situacao = 'sem_destino', reservado_ate = null where x.id = a.id;
      continue;
    end if;
    lote := lote || jsonb_build_object('id', a.id, 'tipo', a.tipo, 'titulo', a.titulo, 'corpo', a.corpo, 'endereco', a.endereco,
      'inscricoes', inscricoes);
  end loop;
  return lote;
end;
$$;
create or replace function privado.rodar_rotina(p_rotina text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_inicio timestamptz := clock_timestamp();
  v_quantidade int;
  v_erro text;
begin
  if p_rotina is null or not exists (select 1 from privado.rotinas r where r.nome = p_rotina) then
    raise exception 'Rotina desconhecida' using errcode = '22023';
  end if;
  -- Uma rodada por vez de cada rotina; a que chega enquanto outra roda fica registrada como pulada.
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('ora5g.rotina.' || p_rotina, 0)) then
    insert into privado.rotinas_execucoes (rotina, iniciada_em, terminada_em, situacao)
    values (p_rotina, v_inicio, clock_timestamp(), 'pulada');
    return 'pulada';
  end if;
  begin
    case p_rotina
      when 'reservas_vencidas' then v_quantidade := privado.expirar_reservas();
      when 'limpeza_dos_registros' then v_quantidade := privado.limpar_registros_das_rotinas();
      else raise exception 'Rotina sem execução' using errcode = '22023';
    end case;
  exception when others or query_canceled then
    -- O que a rotina fez nesta rodada é desfeito; fica o registro da falha, só com o código. O tempo esgotado
    -- (query_canceled, que o "others" não pega) também fica registrado.
    get stacked diagnostics v_erro = returned_sqlstate;
    v_quantidade := null;
  end;
  insert into privado.rotinas_execucoes (rotina, iniciada_em, terminada_em, situacao, quantidade, erro)
  values (p_rotina, v_inicio, clock_timestamp(), case when v_erro is null then 'ok' else 'falha' end, v_quantidade, v_erro);
  return case when v_erro is null then 'ok' else 'falha' end;
end;
$$;
revoke all on function privado.rodar_rotina(text) from public, anon, authenticated;
delete from privado.rotinas_execucoes where rotina = 'alertas_das_filas';
delete from privado.rotinas where nome = 'alertas_das_filas';
drop function privado.alertas_das_filas();
drop function privado.quem_recebe_aviso_da_rede(uuid, text);
drop table privado.limites_dos_alertas;
delete from privado.avisos where tipo = 'alerta';
alter table privado.avisos drop constraint aviso_de_cada_tipo;
alter table privado.avisos add constraint aviso_teste_sem_loja check ((tipo = 'teste') = (unidade_id is null) and (tipo = 'teste') = (permissao is null));
alter table privado.avisos drop constraint avisos_permissao_check;
alter table privado.avisos add constraint avisos_permissao_check check (permissao is null or permissao in ('desconto.aprovar', 'nota.aprovar', 'caixa.conferir'));
alter table privado.avisos drop constraint avisos_tipo_check;
alter table privado.avisos add constraint avisos_tipo_check check (tipo in ('desconto', 'nota', 'saida_caixa', 'teste'));
alter table privado.avisos alter column solicitante_id set not null;
