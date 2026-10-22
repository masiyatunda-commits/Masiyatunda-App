// MilkyWay Coins: one coin is worth 1,000 TZS, and a tenth of a coin (100 TZS) is the smallest gift. Gifts are bought
// with coins; 60% of every gift goes to the recipient's dashboard balance and 40% to the Masiyatunda Co. Ltd company
// wallet. Users only ever see gift prices and their own net earnings, never the split.
export const coinTzs = 1000;
export const creatorShare = 0.6;
export const minWithdrawCoins = 50;
export const milliPerCoin = 1000;

// 100 gifts priced from 0.1 coin (100 TZS) to 100 coins (100,000 TZS), cheapest first. Must match
// milkyway/gift-catalog.js, which holds the translated names.
export const giftCatalog = [
  { key: 'maua', coins: 0.1, category: 'everyday' },
  { key: 'tausi', coins: 0.2, category: 'everyday' },
  { key: 'kahawa', coins: 0.3, category: 'everyday' },
  { key: 'chai', coins: 0.4, category: 'everyday' },
  { key: 'embe', coins: 0.5, category: 'everyday' },
  { key: 'nazi', coins: 0.6, category: 'everyday' },
  { key: 'moyo', coins: 0.7, category: 'everyday' },
  { key: 'nyota', coins: 0.8, category: 'everyday' },
  { key: 'maputo', coins: 0.9, category: 'everyday' },
  { key: 'keki', coins: 1, category: 'everyday' },
  { key: 'ngoma', coins: 1.2, category: 'culture' },
  { key: 'shanga', coins: 1.4, category: 'culture' },
  { key: 'kinyago', coins: 1.5, category: 'culture' },
  { key: 'zeze', coins: 1.6, category: 'culture' },
  { key: 'kipaza-sauti', coins: 1.8, category: 'culture' },
  { key: 'gitaa', coins: 2, category: 'culture' },
  { key: 'jahazi', coins: 2.2, category: 'culture' },
  { key: 'tingatinga', coins: 2.5, category: 'culture' },
  { key: 'kombe', coins: 2.8, category: 'culture' },
  { key: 'kilimanjaro', coins: 3, category: 'culture' },
  { key: 'kipepeo', coins: 3.2, category: 'wildlife' },
  { key: 'kasuku', coins: 3.5, category: 'wildlife' },
  { key: 'kobe', coins: 3.8, category: 'wildlife' },
  { key: 'heroe', coins: 4, category: 'wildlife' },
  { key: 'tumbili', coins: 4.5, category: 'wildlife' },
  { key: 'pundamilia', coins: 5, category: 'wildlife' },
  { key: 'twiga', coins: 5.5, category: 'wildlife' },
  { key: 'pomboo', coins: 6, category: 'wildlife' },
  { key: 'mamba', coins: 6.5, category: 'wildlife' },
  { key: 'kiboko', coins: 7, category: 'wildlife' },
  { key: 'nyati', coins: 7.5, category: 'wildlife' },
  { key: 'nyangumi', coins: 8, category: 'wildlife' },
  { key: 'tai', coins: 8.5, category: 'wildlife' },
  { key: 'kifaru', coins: 9, category: 'wildlife' },
  { key: 'sokwe-mtu', coins: 9.5, category: 'wildlife' },
  { key: 'chui', coins: 10, category: 'wildlife' },
  { key: 'simba', coins: 11, category: 'wildlife' },
  { key: 'tembo', coins: 12, category: 'wildlife' },
  { key: 'dainaso-rex', coins: 13.5, category: 'wildlife' },
  { key: 'dainaso', coins: 15, category: 'wildlife' },
  { key: 'vipokea-sauti', coins: 16, category: 'tech' },
  { key: 'spika', coins: 17, category: 'tech' },
  { key: 'simu-ya-mkononi', coins: 18, category: 'tech' },
  { key: 'kamera', coins: 19, category: 'tech' },
  { key: 'kidhibiti-mchezo', coins: 20, category: 'tech' },
  { key: 'simu-janja', coins: 21, category: 'tech' },
  { key: 'kompyuta-mpakato', coins: 22, category: 'tech' },
  { key: 'televisheni', coins: 23, category: 'tech' },
  { key: 'kompyuta', coins: 24, category: 'tech' },
  { key: 'simu-ya-dhahabu', coins: 25, category: 'tech' },
  { key: 'roboti', coins: 26, category: 'tech' },
  { key: 'miwani-janja', coins: 27, category: 'tech' },
  { key: 'setilaiti', coins: 28, category: 'tech' },
  { key: 'darubini', coins: 29, category: 'tech' },
  { key: 'akili-bandia', coins: 30, category: 'tech' },
  { key: 'miwani-ya-jua', coins: 32, category: 'luxury' },
  { key: 'manukato', coins: 34, category: 'luxury' },
  { key: 'saa-ya-dhahabu', coins: 35, category: 'luxury' },
  { key: 'viatu', coins: 36, category: 'luxury' },
  { key: 'mkoba', coins: 38, category: 'luxury' },
  { key: 'pete-ya-almasi', coins: 40, category: 'luxury' },
  { key: 'almasi', coins: 42, category: 'luxury' },
  { key: 'kitita-cha-pesa', coins: 44, category: 'luxury' },
  { key: 'pikipiki', coins: 45, category: 'luxury' },
  { key: 'gari-la-safari', coins: 46, category: 'luxury' },
  { key: 'gari-la-kifahari', coins: 48, category: 'luxury' },
  { key: 'gari-la-umeme', coins: 50, category: 'luxury' },
  { key: 'gari-la-mashindano', coins: 52, category: 'luxury' },
  { key: 'gari-la-dhahabu', coins: 54, category: 'luxury' },
  { key: 'limozini', coins: 55, category: 'luxury' },
  { key: 'helikopta', coins: 56, category: 'luxury' },
  { key: 'boti-ya-kifahari', coins: 58, category: 'luxury' },
  { key: 'jumba-la-kifahari', coins: 60, category: 'luxury' },
  { key: 'ndege-binafsi', coins: 65, category: 'luxury' },
  { key: 'kisiwa-binafsi', coins: 70, category: 'luxury' },
  { key: 'vumbi-la-nyota', coins: 72, category: 'galaxy' },
  { key: 'nyota-inayoanguka', coins: 74, category: 'galaxy' },
  { key: 'mwezi-mchanga', coins: 75, category: 'galaxy' },
  { key: 'nyota-angavu', coins: 76, category: 'galaxy' },
  { key: 'kimondo', coins: 78, category: 'galaxy' },
  { key: 'dunia', coins: 80, category: 'galaxy' },
  { key: 'mwanaanga', coins: 81, category: 'galaxy' },
  { key: 'roketi', coins: 82, category: 'galaxy' },
  { key: 'kiumbe-wa-anga', coins: 83, category: 'galaxy' },
  { key: 'chombo-cha-anga', coins: 84, category: 'galaxy' },
  { key: 'sayari', coins: 85, category: 'galaxy' },
  { key: 'mwezi', coins: 86, category: 'galaxy' },
  { key: 'jua', coins: 87, category: 'galaxy' },
  { key: 'farasi-wa-nyota', coins: 88, category: 'galaxy' },
  { key: 'ngao-ya-galaxy', coins: 89, category: 'galaxy' },
  { key: 'joka-la-anga', coins: 90, category: 'galaxy' },
  { key: 'wingu-la-nyota', coins: 91, category: 'galaxy' },
  { key: 'shimo-jeusi', coins: 92, category: 'galaxy' },
  { key: 'jiwe-la-nyota', coins: 93, category: 'galaxy' },
  { key: 'kasri-la-nyota', coins: 94, category: 'galaxy' },
  { key: 'fataki-za-galaksi', coins: 95, category: 'galaxy' },
  { key: 'galaksi', coins: 96, category: 'galaxy' },
  { key: 'moyo-wa-galaksi', coins: 97, category: 'galaxy' },
  { key: 'kito-cha-galaksi', coins: 98, category: 'galaxy' },
  { key: 'taji-ya-milkyway', coins: 100, category: 'galaxy' },
] as const;
// Gift keys from older app versions that still arrive from cached clients.
export const giftAliases: Record<string, string> = { 'taji-ya-masiyatunda': 'taji-ya-milkyway' };

export const topupPackages = [5, 10, 20, 50, 100];
export const networks = ['mpesa', 'mixx', 'airtel', 'halopesa'];

// A price in thousandths of a coin; with 1 coin = 1,000 TZS this is also the amount in shillings.
export const toMilli = (coins: number) => Math.round(coins * milliPerCoin);
// Net share in thousandths of a coin; with 1 coin = 1,000 TZS this is also the creator's amount in shillings.
export const creatorMilli = (coins: number) => Math.round(coins * milliPerCoin * creatorShare);
// How one gift is shared: 60% to the recipient, the remaining 40% (so the two always add up) to the company wallet.
export const giftSplit = (coins: number) => { const creator = creatorMilli(coins);return { creatorMilli: creator, companyMilli: toMilli(coins) - creator }; };
// Gross value and commission behind a net payout, for the company's own records only.
export const payoutBreakdown = (netTzs: number) => {
  const grossTzs = Math.round(netTzs / creatorShare);
  return { payoutTzs: netTzs, grossTzs, commissionTzs: grossTzs - netTzs };
};

// ---------- Local currency ----------
// Coins are priced in TZS. Each account sees prices, earnings and payouts in the currency of the country detected
// when it joined (TZS in Tanzania, USD in the US, GBP in the UK…). Mobile money payments themselves stay in TZS.
const sharedCurrencies: Record<string, string> = {
  EUR: 'AD,AT,BE,BG,CY,DE,EE,ES,FI,FR,GF,GP,GR,HR,IE,IT,LT,LU,LV,MC,ME,MQ,MT,NL,PT,RE,SI,SK,SM,VA,XK,YT',
  USD: 'AS,BQ,EC,FM,GU,MH,MP,PA,PR,PW,SV,TC,TL,US,VG,VI,ZW',
  XOF: 'BF,BJ,CI,GW,ML,NE,SN,TG', XAF: 'CF,CG,CM,GA,GQ,TD', GBP: 'GB,GG,IM,JE', CHF: 'CH,LI', AUD: 'AU,KI,NR,TV', NZD: 'CK,NZ', DKK: 'DK,FO,GL', XCD: 'AG,DM,GD,KN,LC,VC',
};
const ownCurrencies = 'TZ:TZS,KE:KES,UG:UGX,RW:RWF,BI:BIF,CD:CDF,ZM:ZMW,MW:MWK,MZ:MZN,ZA:ZAR,NG:NGN,GH:GHS,ET:ETB,SO:SOS,SS:SSP,SD:SDG,EG:EGP,MA:MAD,BW:BWP,NA:NAD,AO:AOA,KM:KMF,MG:MGA,MU:MUR,SC:SCR,DJ:DJF,ER:ERN,LS:LSL,SZ:SZL,DZ:DZD,TN:TND,LY:LYD,LR:LRD,SL:SLE,GM:GMD,GN:GNF,CV:CVE,ST:STN,MR:MRU,'
  + 'NO:NOK,SE:SEK,IS:ISK,PL:PLN,CZ:CZK,HU:HUF,RO:RON,RS:RSD,UA:UAH,RU:RUB,TR:TRY,BY:BYN,MD:MDL,AL:ALL,MK:MKD,BA:BAM,GE:GEL,AM:AMD,AZ:AZN,KZ:KZT,UZ:UZS,KG:KGS,TJ:TJS,TM:TMT,'
  + 'AE:AED,SA:SAR,OM:OMR,QA:QAR,KW:KWD,BH:BHD,JO:JOD,IL:ILS,LB:LBP,IQ:IQD,IR:IRR,YE:YER,SY:SYP,IN:INR,PK:PKR,BD:BDT,LK:LKR,NP:NPR,AF:AFN,MV:MVR,BT:BTN,'
  + 'CN:CNY,HK:HKD,MO:MOP,TW:TWD,JP:JPY,KR:KRW,SG:SGD,MY:MYR,ID:IDR,TH:THB,VN:VND,PH:PHP,MM:MMK,KH:KHR,LA:LAK,MN:MNT,BN:BND,FJ:FJD,PG:PGK,WS:WST,TO:TOP,SB:SBD,VU:VUV,'
  + 'CA:CAD,MX:MXN,BR:BRL,AR:ARS,CL:CLP,CO:COP,PE:PEN,VE:VES,UY:UYU,PY:PYG,BO:BOB,GT:GTQ,HN:HNL,NI:NIO,CR:CRC,DO:DOP,CU:CUP,JM:JMD,TT:TTD,HT:HTG,BS:BSD,BB:BBD,BZ:BZD,GY:GYD,SR:SRD,KY:KYD,BM:BMD,AW:AWG,CW:ANG';
const countryCurrencies: Record<string, string> = Object.fromEntries([
  ...Object.entries(sharedCurrencies).flatMap(([currency, countries]) => countries.split(',').map(country => [country, currency])),
  ...ownCurrencies.split(',').map(pair => pair.split(':')),
]);
export const isCountry = (value: unknown): value is string => typeof value === 'string' && /^[A-Z]{2}$/.test(value) && value !== 'XX';
// Countries without a known currency are shown US dollars.
export const currencyOf = (country: string) => countryCurrencies[country] || 'USD';

// TZS for one unit of each currency. Used when live exchange rates cannot be fetched.
export const fallbackRates: Record<string, number> = {
  TZS: 1, USD: 2550, EUR: 2950, GBP: 3400, KES: 19.7, UGX: 0.69, RWF: 1.8, BIF: 0.87, CDF: 0.9, ZMW: 95, MWK: 1.47, MZN: 40, ZAR: 140, NGN: 1.65, GHS: 165,
  ETB: 18, SOS: 4.45, EGP: 52, MAD: 270, BWP: 190, NAD: 140, AOA: 2.8, KMF: 6, MGA: 0.56, MUR: 56, XOF: 4.5, XAF: 4.5, CHF: 3150, SEK: 260, NOK: 245, DKK: 395,
  AED: 694, SAR: 680, OMR: 6620, QAR: 700, KWD: 8300, INR: 30, PKR: 9, CNY: 355, HKD: 328, JPY: 17, KRW: 1.85, SGD: 1950, MYR: 590, IDR: 0.16, THB: 76, PHP: 45,
  CAD: 1850, AUD: 1680, NZD: 1520, MXN: 135, BRL: 470, TRY: 62, RUB: 31, PLN: 690, ILS: 690,
};
// Decimal places shown for a currency (0 for TZS, UGX, JPY…, 2 for USD, GBP…). Shillings, naira and similar
// currencies have official cents that are never used in prices, so they are shown as whole amounts.
const wholeCurrencies = new Set('TZS,KES,UGX,RWF,BIF,CDF,MWK,NGN,SOS,SSP,SDG,MGA,KMF,DJF,GNF,XOF,XAF,LBP,IQD,IRR,YER,SYP,PKR,LKR,IDR,VND,KRW,JPY,MMK,KHR,LAK,UZS,CLP,COP,PYG,HUF,ISK'.split(','));
export const currencyDigits = (currency: string) => {
  if (wholeCurrencies.has(currency)) return 0;
  try { return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2; } catch { return 2; }
};
// A TZS amount in the local currency's smallest unit (cents, pence…), rounded to what that currency can show.
export const localMinor = (tzs: number, tzsPerUnit: number, digits: number) => Math.round(tzs / tzsPerUnit * 10 ** digits);

export type Pricing = { country: string; currency: string; tzsPerUnit: number; digits: number; coinMinor: number };
// Everything a screen needs to show coin prices in the account's currency. Without a rate, prices fall back to USD.
export const pricingFor = (country: string, rates: Record<string, number>): Pricing => {
  let currency = currencyOf(country);
  if (!(rates[currency] > 0)) currency = rates.USD > 0 ? 'USD' : 'TZS';
  const tzsPerUnit = currency === 'TZS' ? 1 : rates[currency];
  const digits = currencyDigits(currency);
  return { country, currency, tzsPerUnit, digits, coinMinor: localMinor(coinTzs, tzsPerUnit, digits) };
};
