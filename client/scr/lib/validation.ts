export function validateIBAN(iban: string): { valid: boolean; error?: string } {
  const trimmed = iban.replace(/\s/g, '').toUpperCase();
  
  if (trimmed.length < 15 || trimmed.length > 34) {
    return {
      valid: false,
      error: 'IBAN повинен містити від 15 до 34 символів'
    };
  }
  
  const countryCode = trimmed.slice(0, 2);
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    return {
      valid: false,
      error: 'IBAN повинен починатися з 2-літерного коду країни (наприклад, UA, PL, DE)'
    };
  }
  
  const checkDigits = trimmed.slice(2, 4);
  if (!/^\d{2}$/.test(checkDigits)) {
    return {
      valid: false,
      error: 'Після коду країни повинні бути 2 контрольні цифри'
    };
  }
  
  const accountPart = trimmed.slice(4);
  if (!/^[A-Z0-9]+$/.test(accountPart)) {
    return {
      valid: false,
      error: 'IBAN може містити тільки літери та цифри'
    };
  }
  
  return { valid: true };
}

export function validateUkrainianIBAN(iban: string): { valid: boolean; error?: string } {
  return validateIBAN(iban);
}

export function formatIBAN(iban: string): string {
  const cleaned = iban.replace(/\s/g, '').toUpperCase();
  return cleaned.match(/.{1,4}/g)?.join(' ') || cleaned;
}

export function maskIBAN(iban: string): string {
  if (iban.length < 8) return iban;
  const visible = iban.slice(0, 4) + '...' + iban.slice(-4);
  return visible;
}

export function validateTaxId(taxId: string): { valid: boolean; error?: string } {
  const trimmed = taxId.replace(/\s/g, '');
  
  if (trimmed.length !== 10) {
    return {
      valid: false,
      error: 'РНОКПП повинен містити рівно 10 цифр'
    };
  }
  
  if (!/^\d{10}$/.test(trimmed)) {
    return {
      valid: false,
      error: 'РНОКПП повинен містити тільки цифри'
    };
  }
  
  return { valid: true };
}
