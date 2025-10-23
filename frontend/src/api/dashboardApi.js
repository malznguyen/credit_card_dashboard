const BASE_URL = 'http://localhost:5000';

async function parseResponse(response, context) {
  const text = await response.text();
  let payload;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      payload = text;
    }
  }

  if (!response.ok) {
    const errorMessage =
      (payload && typeof payload === 'object' && 'error' in payload && payload.error) ||
      (typeof payload === 'string' && payload) ||
      `${context} failed (${response.status} ${response.statusText})`;

    throw new Error(errorMessage);
  }

  if (payload === undefined) {
    return {};
  }

  return payload;
}

export async function fetchFeatureImportance() {
  const response = await fetch(`${BASE_URL}/api/feature-importance`);
  return parseResponse(response, 'Feature importance request');
}

export async function fetchOverview() {
  const response = await fetch(`${BASE_URL}/api/metrics/overview`);
  return parseResponse(response, 'Overview metrics request');
}

export async function predict(body) {
  const response = await fetch(`${BASE_URL}/api/predict`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return parseResponse(response, 'Prediction request');
}

export { BASE_URL };
