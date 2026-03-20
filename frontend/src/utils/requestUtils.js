export function appendStringParam(params, key, value, options = {}) {
  const normalizedValue = options.trim ? value.trim() : value;
  if (normalizedValue) {
    params.append(key, normalizedValue);
  }
}

export function appendPositiveIntegerParam(params, key, value) {
  const normalizedValue = Number.parseInt(value, 10);
  if (Number.isFinite(normalizedValue) && normalizedValue > 0) {
    params.append(key, String(normalizedValue));
  }
}

export function buildQueryString(configureParams) {
  const params = new URLSearchParams();
  configureParams(params);
  return params.toString();
}

export async function readErrorMessage(response, fallbackMessage) {
  const message = await response.text();
  return message || fallbackMessage;
}
