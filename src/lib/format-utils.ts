/**
 * Format utilities inspired by d3-format functionality
 * Provides number formatting with locale support without external dependencies
 */

// Format specifier regex: [[fill]align][sign][symbol][0][width][,][.precision][~][type]
const FORMAT_SPECIFIER_REGEX = /^(?:(.)?([<>=^]))?([+\-( ])?([$#])?(0)?(\d+)?(,)?(\.\d+)?(~)?([a-z%])?$/i;

export interface LocaleDefinition {
  thousands?: string;
  grouping?: number[];
  currency?: [string, string];
  decimal?: string;
  numerals?: string[];
  percent?: string;
  minus?: string;
  nan?: string;
}

export interface FormatOptions {
  prefix?: string;
  suffix?: string;
}

/**
 * Parse a format specifier string into a FormatSpecifier object
 */
export function parseFormatSpecifier(specifier: string): FormatSpecifier {
  const match = FORMAT_SPECIFIER_REGEX.exec(specifier);
  if (!match) {
    throw new Error(`Invalid format: ${specifier}`);
  }

  return new FormatSpecifier({
    fill: match[1] === undefined ? ' ' : match[1] + '',
    align: match[2] === undefined ? '>' : match[2] + '',
    sign: match[3] === undefined ? '-' : match[3] + '',
    symbol: match[4] === undefined ? '' : match[4] + '',
    zero: !!match[5],
    width: match[6] === undefined ? undefined : +match[6],
    comma: !!match[7],
    precision: match[8] ? +match[8].slice(1) : undefined,
    trim: !!match[9],
    type: match[10] === undefined ? '' : match[10] + ''
  });
}

/**
 * FormatSpecifier class with toString method
 */
export class FormatSpecifier {
  fill: string;
  align: string;
  sign: string;
  symbol: string;
  zero: boolean;
  width?: number;
  comma: boolean;
  precision?: number;
  trim: boolean;
  type: string;

  constructor(specifier: Partial<FormatSpecifier>) {
    this.fill = specifier.fill === undefined ? ' ' : specifier.fill + '';
    this.align = specifier.align === undefined ? '>' : specifier.align + '';
    this.sign = specifier.sign === undefined ? '-' : specifier.sign + '';
    this.symbol = specifier.symbol === undefined ? '' : specifier.symbol + '';
    this.zero = !!specifier.zero;
    this.width = specifier.width === undefined ? undefined : +specifier.width;
    this.comma = !!specifier.comma;
    this.precision = specifier.precision === undefined ? undefined : +specifier.precision;
    this.trim = !!specifier.trim;
    this.type = specifier.type === undefined ? '' : specifier.type + '';
  }

  toString(): string {
    return this.fill +
      this.align +
      this.sign +
      this.symbol +
      (this.zero ? '0' : '') +
      (this.width === undefined ? '' : Math.max(1, this.width | 0)) +
      (this.comma ? ',' : '') +
      (this.precision === undefined ? '' : '.' + Math.max(0, this.precision | 0)) +
      (this.trim ? '~' : '') +
      this.type;
  }
}

/**
 * Format types mapping
 */
const formatTypes: Record<string, (x: number, p?: number) => string> = {
  '%': (x, p) => (x * 100).toFixed(p),
  'b': (x) => Math.round(x).toString(2),
  'c': (x) => x + '',
  'd': (x) => Math.round(x).toString(),
  'e': (x, p) => x.toExponential(p),
  'f': (x, p) => x.toFixed(p),
  'g': (x, p) => x.toPrecision(p),
  'o': (x) => Math.round(x).toString(8),
  'p': (x, p) => (x * 100).toFixed(p),
  'r': (x, p) => x.toPrecision(p),
  's': (x, p) => x.toPrecision(p),
  'X': (x) => Math.round(x).toString(16).toUpperCase(),
  'x': (x) => Math.round(x).toString(16)
};

/**
 * Format grouping function
 */
function formatGroup(grouping: number[], thousands: string) {
  return function(value: string, width: number) {
    let i = value.length;
    let j = 0;
    let n = grouping[0];
    let c = '';

    while (i > 0 && j < grouping.length) {
      const g = grouping[j];
      const start = i - g;
      if (start > 0) {
        if (c) c = thousands + c;
        c = value.slice(start, i) + c;
        i = start;
      } else if (g === 0) {
        if (c) c = thousands + c;
        c = value.slice(0, i) + c;
        i = 0;
      } else {
        j++;
        n = g;
      }
    }

    if (i > 0) {
      if (c) c = thousands + c;
      c = value.slice(0, i) + c;
    }

    return c;
  };
}

/**
 * Default locale
 */
const defaultLocale: LocaleDefinition = {
  thousands: ',',
  grouping: [3],
  currency: ['', ''],
  decimal: '.',
  numerals: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
  percent: '%',
  minus: '−',
  nan: 'NaN'
};

/**
 * Create a formatter with locale support
 */
export function createFormatter(locale: LocaleDefinition = defaultLocale) {
  const group = locale.grouping && locale.thousands 
    ? formatGroup(locale.grouping.map(Number), locale.thousands)
    : (value: string) => value;

  const currencyPrefix = locale.currency?.[0] || '';
  const currencySuffix = locale.currency?.[1] || '';
  const decimal = locale.decimal || '.';
  const numerals = locale.numerals || defaultLocale.numerals!;
  const percent = locale.percent || '%';
  const minus = locale.minus || '−';
  const nan = locale.nan || 'NaN';

  return {
    /**
     * Create a new format function
     */
    format: (specifier: string, options?: FormatOptions) => {
      const spec = parseFormatSpecifier(specifier);

      // Handle type aliases
      if (spec.type === 'n') {
        spec.comma = true;
        spec.type = 'g';
      } else if (!formatTypes[spec.type]) {
        spec.precision = spec.precision === undefined ? 12 : spec.precision;
        spec.trim = true;
        spec.type = 'g';
      }

      // Handle zero fill
      if (spec.zero || (spec.fill === '0' && spec.align === '=')) {
        spec.zero = true;
        spec.fill = '0';
        spec.align = '=';
      }

      const prefix = (options?.prefix || '') + 
        (spec.symbol === '$' ? currencyPrefix : 
         spec.symbol === '#' && /[boxX]/.test(spec.type) ? '0' + spec.type.toLowerCase() : '');
      
      const suffix = (spec.symbol === '$' ? currencySuffix : 
        /[%p]/.test(spec.type) ? percent : '') + 
        (options?.suffix || '');

      const formatType = formatTypes[spec.type];
      const maybeSuffix = /[defgprs%]/.test(spec.type);

      // Set precision
      let precision = spec.precision;
      if (precision === undefined) {
        precision = 6;
      } else if (/[gprs]/.test(spec.type)) {
        precision = Math.max(1, Math.min(21, precision));
      } else {
        precision = Math.max(0, Math.min(20, precision));
      }

      return (value: number): string => {
        let valuePrefix = prefix;
        let valueSuffix = suffix;

        if (spec.type === 'c') {
          valueSuffix = formatType(value) + valueSuffix;
          value = '';
        } else {
          value = +value;
          const valueNegative = value < 0 || 1 / value < 0;

          value = isNaN(value) ? nan : formatType(Math.abs(value), precision);

          // Trim insignificant zeros
          if (spec.trim) {
            value = value.replace(/\.?0+$/, '');
          }

          // Handle sign
          if (valueNegative && +value === 0 && spec.sign !== '+') {
            valueNegative = false;
          }

          valuePrefix = (valueNegative ? 
            (spec.sign === '(' ? spec.sign : minus) : 
            spec.sign === '-' || spec.sign === '(' ? '' : spec.sign) + valuePrefix;
          
          valueSuffix = valueSuffix + (valueNegative && spec.sign === '(' ? ')' : '');

          // Split value into integer and fractional parts
          if (maybeSuffix) {
            const i = value.indexOf('.');
            if (i > 0) {
              valueSuffix = decimal + value.slice(i + 1) + valueSuffix;
              value = value.slice(0, i);
            }
          }
        }

        // Apply grouping
        let formattedValue = spec.comma && !spec.zero ? group(value, Infinity) : value;

        // Apply padding
        const length = valuePrefix.length + formattedValue.length + valueSuffix.length;
        const padding = length < spec.width! 
          ? new Array(spec.width! - length + 1).join(spec.fill) 
          : '';

        // Apply grouping after padding for zero fill
        if (spec.comma && spec.zero) {
          formattedValue = group(padding + formattedValue, spec.width! - valueSuffix.length);
        }

        // Apply alignment
        switch (spec.align) {
          case '<':
            return valuePrefix + formattedValue + valueSuffix + padding;
          case '=':
            return valuePrefix + padding + formattedValue + valueSuffix;
          case '^':
            const leftPadding = padding.slice(0, Math.floor(padding.length / 2));
            return leftPadding + valuePrefix + formattedValue + valueSuffix + padding.slice(leftPadding.length);
          default:
            return padding + valuePrefix + formattedValue + valueSuffix;
        }
      };
    },

    /**
     * Create a prefix formatter for SI units
     */
    formatPrefix: (specifier: string, value: number) => {
      const exponent = Math.max(-8, Math.min(8, Math.floor(Math.log10(Math.abs(value)) / 3))) * 3;
      const scale = Math.pow(10, -exponent);
      const prefixes = ['y', 'z', 'a', 'f', 'p', 'n', 'µ', 'm', '', 'k', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y'];
      
      const formatter = this.format(specifier, {
        suffix: prefixes[8 + exponent / 3]
      });

      return (value: number) => formatter(scale * value);
    }
  };
}

/**
 * Create a default formatter with standard locale
 */
export const format = createFormatter().format;

/**
 * Create a default prefix formatter
 */
export const formatPrefix = createFormatter().formatPrefix;

/**
 * Create a formatter with custom locale
 */
export function formatLocale(locale: LocaleDefinition) {
  return createFormatter(locale);
}