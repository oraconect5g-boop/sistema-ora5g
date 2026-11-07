// IMEI (15 dígitos) e ICCID (19–20 dígitos) com dígito verificador (Luhn).
// Sem leitor de código, a digitação manual erra: a validação é obrigatória (lacuna L-04).

function luhnValido(digitos: string): boolean {
  let soma = 0;
  for (let i = 0; i < digitos.length; i++) {
    let d = Number(digitos[digitos.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    soma += d;
  }
  return soma % 10 === 0;
}

const soDigitos = (texto: string) => texto.replace(/[\s.-]/g, "");

export function imeiValido(texto: string): boolean {
  const imei = soDigitos(texto);
  return /^\d{15}$/.test(imei) && !/^(\d)\1{14}$/.test(imei) && luhnValido(imei);
}

export function iccidValido(texto: string): boolean {
  const iccid = soDigitos(texto);
  return /^89\d{17,18}$/.test(iccid) && luhnValido(iccid);
}

// Mostra só o final, como nas telas de referência ("IMEI final 4702").
export function mascararIdentificador(texto: string, visiveis = 4): string {
  const limpo = soDigitos(texto);
  return `•••• ${limpo.slice(-visiveis)}`;
}

// Calcula o dígito verificador; útil para gerar IMEIs FICTÍCIOS válidos em testes e demonstração.
export function completarComDigitoVerificador(baseSemDigito: string): string {
  for (let d = 0; d <= 9; d++) {
    if (luhnValido(baseSemDigito + d)) return baseSemDigito + d;
  }
  throw new Error("Base inválida");
}
