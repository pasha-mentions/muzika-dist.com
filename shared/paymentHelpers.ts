export type ProductType = "SINGLE" | "ALBUM" | "VIDEO";
export type CountryGroup = "UA" | "OTHER";
export type OrganizationStatus = "STANDARD" | "AMBASSADOR" | "TEST" | "MILITARY" | "DISCOUNT_50";

interface PaymentUrls {
  UA: string;
  OTHER: string;
}

interface PaymentUrlSet {
  SINGLE: PaymentUrls;
  ALBUM: PaymentUrls;
  VIDEO: PaymentUrls;
}

interface PaymentPrices {
  SINGLE: number;
  ALBUM: number;
  VIDEO: number;
}

export const STANDARD_PRICES_UAH: PaymentPrices = {
  SINGLE: 1000,
  ALBUM: 2000,
  VIDEO: 1000,
};

export const AMBASSADOR_PRICES_UAH: PaymentPrices = {
  SINGLE: 300,
  ALBUM: 600,
  VIDEO: 300,
};

export const TEST_PRICES_UAH: PaymentPrices = {
  SINGLE: 1,
  ALBUM: 1,
  VIDEO: 1,
};

export const MILITARY_PRICES_UAH: PaymentPrices = {
  SINGLE: 750,
  ALBUM: 1500,
  VIDEO: 750,
};

export const DISCOUNT_50_PRICES_UAH: PaymentPrices = {
  SINGLE: 500,
  ALBUM: 1000,
  VIDEO: 500,
};

export function getProductPrice(
  productType: ProductType,
  organizationStatus: OrganizationStatus
): number {
  if (organizationStatus === "TEST") {
    return TEST_PRICES_UAH[productType];
  }
  if (organizationStatus === "AMBASSADOR") {
    return AMBASSADOR_PRICES_UAH[productType];
  }
  if (organizationStatus === "MILITARY") {
    return MILITARY_PRICES_UAH[productType];
  }
  if (organizationStatus === "DISCOUNT_50") {
    return DISCOUNT_50_PRICES_UAH[productType];
  }
  return STANDARD_PRICES_UAH[productType];
}

const STANDARD_PAYMENT_URLS: PaymentUrlSet = {
  SINGLE: {
    UA: "https://secure.wayforpay.com/button/b11e392ef3865",
    OTHER: "https://secure.wayforpay.com/button/b11e392ef3865",
  },
  ALBUM: {
    UA: "https://secure.wayforpay.com/button/b86ba6f423e58",
    OTHER: "https://secure.wayforpay.com/button/b86ba6f423e58",
  },
  VIDEO: {
    UA: "https://secure.wayforpay.com/button/b11e392ef3865",
    OTHER: "https://secure.wayforpay.com/button/b11e392ef3865",
  },
};

const AMBASSADOR_PAYMENT_URLS: PaymentUrlSet = {
  SINGLE: {
    UA: "https://secure.wayforpay.com/button/b4e571862ab7c",
    OTHER: "https://secure.wayforpay.com/button/ba0ce48a74554",
  },
  ALBUM: {
    UA: "https://secure.wayforpay.com/button/bdec6b996850c",
    OTHER: "https://secure.wayforpay.com/button/bc8977ca15aeb",
  },
  VIDEO: {
    UA: "https://secure.wayforpay.com/button/b7a086cb44a20",
    OTHER: "https://secure.wayforpay.com/button/bbd837ad70664",
  },
};

export function getPaymentUrl(
  productType: ProductType,
  organizationStatus: OrganizationStatus,
  userCountry: string
): string {
  const countryGroup: CountryGroup = userCountry === "UA" ? "UA" : "OTHER";
  
  let urlSet: PaymentUrlSet;
  if (organizationStatus === "AMBASSADOR") {
    urlSet = AMBASSADOR_PAYMENT_URLS;
  } else {
    urlSet = STANDARD_PAYMENT_URLS;
  }
  
  return urlSet[productType][countryGroup];
}
