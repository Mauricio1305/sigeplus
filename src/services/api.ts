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
    throw new Error('Unauthorized');
  }

  const data = await res.json();
  if (!res.ok) {
    throw { status: res.status, ...data };
  }
  return data;
};
