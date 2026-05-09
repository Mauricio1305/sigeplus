import { create } from 'zustand';

interface User {
  id: number;
  nome: string;
  email: string;
  perfil: string;
  tenant_id: string;
  avatar?: string;
  status_assinatura?: string;
  vencimento_assinatura?: string;
  plano_id?: number;
  modulos?: string[];
  permissoes?: Record<string, Record<string, boolean>>;
}

interface AuthState {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
}

const safeParse = (key: string) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  } catch (e) {
    console.error(`Error parsing localStorage key "${key}":`, e);
    return null;
  }
};

export const useAuthStore = create<AuthState>((set) => ({
  user: safeParse('user'),
  token: localStorage.getItem('token'),
  setAuth: (user, token) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('token', token);
    set({ user, token });
  },
  logout: () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    sessionStorage.removeItem('subscriptionWarningSeen');
    set({ user: null, token: null });
  },
}));
