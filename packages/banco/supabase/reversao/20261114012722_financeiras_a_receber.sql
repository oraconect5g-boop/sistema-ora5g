-- Reversão de 20261114012722_financeiras_a_receber. ATENÇÃO: apaga os registros de repasse (referência,
-- valor e data). Contas "recebidas" voltam a "abertas" antes de as colunas saírem, para a regra antiga valer.
drop function if exists public.financeiras_a_receber();
drop function if exists public.financeira_desfazer_recebimento(uuid, text);
drop function if exists public.financeira_receber(uuid, text, bigint, date);
do $$
begin
  perform set_config('ora.motivo', 'Reversão dos recebimentos das financeiras', true);
  alter table public.contas_a_receber drop constraint if exists recebimento_completo;
  alter table public.contas_a_receber drop constraint if exists recebido_ate_o_valor;
  update public.contas_a_receber set situacao = 'aberta', atualizado_em = now() where situacao = 'recebida';
end;
$$;
drop index if exists public.contas_a_receber_registrado_por;
alter table public.contas_a_receber drop column if exists registrado_por;
alter table public.contas_a_receber drop column if exists referencia_recebimento;
alter table public.contas_a_receber drop column if exists valor_recebido_centavos;
alter table public.contas_a_receber drop column if exists recebido_em;
