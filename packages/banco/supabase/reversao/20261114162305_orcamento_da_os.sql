-- Reversão de 20261114162305_orcamento_da_os (só em banco sem dados reais: apaga os orçamentos; com evento de orçamento,
-- resposta ou conserto na trilha, a restrição antiga dos eventos não volta e a reversão para, de propósito).
-- public.os_contato_whatsapp volta ao texto do L12a (20261114162103_ordem_de_servico).
create or replace function public.os_contato_whatsapp(p_os uuid, p_aviso text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade uuid := (select public.unidade_atual());
  os public.ordens_servico;
  v_telefone text;
begin
  if p_aviso is null or p_aviso not in ('comprovante', 'na_loja') then
    raise exception 'Aviso desconhecido' using errcode = '22023';
  end if;
  select * into os from public.ordens_servico o where o.id = p_os;
  if os.id is null or os.unidade_id is distinct from v_unidade or not (select public.tem_permissao('os.abrir', v_unidade)) then
    raise exception 'Ordem de serviço não encontrada' using errcode = 'P0002';
  end if;
  if os.situacao <> 'aberta' then
    raise exception 'A ordem de serviço já foi encerrada' using errcode = '22023';
  end if;
  if p_aviso = 'na_loja' and (os.local <> 'loja' or not exists (select 1 from public.os_eventos e where e.os_id = os.id and e.tipo = 'recebida_na_loja')) then
    raise exception 'O aviso de chegada é depois que o aparelho volta do técnico para a loja' using errcode = '22023';
  end if;
  select d.telefone into v_telefone from privado.cliente_dados d where d.cliente_id = os.cliente_id;
  if v_telefone is null then
    raise exception 'O cliente não tem WhatsApp no cadastro: complete o cadastro' using errcode = '22023';
  end if;
  perform privado.os_evento(os, 'aviso_whatsapp', null, null, case p_aviso when 'comprovante' then 'Comprovante' else 'Aparelho de volta na loja' end, false, v_unidade);
  insert into public.auditoria (usuario_id, unidade_id, organizacao_id, acao, alvo_tipo, alvo_id, depois, origem)
  values ((select auth.uid()), v_unidade, os.organizacao_id, 'os.contato_whatsapp', 'ordem_servico', os.id::text,
          jsonb_build_object('aviso', p_aviso), 'aplicacao');
  return v_telefone;
end;
$$;

drop function if exists public.os_concluir_servico(uuid, text);
drop function if exists public.os_responder_orcamento(uuid, text, text, text);
drop function if exists public.os_orcar(uuid, jsonb, text);
drop table if exists public.os_orcamentos;
drop function if exists privado.os_orcamento_so_resposta();
alter table public.os_eventos drop constraint os_eventos_tipo_check;
alter table public.os_eventos add constraint os_eventos_tipo_check
  check (tipo in ('aberta', 'enviada_ao_tecnico', 'recebida_pelo_tecnico', 'devolvida_pelo_tecnico', 'recebida_na_loja',
                  'devolvida_ao_cliente', 'cancelada', 'foto', 'aviso_whatsapp'));
alter table public.ordens_servico drop column if exists servico;
