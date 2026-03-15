const BASE_URL = process.env.REACT_APP_API_URL || '';

async function handleResponse(response) {
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const data = await response.json();
      message = data.error || data.message || message;
    } catch (e) {
      // Response wasn't JSON, use default message
    }
    throw new Error(message);
  }
  return response.json();
}

const api = {
  get(path) {
    return fetch(`${BASE_URL}${path}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
      },
    }).then(handleResponse);
  },

  post(path, body, { signal } = {}) {
    return fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    }).then(handleResponse);
  },

  put(path, body) {
    return fetch(`${BASE_URL}${path}`, {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    }).then(handleResponse);
  },

  del(path) {
    return fetch(`${BASE_URL}${path}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Accept': 'application/json' },
    }).then(handleResponse);
  },

  postRaw(path, body, headers = {}, { signal } = {}) {
    return fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body,
      signal,
    }).then(async (response) => {
      if (!response.ok) {
        let message = `Request failed with status ${response.status}`;
        try {
          const data = await response.json();
          message = data.error || data.message || message;
        } catch (e) {
          // Response wasn't JSON
        }
        throw new Error(message);
      }
      return response;
    });
  },
};

export default api;
