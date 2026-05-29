import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Agenda from '../pages/Agenda';

// Mock do Zustand e store de autenticação
vi.mock('../store/authStore', () => ({
  useAuthStore: vi.fn(() => ({
    token: 'fake-token',
    user: { id: 1, nome: 'Admin' }
  }))
}));

// Mock do FullCalendar (já que ele depende do DOM e pode ser complexo de renderizar no jsdom puro)
vi.mock('@fullcalendar/react', () => ({
  default: ({ headerToolbar, select, eventClick, events }: any) => (
    <div data-testid="mock-calendar">
      <button 
        data-testid="mock-select-btn" 
        onClick={() => select({ 
          startStr: new Date(Date.now() + 86400000).toISOString(), // Amanhã
          endStr: new Date(Date.now() + 90000000).toISOString(),
          view: { calendar: { unselect: vi.fn() } }
        })}
      >
        Select Slot
      </button>
      <button 
        data-testid="mock-select-past-btn" 
        onClick={() => select({ 
          startStr: new Date(Date.now() - 86400000).toISOString(), // Ontem
          endStr: new Date(Date.now() - 80000000).toISOString(),
          view: { calendar: { unselect: vi.fn() } }
        })}
      >
        Select Past Slot
      </button>
      <ul data-testid="mock-events-list">
        {events && events.map((event: any, i: number) => (
          <li key={i} data-testid={`event-${event.id}`} onClick={() => eventClick({ event })}>
            {event.title}
          </li>
        ))}
      </ul>
    </div>
  )
}));

describe('Agenda Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock do window.alert
    vi.spyOn(window, 'alert').mockImplementation(() => {});

    // Mock global fetch para retornos da API
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/api/users')) {
        return Promise.resolve({
          json: () => Promise.resolve([{ id: 1, nome: 'Profissional Teste' }])
        }) as any;
      }
      if (url.includes('/api/agenda')) {
        return Promise.resolve({
          json: () => Promise.resolve([
            {
              id: 1,
              usuario_id: 1,
              cliente_nome: 'Cliente de Teste',
              data_inicio: new Date(Date.now() + 86400000).toISOString().replace('T', ' '),
              data_fim: new Date(Date.now() + 90000000).toISOString().replace('T', ' '),
              valor_total: 150.00,
              status: 'Pendente',
              items: []
            }
          ])
        }) as any;
      }
      if (url.includes('/api/pessoas')) {
        return Promise.resolve({
          json: () => Promise.resolve([])
        }) as any;
      }
      if (url.includes('/api/products')) {
        return Promise.resolve({
          json: () => Promise.resolve([])
        }) as any;
      }
      return Promise.resolve({
        json: () => Promise.resolve({})
      }) as any;
    });
  });

  it('renders title correctly and fetches professionals', async () => {
    render(<Agenda />);
    
    expect(screen.getAllByText(/Agenda/i).length).toBeGreaterThan(0);
    
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/users', expect.any(Object));
    });
  });
});
