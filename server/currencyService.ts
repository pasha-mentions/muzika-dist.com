import crypto from 'crypto';

interface CurrencyRate {
  currency: string;
  buy: number;
  sell: number;
}

interface CurrencyRatesCache {
  rates: CurrencyRate[];
  fetchedAt: number;
  ratesDate: string;
}

const CACHE_TTL_MS = 60 * 60 * 1000;
const FALLBACK_USD_UAH = 41.5;
const FALLBACK_EUR_UAH = 45.0;

let ratesCache: CurrencyRatesCache | null = null;

export async function fetchWayforpayCurrencyRates(): Promise<CurrencyRate[]> {
  const merchantAccount = process.env.WAYFORPAY_MERCHANT_ACCOUNT;
  const secretKey = process.env.WAYFORPAY_SECRET_KEY;

  if (!merchantAccount || !secretKey) {
    console.warn('[CURRENCY] Wayforpay credentials not configured, using fallback rates');
    return getFallbackRates();
  }

  const orderDate = Math.floor(Date.now() / 1000);
  const signString = `${merchantAccount};${orderDate}`;
  const signature = crypto.createHmac('md5', secretKey).update(signString).digest('hex');

  try {
    const response = await fetch('https://api.wayforpay.com/api', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transactionType: 'CURRENCY_RATES',
        merchantAccount,
        merchantSignature: signature,
        apiVersion: 1,
        orderDate,
      }),
    });

    if (!response.ok) {
      console.error('[CURRENCY] Wayforpay API error:', response.status);
      return getFallbackRates();
    }

    const data = await response.json();
    console.log('[CURRENCY] Wayforpay API response:', JSON.stringify(data, null, 2));
    
    if (data.reasonCode !== 1100) {
      console.error('[CURRENCY] Wayforpay API returned error:', data.reason);
      return getFallbackRates();
    }

    // Wayforpay returns rates as object: { USD: 43.75, EUR: 50.9, ... }
    // Each value is a single rate (sell rate to UAH)
    let rates: CurrencyRate[] = [];
    
    if (Array.isArray(data.rates)) {
      rates = data.rates;
    } else if (data.rates && typeof data.rates === 'object') {
      // Convert object format to array format
      // Wayforpay returns single rate per currency (sell rate)
      rates = Object.entries(data.rates).map(([currency, value]: [string, any]) => {
        const rate = typeof value === 'number' ? value : parseFloat(value) || 0;
        return {
          currency,
          buy: rate,  // Use same rate for both buy/sell since API provides only one
          sell: rate,
        };
      });
    }
    
    // If no valid rates, use fallback
    if (rates.length === 0) {
      console.warn('[CURRENCY] No valid rates in API response, using fallback');
      return getFallbackRates();
    }
    
    ratesCache = {
      rates,
      fetchedAt: Date.now(),
      ratesDate: data.ratesDate || new Date().toISOString().split('T')[0],
    };

    console.log('[CURRENCY] Fetched rates from Wayforpay:', rates.length, 'currencies');
    return rates;
  } catch (error) {
    console.error('[CURRENCY] Failed to fetch Wayforpay rates:', error);
    return getFallbackRates();
  }
}

function getFallbackRates(): CurrencyRate[] {
  console.log('[CURRENCY] Using fallback rates');
  return [
    { currency: 'USD', buy: FALLBACK_USD_UAH, sell: FALLBACK_USD_UAH },
    { currency: 'EUR', buy: FALLBACK_EUR_UAH, sell: FALLBACK_EUR_UAH },
  ];
}

export async function getCurrencyRates(): Promise<CurrencyRatesCache> {
  if (ratesCache && Date.now() - ratesCache.fetchedAt < CACHE_TTL_MS) {
    return ratesCache;
  }

  const rates = await fetchWayforpayCurrencyRates();
  
  if (!ratesCache) {
    ratesCache = {
      rates,
      fetchedAt: Date.now(),
      ratesDate: new Date().toISOString().split('T')[0],
    };
  }

  return ratesCache;
}

export async function getExchangeRate(from: string, to: string): Promise<number> {
  const { rates } = await getCurrencyRates();
  
  if (from === 'UAH' && to === 'UAH') return 1;

  if (from === 'USD' && to === 'UAH') {
    const usdRate = rates.find(r => r.currency === 'USD');
    return usdRate?.sell || FALLBACK_USD_UAH;
  }

  if (from === 'UAH' && to === 'USD') {
    const usdRate = rates.find(r => r.currency === 'USD');
    return 1 / (usdRate?.buy || FALLBACK_USD_UAH);
  }

  if (from === 'EUR' && to === 'UAH') {
    const eurRate = rates.find(r => r.currency === 'EUR');
    return eurRate?.sell || FALLBACK_EUR_UAH;
  }

  if (from === 'UAH' && to === 'EUR') {
    const eurRate = rates.find(r => r.currency === 'EUR');
    return 1 / (eurRate?.buy || FALLBACK_EUR_UAH);
  }

  console.warn(`[CURRENCY] Unknown currency pair: ${from}/${to}`);
  return 1;
}

export function getDisplayRates(rates: CurrencyRate[]): {
  usdBuy: number;
  usdSell: number;
  eurBuy: number;
  eurSell: number;
} {
  const usdRate = rates.find(r => r.currency === 'USD');
  const eurRate = rates.find(r => r.currency === 'EUR');

  // Wayforpay API returns single rate (sell), calculate buy as ~1.4% lower
  const SPREAD_PERCENT = 0.014;
  
  const usdSell = usdRate?.sell || FALLBACK_USD_UAH;
  const eurSell = eurRate?.sell || FALLBACK_EUR_UAH;

  return {
    usdBuy: usdSell * (1 - SPREAD_PERCENT),
    usdSell: usdSell,
    eurBuy: eurSell * (1 - SPREAD_PERCENT * 1.4), // EUR has slightly larger spread
    eurSell: eurSell,
  };
}
