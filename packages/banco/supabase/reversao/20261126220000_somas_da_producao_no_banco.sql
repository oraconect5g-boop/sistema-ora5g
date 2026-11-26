-- Reversão de 20261126220000_somas_da_producao_no_banco (lote AUD-f, parte C): sai a soma da produção no banco (as telas
-- voltam a somar as operações que leem).
drop function public.connect_somas_por(timestamptz, timestamptz, uuid, uuid);
