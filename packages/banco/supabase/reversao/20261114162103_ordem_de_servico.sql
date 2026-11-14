-- Reversão de 20261114162103_ordem_de_servico (só em banco sem dados reais: apaga as ordens de serviço, os eventos e
-- as fotos registradas; os arquivos do bucket "os" precisam ser apagados pelo painel do Storage antes).
-- public.loja_definir_situacao volta ao texto do L2 (20261111132503_lojas_cadastro_e_configuracao).
create or replace function public.loja_definir_situacao(p_unidade uuid, p_situacao text, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_loja public.unidades;
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_pendencias text[] := '{}';
begin
  if p_situacao is null or p_situacao not in ('ativa', 'inativa') then
    raise exception 'Situação inválida' using errcode = '22023';
  end if;
  select * into v_loja from public.unidades u where u.id = p_unidade for update;
  if not found or not privado.gere_lojas_da_organizacao(v_loja.organizacao_id) then
    raise exception 'Loja não encontrada para você' using errcode = 'P0002';
  end if;
  if v_loja.status = p_situacao then
    return false;
  end if;
  if p_situacao = 'inativa' then
    if exists (select 1 from public.caixas c where c.unidade_id = v_loja.id and c.situacao = 'aberto') then
      v_pendencias := v_pendencias || 'caixa aberto'::text;
    end if;
    if exists (select 1 from public.caixas c where c.unidade_id = v_loja.id and c.situacao = 'fechado') then
      v_pendencias := v_pendencias || 'caixa fechado sem conferência'::text;
    end if;
    if exists (select 1 from public.estoque_saldos s where s.unidade_id = v_loja.id and s.quantidade > 0) then
      v_pendencias := v_pendencias || 'saldo em estoque'::text;
    end if;
    if exists (select 1 from public.itens_serializados i
               where i.unidade_id = v_loja.id and i.situacao in ('disponivel', 'reservado', 'em_transito', 'em_assistencia')) then
      v_pendencias := v_pendencias || 'aparelho ou chip na loja'::text;
    end if;
    if exists (select 1 from public.estoque_reservas r where r.unidade_id = v_loja.id and r.situacao = 'ativa') then
      v_pendencias := v_pendencias || 'reserva ativa'::text;
    end if;
    if exists (select 1 from public.transferencias t
               where (t.origem_id = v_loja.id or t.destino_id = v_loja.id) and t.situacao in ('solicitada', 'separada', 'enviada')) then
      v_pendencias := v_pendencias || 'transferência pendente'::text;
    end if;
    if exists (select 1 from public.vendas v where v.unidade_id = v_loja.id and v.situacao in ('rascunho', 'aguardando_aprovacao')) then
      v_pendencias := v_pendencias || 'venda em aberto'::text;
    end if;
    if exists (select 1 from public.notas_pedidos n
               where n.unidade_id = v_loja.id and n.situacao in ('aguardando_aprovacao', 'correcao_solicitada', 'aprovada')) then
      v_pendencias := v_pendencias || 'nota fiscal pendente'::text;
    end if;
    if cardinality(v_pendencias) > 0 then
      raise exception 'A loja ainda tem %: resolva antes de inativar', array_to_string(v_pendencias, ', ') using errcode = 'OR019';
    end if;
  end if;
  perform set_config('ora.motivo', v_motivo, true);
  update public.unidades u set status = p_situacao where u.id = v_loja.id;
  return true;
end;
$$;

drop function if exists public.os_assistencias();
drop function if exists public.os_contato_whatsapp(uuid, text);
drop function if exists public.os_anexar_foto(uuid, text, text);
drop function if exists public.os_custodia(uuid, text, uuid, text);
drop function if exists public.os_abrir(jsonb, text);
drop function if exists privado.os_evento(public.ordens_servico, text, text, text, text, boolean, uuid);
drop policy if exists os_fotos_ler on storage.objects;
drop policy if exists os_fotos_enviar on storage.objects;
drop table if exists public.os_fotos;
drop table if exists public.os_eventos;
drop table if exists public.ordens_servico;
delete from storage.buckets where id = 'os' and not exists (select 1 from storage.objects o where o.bucket_id = 'os');
do $$
begin
  perform set_config('ora.motivo', 'Reversão da ordem de serviço (L12a)', true);
  delete from public.papel_permissoes where permissao = 'os.gerir';
  delete from public.permissoes where codigo = 'os.gerir';
end;
$$;
