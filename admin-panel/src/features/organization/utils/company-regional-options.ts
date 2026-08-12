interface RegionalDefaults {
  currency?: string;
  timezone?: string;
}

const regionDisplayNames = new Intl.DisplayNames(['en'], { type: 'region' });
const currencyDisplayNames = new Intl.DisplayNames(['en'], { type: 'currency' });

const countryCodes = (
  'AF AX AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW'
).split(' ');

const currencyByCountryCode = parseCountryCurrencyMap(
  'AF:AFN AX:EUR AL:ALL DZ:DZD AS:USD AD:EUR AO:AOA AI:XCD AG:XCD AR:ARS AM:AMD AW:AWG AU:AUD AT:EUR AZ:AZN BS:BSD BH:BHD BD:BDT BB:BBD BY:BYN BE:EUR BZ:BZD BJ:XOF BM:BMD BT:BTN BO:BOB BQ:USD BA:BAM BW:BWP BV:NOK BR:BRL IO:USD BN:BND BG:EUR BF:XOF BI:BIF CV:CVE KH:KHR CM:XAF CA:CAD KY:KYD CF:XAF TD:XAF CL:CLP CN:CNY CX:AUD CC:AUD CO:COP KM:KMF CG:XAF CD:CDF CK:NZD CR:CRC CI:XOF HR:EUR CU:CUP CW:XCG CY:EUR CZ:CZK DK:DKK DJ:DJF DM:XCD DO:DOP EC:USD EG:EGP SV:USD GQ:XAF ER:ERN EE:EUR SZ:SZL ET:ETB FK:FKP FO:DKK FJ:FJD FI:EUR FR:EUR GF:EUR PF:XPF TF:EUR GA:XAF GM:GMD GE:GEL DE:EUR GH:GHS GI:GIP GR:EUR GL:DKK GD:XCD GP:EUR GU:USD GT:GTQ GG:GBP GN:GNF GW:XOF GY:GYD HT:HTG HM:AUD VA:EUR HN:HNL HK:HKD HU:HUF IS:ISK IN:INR ID:IDR IR:IRR IQ:IQD IE:EUR IM:GBP IL:ILS IT:EUR JM:JMD JP:JPY JE:GBP JO:JOD KZ:KZT KE:KES KI:AUD KP:KPW KR:KRW KW:KWD KG:KGS LA:LAK LV:EUR LB:LBP LS:LSL LR:LRD LY:LYD LI:CHF LT:EUR LU:EUR MO:MOP MG:MGA MW:MWK MY:MYR MV:MVR ML:XOF MT:EUR MH:USD MQ:EUR MR:MRU MU:MUR YT:EUR MX:MXN FM:USD MD:MDL MC:EUR MN:MNT ME:EUR MS:XCD MA:MAD MZ:MZN MM:MMK NA:NAD NR:AUD NP:NPR NL:EUR NC:XPF NZ:NZD NI:NIO NE:XOF NG:NGN NU:NZD NF:AUD MK:MKD MP:USD NO:NOK OM:OMR PK:PKR PW:USD PS:ILS PA:PAB PG:PGK PY:PYG PE:PEN PH:PHP PN:NZD PL:PLN PT:EUR PR:USD QA:QAR RE:EUR RO:RON RU:RUB RW:RWF BL:EUR SH:SHP KN:XCD LC:XCD MF:EUR PM:EUR VC:XCD WS:WST SM:EUR ST:STN SA:SAR SN:XOF RS:RSD SC:SCR SL:SLE SG:SGD SX:XCG SK:EUR SI:EUR SB:SBD SO:SOS ZA:ZAR GS:GBP SS:SSP ES:EUR LK:LKR SD:SDG SR:SRD SJ:NOK SE:SEK CH:CHF SY:SYP TW:TWD TJ:TJS TZ:TZS TH:THB TL:USD TG:XOF TK:NZD TO:TOP TT:TTD TN:TND TR:TRY TM:TMT TC:USD TV:AUD UG:UGX UA:UAH AE:AED GB:GBP US:USD UM:USD UY:UYU UZ:UZS VU:VUV VE:VES VN:VND VG:USD VI:USD WF:XPF EH:MAD YE:YER ZM:ZMW ZW:ZWG',
);

const timezoneByCountryCode: Record<string, string> = {
  AE: 'Asia/Dubai',
  AU: 'Australia/Sydney',
  BR: 'America/Sao_Paulo',
  CA: 'America/Toronto',
  CH: 'Europe/Zurich',
  CN: 'Asia/Shanghai',
  DE: 'Europe/Berlin',
  DK: 'Europe/Copenhagen',
  ES: 'Europe/Madrid',
  FR: 'Europe/Paris',
  GB: 'Europe/London',
  HK: 'Asia/Hong_Kong',
  ID: 'Asia/Jakarta',
  IE: 'Europe/Dublin',
  IN: 'Asia/Kolkata',
  IT: 'Europe/Rome',
  JP: 'Asia/Tokyo',
  KR: 'Asia/Seoul',
  MX: 'America/Mexico_City',
  MY: 'Asia/Kuala_Lumpur',
  NL: 'Europe/Amsterdam',
  NO: 'Europe/Oslo',
  NZ: 'Pacific/Auckland',
  PH: 'Asia/Manila',
  PL: 'Europe/Warsaw',
  QA: 'Asia/Qatar',
  SA: 'Asia/Riyadh',
  SE: 'Europe/Stockholm',
  SG: 'Asia/Singapore',
  TH: 'Asia/Bangkok',
  TR: 'Europe/Istanbul',
  US: 'America/New_York',
  ZA: 'Africa/Johannesburg',
};

const countryRecords = countryCodes.map((code) => ({
  code,
  name: regionDisplayNames.of(code) ?? code,
}));

export const companyCountryOptions = countryRecords
  .map(({ name }) => name)
  .sort((left, right) => left.localeCompare(right));

export const companyCurrencyOptions = [...new Set(Object.values(currencyByCountryCode))].sort();

export const companyTimezoneOptions = buildTimezoneOptions();

const regionalDefaultsByCountry = new Map(
  countryRecords.map(({ code, name }) => [name, {
    currency: currencyByCountryCode[code],
    timezone: timezoneByCountryCode[code],
  }] as const),
);

export function getCountryRegionalDefaults(country: string): RegionalDefaults {
  return regionalDefaultsByCountry.get(country) ?? {};
}

export function currencyOptionLabel(code: string) {
  const name = currencyDisplayNames.of(code);
  return name && name !== code ? `${code} \u2014 ${name}` : code;
}

export function includePersistedOption(options: readonly string[], value?: string | null) {
  if (!value || options.includes(value)) return options;
  return [value, ...options];
}

function buildTimezoneOptions() {
  const supportedValuesOf = (Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[];
  }).supportedValuesOf;

  let timezones: string[] = [];
  try {
    timezones = supportedValuesOf?.('timeZone') ?? [];
  } catch {
    timezones = [];
  }

  if (timezones.length === 0) {
    timezones = [
      'Africa/Johannesburg',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'America/New_York',
      'America/Sao_Paulo',
      'America/Toronto',
      'Asia/Dubai',
      'Asia/Hong_Kong',
      'Asia/Kolkata',
      'Asia/Singapore',
      'Asia/Tokyo',
      'Australia/Sydney',
      'Europe/Berlin',
      'Europe/London',
      'Europe/Paris',
      'Pacific/Auckland',
    ];
  }

  return ['UTC', ...timezones.filter((timezone) => timezone !== 'UTC')];
}

function parseCountryCurrencyMap(value: string): Record<string, string> {
  return Object.fromEntries(value.split(' ').map((entry) => entry.split(':')));
}
