export type TranslateParamValue = string | number | boolean | bigint | Date | null | undefined;
export type TranslateParams = Record<string, TranslateParamValue>;

export const PLACEHOLDER_PATTERN = /\{([A-Za-z_$][\w$]*)\}/g;

export function stringifyParam(value: TranslateParamValue): string | undefined {
  if (value === undefined) return undefined;
  if (value === null) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function formatMessage(text: string, params?: TranslateParams): string {
  if (!params) return text;

  return text.replace(PLACEHOLDER_PATTERN, (placeholder, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(params, name)) {
      return placeholder;
    }

    return stringifyParam(params[name]) ?? placeholder;
  });
}
