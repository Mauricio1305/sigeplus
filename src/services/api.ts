import { useAuthStore } from '../store/authStore';

export const safeFetchArray = async (url: string, token: string | null, setter: (data: any[]) => void) => {
  try {
    const headers: any = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(url, { headers });
    if (res.status === 401) {
      useAuthStore.getState().logout();
      return;
    }
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
      console.error(`API ${url} returned status ${res.status} with content-type ${contentType}`);
      setter([]);
      return;
    }
    const data = await res.json();
    if (Array.isArray(data)) {
      setter(data);
    } else {
      console.error(`API ${url} returned non-array:`, data);
      setter([]);
    }
  } catch (err) {
    console.error(`Error fetching ${url}:`, err);
    setter([]);
  }
};

export const apiRequest = async (url: string, options: RequestInit = {}) => {
  const token = useAuthStore.getState().token;
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(url, { ...options, headers });
  
  if (res.status === 401) {
    useAuthStore.getState().logout();
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  const contentType = res.headers.get('content-type') || '';
  let data: any = {};
  if (contentType.includes('application/json')) {
    try {
      data = await res.json();
    } catch (e) {
      data = { error: 'Erro ao processar resposta do servidor' };
    }
  } else {
    const text = await res.text();
    data = { error: text || `Erro no servidor (${res.status})` };
  }

  if (!res.ok) {
    throw { status: res.status, ...(typeof data === 'object' && data !== null ? data : { error: data }) };
  }
  return data;
};

export const safeFetchJson = async (url: string, init?: RequestInit) => {
  try {
    const res = await fetch(url, init);
    if (res.status === 401) {
      useAuthStore.getState().logout();
      return null;
    }
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return null;
    return await res.json();
  } catch (err) {
    console.error(`Error fetching ${url}:`, err);
    return null;
  }
};

