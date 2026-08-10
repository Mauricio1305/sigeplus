import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import dayGridPlugin from '@fullcalendar/daygrid';
import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid';
import ptBrLocale from '@fullcalendar/core/locales/pt-br';
import { 
  Calendar as CalendarIcon, 
  Plus, 
  Search, 
  User, 
  Users,
  Clock, 
  MessageSquare, 
  Mail, 
  CheckCircle2, 
  XCircle, 
  Trash2,
  AlertCircle,
  Check,
  Phone,
  Save,
  ShoppingBag,
  Edit2,
  X,
  ChevronLeft,
  ChevronRight,
  Filter,
  Scissors,
  ArrowLeft,
  Sparkles,
  Maximize2,
  Minimize2,
  Loader2,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuthStore } from '../store/authStore';
import { apiRequest } from '../services/api';
import { formatMoney, formatDate, formatTime } from '../utils/format';

interface Agendamento {
  id: number;
  usuario_id: number;
  pessoa_id: number | null;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  cliente_email: string | null;
  profissional_nome: string;
  data_inicio: string;
  data_fim: string;
  valor_total: number;
  status: 'Pendente' | 'Confirmado' | 'Check-in Realizado' | 'Concluido' | 'Cancelado';
  observacao: string | null;
  is_encaixe?: boolean;
  venda_id?: number;
  items?: any[];
}

function ClientFilterCombobox({
  selectedClient,
  onSelectClient,
  pessoas
}: {
  selectedClient: any;
  onSelectClient: (client: any) => void;
  pessoas: any[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredPessoas = useMemo(() => {
    const clientsOnly = pessoas.filter(p => (p.ativo === 1 || p.ativo === true || p.ativo === undefined) && (p.tipo_pessoa === 'cliente' || p.tipo_pessoa === 'ambos' || !p.tipo_pessoa));
    if (!query.trim()) return clientsOnly.slice(0, 50);
    const q = query.toLowerCase();
    return clientsOnly.filter((p) =>
      p.nome?.toLowerCase().includes(q) ||
      (p.telefone && p.telefone.includes(q)) ||
      (p.email && p.email.toLowerCase().includes(q)) ||
      (p.cpf_cnpj && p.cpf_cnpj.includes(q)) ||
      (p.sequencial_id && p.sequencial_id.toString().includes(q))
    ).slice(0, 50);
  }, [query, pessoas]);

  return (
    <div ref={containerRef} className="relative w-full sm:w-auto">
      {selectedClient ? (
        <div className="flex items-center justify-between gap-1.5 bg-indigo-50 border border-indigo-200/80 px-2.5 py-1.5 rounded-xl shadow-2xs w-full">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <Users className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span className="font-extrabold text-xs text-indigo-950 truncate">
              {selectedClient.nome}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              onSelectClient(null);
              setQuery('');
            }}
            className="p-0.5 hover:bg-indigo-200/60 rounded-full text-indigo-500 hover:text-indigo-800 transition-colors cursor-pointer shrink-0"
            title="Remover filtro de cliente"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="relative w-full">
          <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1.5 rounded-xl border border-slate-200/60 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:bg-white transition-all w-full">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              placeholder="Filtrar cliente por nome, tel, e-mail..."
              className="bg-transparent text-xs font-bold text-slate-800 placeholder:text-slate-400 placeholder:font-normal focus:outline-none w-full truncate"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-slate-400 hover:text-slate-600 cursor-pointer shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {isOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-full sm:w-72 bg-white rounded-2xl border border-slate-200/90 shadow-2xl z-50 overflow-hidden max-h-64 overflow-y-auto divide-y divide-slate-100 animate-in fade-in slide-in-from-top-1 duration-150">
              <div
                onClick={() => {
                  onSelectClient(null);
                  setIsOpen(false);
                  setQuery('');
                }}
                className="p-2.5 text-xs font-extrabold text-indigo-600 hover:bg-indigo-50/70 cursor-pointer flex items-center gap-2 transition-colors"
              >
                <Users className="w-4 h-4 text-indigo-500" />
                <span>Todos os clientes</span>
              </div>

              {filteredPessoas.length > 0 ? (
                filteredPessoas.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => {
                      onSelectClient(p);
                      setIsOpen(false);
                      setQuery('');
                    }}
                    className="p-2.5 hover:bg-slate-50 cursor-pointer flex flex-col gap-0.5 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-xs text-slate-800 truncate">{p.nome}</span>
                      {p.sequencial_id && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-md shrink-0">
                          #{p.sequencial_id}
                        </span>
                      )}
                    </div>
                    {(p.telefone || p.email) && (
                      <span className="text-[11px] text-slate-400 truncate">
                        {p.telefone || p.email}
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <div className="p-3 text-xs text-slate-400 text-center font-medium">
                  Nenhum cliente encontrado
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const Agenda = () => {
  const navigate = useNavigate();
  const token = useAuthStore(state => state.token);
  const user = useAuthStore(state => state.user);

  // States
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProfessional, setSelectedProfessional] = useState<any>(null); // null = "Todos"
  const [selectedClient, setSelectedClient] = useState<any>(null); // null = "Todos"
  const [professionals, setProfessionals] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [currentView, setCurrentView] = useState<'resourceTimeGridDay' | 'resourceTimeGridWeek' | 'dayGridMonth'>('resourceTimeGridDay');
  const [isFullScreen, setIsFullScreen] = useState(true);

  // Check if tenant/user plan includes WhatsApp notifications
  const hasWhatsAppModule = 
    user?.tenant_id === 'system' || 
    user?.tenant_id === 'System' || 
    !user?.modulos || 
    user.modulos.length === 0 || 
    user.modulos.includes('lembrete_whatsapp');
  
  // Form State
  const [formData, setFormData] = useState({
    usuario_id: '' as any,
    pessoa_id: '' as any,
    data_inicio: '',
    data_fim: '',
    observacao: '',
    status: 'Pendente' as any,
    is_encaixe: false,
    items: [] as any[]
  });

  const [pessoas, setPessoas] = useState<any[]>([]);
  const [produtos, setProdutos] = useState<any[]>([]);
  const [searchPessoa, setSearchPessoa] = useState('');
  const [searchProduto, setSearchProduto] = useState('');
  const [notifying, setNotifying] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const calendarRef = useRef<any>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      if (mobile !== isMobile) {
        setIsMobile(mobile);
        if (calendarRef.current) {
          const api = calendarRef.current.getApi();
          if (mobile && api.view.type !== 'timeGridDay') {
            api.changeView('timeGridDay');
            setCurrentView('timeGridDay');
          }
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isMobile]);

  useEffect(() => {
    fetchProfessionals();
    fetchPessoas();
    fetchProdutos();
  }, []);

  useEffect(() => {
    if (calendarRef.current) {
      fetchAgendamentos();
    }
  }, [selectedProfessional, selectedClient]);

  const fetchProfessionals = async () => {
    try {
      const data = await apiRequest('/api/users');
      if (Array.isArray(data)) {
        const profsOnly = data.filter((u: any) => u.is_profissional == 1 || u.is_profissional === true);
        setProfessionals(profsOnly);
        setSelectedProfessional(null); 
      }
    } catch (err) {
      setProfessionals([]);
    }
  };

  const fetchAgendamentos = async () => {
    setLoading(true);
    try {
      const formatToLocalISO = (date: Date) => {
        const pad = (n: number) => n.toString().padStart(2, '0');
        const y = date.getFullYear();
        const m = pad(date.getMonth() + 1);
        const d = pad(date.getDate());
        const h = pad(date.getHours());
        const min = pad(date.getMinutes());
        const s = pad(date.getSeconds());
        return `${y}-${m}-${d} ${h}:${min}:${s}`;
      };

      const start = calendarRef.current?.getApi().view.activeStart;
      const end = calendarRef.current?.getApi().view.activeEnd;

      let url = '/api/agenda';
      const params = new URLSearchParams();

      if (start && end) {
        params.append('start', formatToLocalISO(start));
        params.append('end', formatToLocalISO(end));
      }

      if (selectedProfessional) {
        params.append('usuario_id', selectedProfessional.id.toString());
      }

      if (selectedClient) {
        params.append('pessoa_id', selectedClient.id.toString());
      }

      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const data = await apiRequest(url);
      setAgendamentos(data);
    } catch (err: any) {
      if (!err?.message?.includes('permissão') && !err?.message?.includes('Acesso') && !err?.message?.includes('expirada')) {
        console.error('Error fetching agendamentos:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchPessoas = async () => {
    try {
      const data = await apiRequest('/api/pessoas');
      if (Array.isArray(data)) {
        setPessoas(data);
      }
    } catch (err: any) {
      if (!err?.message?.includes('permissão') && !err?.message?.includes('Acesso') && !err?.message?.includes('expirada')) {
        console.error('Error fetching pessoas:', err);
      }
      setPessoas([]);
    }
  };

  const fetchProdutos = async () => {
    try {
      const data = await apiRequest('/api/products');
      if (Array.isArray(data)) {
        setProdutos(data.filter((p: any) => p.ativo));
      }
    } catch (err: any) {
      if (!err?.message?.includes('permissão') && !err?.message?.includes('Acesso') && !err?.message?.includes('expirada')) {
        console.error('Error fetching produtos:', err);
      }
      setProdutos([]);
    }
  };

  const handleOpenEncaixeModal = () => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const now = new Date();
    const end = new Date(now.getTime() + 15 * 60000);
    
    const formatLocalDateTime = (d: Date) => {
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    setFormData({
      usuario_id: selectedProfessional?.id || user?.id || professionals[0]?.id || '',
      pessoa_id: '',
      data_inicio: formatLocalDateTime(now),
      data_fim: formatLocalDateTime(end),
      observacao: '📌 Encaixe de Agendamento',
      status: 'Pendente',
      is_encaixe: true,
      items: []
    });
    setSearchPessoa('');
    setSearchProduto('');
    setSelectedEvent(null);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSelect = (selectInfo: any) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    
    const formatLocalDateTime = (dateStr: string) => {
      const d = new Date(dateStr);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const clickedProfId = selectInfo.resource?.id 
      ? parseInt(selectInfo.resource.id) 
      : (selectedProfessional?.id || user?.id || professionals[0]?.id || '');

    setFormData({
      usuario_id: clickedProfId,
      pessoa_id: '',
      data_inicio: formatLocalDateTime(selectInfo.startStr),
      data_fim: formatLocalDateTime(selectInfo.endStr),
      observacao: '',
      status: 'Pendente',
      is_encaixe: false,
      items: []
    });
    setSearchPessoa('');
    setSearchProduto('');
    setSelectedEvent(null);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleEventClick = async (clickInfo: any) => {
    const eventId = clickInfo.event.id;
    try {
      const data = await apiRequest(`/api/agenda/${eventId}`);
      setSelectedEvent(data);
      setIsDetailsOpen(true);
    } catch (err) {
      console.error('Error fetching agenda details:', err);
      const ext = clickInfo.event.extendedProps;
      setSelectedEvent({
        id: clickInfo.event.id,
        cliente_nome: clickInfo.event.title,
        data_inicio: clickInfo.event.startStr,
        data_fim: clickInfo.event.endStr,
        status: ext.status || 'Pendente',
        profissional_nome: ext.profissional_nome,
        valor_total: ext.valor_total || 0,
        observacao: ext.observacao || '',
        items: ext.items || []
      });
      setIsDetailsOpen(true);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setFormError(null);

    if (!formData.usuario_id) {
      setFormError('Selecione um profissional responsável.');
      return;
    }

    if (!formData.pessoa_id) {
      setFormError('Selecione um cliente para o agendamento.');
      return;
    }

    if (!formData.data_inicio || !formData.data_fim) {
      setFormError('Informe a data de início e fim do agendamento.');
      return;
    }

    if (new Date(formData.data_inicio) >= new Date(formData.data_fim)) {
      setFormError('A data/hora de fim deve ser posterior à data/hora de início.');
      return;
    }

    const calculatedTotal = formData.items.reduce((acc, i) => acc + (parseFloat(i.subtotal as any) || 0), 0);
    const payload = {
      ...formData,
      valor_total: calculatedTotal
    };

    setIsSaving(true);
    try {
      if (selectedEvent) {
        await apiRequest(`/api/agenda/${selectedEvent.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        setToast({ message: 'Agendamento atualizado com sucesso!', type: 'success' });
      } else {
        await apiRequest('/api/agenda', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        setToast({ message: 'Agendamento criado com sucesso!', type: 'success' });
      }

      setIsModalOpen(false);
      fetchAgendamentos();
    } catch (err: any) {
      const errorMsg = typeof err === 'string' ? err : (err?.error || err?.message || 'Erro ao salvar agendamento');
      setFormError(errorMsg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateStatus = async (id: number, status: string) => {
    try {
      await apiRequest(`/api/agenda/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status })
      });
      
      fetchAgendamentos();
      if (isDetailsOpen && selectedEvent) {
        setSelectedEvent({ ...selectedEvent, status });
      }
      setToast({ message: 'Status atualizado com sucesso!', type: 'success' });
    } catch (err: any) {
      const errorMsg = typeof err === 'string' ? err : (err?.error || err?.message || 'Erro ao atualizar status');
      setToast({ message: errorMsg, type: 'error' });
    }
  };

  const handleConcluir = async (id: number) => {
    try {
      const data = await apiRequest(`/api/agenda/${id}/concluir`, { method: 'POST' });
      setToast({ message: 'Venda gerada com sucesso! Redirecionando...', type: 'success' });
      setTimeout(() => {
        window.location.href = `/vendas?id=${data.sequencial_id}&pay=true`;
      }, 500);
    } catch (err: any) {
      const errorMsg = typeof err === 'string' ? err : (err?.error || err?.message || 'Erro ao concluir agendamento');
      setToast({ message: errorMsg, type: 'error' });
    }
  };

  const handleNotify = async (id: number, type: 'whatsapp' | 'email') => {
    setNotifying(type);
    try {
      const data = await apiRequest(`/api/agenda/${id}/notify/${type}`, { method: 'POST' });
      setToast({ message: data.message || 'Notificação enviada com sucesso!', type: 'success' });
    } catch (err: any) {
      const errorMsg = typeof err === 'string' ? err : (err?.error || err?.message || 'Erro ao enviar notificação');
      setToast({ message: errorMsg, type: 'error' });
    } finally {
      setNotifying(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Confirmado': return 'bg-emerald-500/10 text-emerald-700 border-emerald-300/60';
      case 'Check-in Realizado': return 'bg-indigo-500/10 text-indigo-700 border-indigo-300/60';
      case 'Concluido': return 'bg-blue-500/10 text-blue-700 border-blue-300/60';
      case 'Cancelado': return 'bg-rose-500/10 text-rose-700 border-rose-300/60';
      default: return 'bg-amber-500/10 text-amber-700 border-amber-300/60';
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Confirmado': return 'bg-emerald-500 text-white shadow-sm';
      case 'Check-in Realizado': return 'bg-indigo-600 text-white shadow-sm';
      case 'Concluido': return 'bg-blue-600 text-white shadow-sm';
      case 'Cancelado': return 'bg-rose-600 text-white shadow-sm';
      default: return 'bg-amber-500 text-white shadow-sm';
    }
  };

  // Get initials for professional avatar
  const getInitials = (name: string) => {
    if (!name) return 'P';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  };

  // Professional avatar background color palette
  const getAvatarColor = (idx: number) => {
    const colors = [
      'bg-indigo-600 text-white',
      'bg-emerald-600 text-white',
      'bg-purple-600 text-white',
      'bg-amber-600 text-white',
      'bg-rose-600 text-white',
      'bg-cyan-600 text-white',
      'bg-pink-600 text-white'
    ];
    return colors[idx % colors.length];
  };

  const handleExitFullScreen = () => {
    navigate('/home');
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-50 flex flex-col h-screen overflow-hidden">
      <style>{`
        .fc {
          --fc-border-color: #f1f5f9;
          --fc-page-bg-color: #ffffff;
          --fc-neutral-bg-color: #f8fafc;
          --fc-neutral-text-color: #64748b;
          --fc-today-bg-color: #f1f5f9/40;
          --fc-event-bg-color: transparent;
          --fc-event-border-color: transparent;
          --fc-button-bg-color: #4f46e5;
          --fc-button-border-color: #4f46e5;
          --fc-button-hover-bg-color: #4338ca;
          --fc-button-hover-border-color: #4338ca;
          --fc-button-active-bg-color: #3730a3;
          --fc-button-active-border-color: #3730a3;
          --fc-event-text-color: inherit;
          font-family: inherit;
        }
        .fc-toolbar {
          padding: 8px 12px !important;
          margin-bottom: 8px !important;
          background: #ffffff;
          border-radius: 1rem;
          border: 1px solid #f1f5f9;
        }
        .fc-toolbar-title {
          font-size: 1.1rem !important;
          font-weight: 800 !important;
          color: #0f172a !important;
          letter-spacing: -0.02em;
        }
        .fc-button {
          border-radius: 0.75rem !important;
          font-weight: 700 !important;
          font-size: 0.825rem !important;
          padding: 0.4rem 0.8rem !important;
          box-shadow: none !important;
          transition: all 0.2s ease;
        }
        .fc-col-header-cell-cushion {
          font-weight: 800;
          color: #475569;
          text-transform: uppercase;
          font-size: 0.725rem;
          padding: 2px 4px !important;
          letter-spacing: 0.05em;
        }
        .fc-theme-standard .fc-scrollgrid-section-header th {
          padding: 0 !important;
        }
        .fc-timegrid-slot-label-cushion {
          font-family: inherit;
          font-size: 0.725rem;
          color: #94a3b8;
          font-weight: 600;
        }
        .fc-timegrid-slot {
          height: 3.2rem !important;
        }
        .fc-timegrid-axis-cushion {
          font-family: inherit;
          font-size: 0.725rem;
          color: #475569;
          font-weight: 800;
          text-transform: lowercase;
        }
        @media (max-width: 640px) {
          .fc-toolbar {
            flex-direction: row !important;
            flex-wrap: nowrap !important;
            gap: 0.25rem !important;
            justify-content: space-between !important;
            align-items: center;
            padding: 6px 8px !important;
          }
          .fc-toolbar-title {
            font-size: 0.875rem !important;
            margin: 0 !important;
          }
          .fc-button {
            padding: 0.25rem 0.5rem !important;
            font-size: 0.725rem !important;
          }
        }
        .fc-event {
          border: none !important;
          background: transparent !important;
          padding: 1px !important;
        }
        .fc-event-main {
          padding: 0;
          height: 100%;
        }
      `}</style>

      {/* TOP APPLICATION BAR */}
      <header className="bg-white border-b border-slate-200/80 px-3 sm:px-4 py-2 sm:py-2.5 shrink-0 shadow-sm z-30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
        {/* Top Row on Mobile / Left Section on Desktop */}
        <div className="flex items-center justify-between gap-2 w-full sm:w-auto">
          {/* Back & Title */}
          <div className="flex items-center gap-2 shrink-0">
            <button 
              onClick={handleExitFullScreen}
              className="p-1.5 sm:p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-2xl transition-colors flex items-center gap-1.5 font-bold text-sm cursor-pointer"
              title="Fechar e voltar"
            >
              <ArrowLeft className="w-5 h-5 text-slate-700" />
              <span className="hidden sm:inline">Voltar</span>
            </button>
            <div className="h-6 w-px bg-slate-200 hidden lg:block" />
            <div className="hidden lg:flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black shadow-xs shadow-indigo-100 shrink-0">
                <CalendarIcon className="w-4 h-4" />
              </div>
              <h1 className="text-base font-black text-slate-900 tracking-tight leading-tight">
                Agenda
              </h1>
            </div>
          </div>

          {/* Professional Filter Selector (Mobile Top Row Middle) */}
          <div className="flex sm:hidden flex-1 items-center gap-1 bg-slate-100 px-2 py-1.5 rounded-xl border border-slate-200/60 min-w-0">
            <User className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <select
              value={selectedProfessional?.id || ''}
              onChange={(e) => {
                const val = e.target.value;
                if (!val) {
                  setSelectedProfessional(null);
                } else {
                  const found = professionals.find(p => p.id.toString() === val);
                  setSelectedProfessional(found || null);
                }
              }}
              className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer w-full truncate"
            >
              <option value="">Todos ({professionals.length})</option>
              {professionals.map(p => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </div>

          {/* Quick Actions (Hoje, Encaixe & Novo) on Mobile Top Row Right */}
          <div className="flex items-center gap-1.5 sm:hidden shrink-0">
            <button
              onClick={() => {
                if (calendarRef.current) {
                  calendarRef.current.getApi().today();
                }
              }}
              className="px-2 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-bold text-xs transition-all flex items-center gap-1 cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5 text-indigo-600" />
              <span>Hoje</span>
            </button>
            <button 
              onClick={handleOpenEncaixeModal}
              className="bg-amber-500 text-white px-2 py-1.5 rounded-xl font-black text-xs hover:bg-amber-600 transition-all shadow-sm shadow-amber-100 flex items-center gap-1 shrink-0 cursor-pointer"
              title="Novo Encaixe Rápido"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Encaixe</span>
            </button>
            <button 
              onClick={() => {
                const pad = (n: number) => n.toString().padStart(2, '0');
                const now = new Date();
                const end = new Date(now.getTime() + 30 * 60000);
                
                const formatLocalDateTime = (d: Date) => {
                  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                };

                setFormData({
                  usuario_id: selectedProfessional?.id || user?.id || professionals[0]?.id || '',
                  pessoa_id: '',
                  data_inicio: formatLocalDateTime(now),
                  data_fim: formatLocalDateTime(end),
                  observacao: '',
                  status: 'Pendente',
                  is_encaixe: false,
                  items: []
                });
                setSearchPessoa('');
                setSearchProduto('');
                setSelectedEvent(null);
                setFormError(null);
                setIsModalOpen(true);
              }}
              className="bg-indigo-600 text-white px-2 py-1.5 rounded-xl font-bold text-xs hover:bg-indigo-700 transition-all shadow-sm shadow-indigo-100 flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Novo</span>
            </button>
          </div>
        </div>

        {/* Second Row on Mobile (Client Filter Full Width) / Right Controls on Desktop */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Today Jump Button (Desktop) */}
          <button
            onClick={() => {
              if (calendarRef.current) {
                calendarRef.current.getApi().today();
              }
            }}
            className="hidden sm:flex px-3 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-bold text-xs transition-all items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Clock className="w-4 h-4 text-indigo-600" />
            <span>Hoje</span>
          </button>

          {/* Professional Filter Selector (Desktop) */}
          <div className="hidden sm:flex items-center gap-1 bg-slate-100 px-2.5 py-1.5 rounded-xl border border-slate-200/60 min-w-0">
            <User className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <select
              value={selectedProfessional?.id || ''}
              onChange={(e) => {
                const val = e.target.value;
                if (!val) {
                  setSelectedProfessional(null);
                } else {
                  const found = professionals.find(p => p.id.toString() === val);
                  setSelectedProfessional(found || null);
                }
              }}
              className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer max-w-[140px] truncate"
            >
              <option value="">Profissional: Todos ({professionals.length})</option>
              {professionals.map(p => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </div>

          {/* Intelligent Client Search Combobox (Full width on Mobile Row 2) */}
          <div className="w-full sm:w-auto min-w-0 flex-1 sm:flex-initial">
            <ClientFilterCombobox
              selectedClient={selectedClient}
              onSelectClient={setSelectedClient}
              pessoas={pessoas}
            />
          </div>

          {/* Encaixe Quick Button (Desktop) */}
          <button
            onClick={handleOpenEncaixeModal}
            className="hidden sm:flex bg-amber-500 text-white px-3 sm:px-4 py-2.5 rounded-2xl font-black text-xs sm:text-sm hover:bg-amber-600 transition-all shadow-md shadow-amber-200 items-center justify-center gap-1.5 shrink-0 cursor-pointer"
            title="Agendar Encaixe Rápido"
          >
            <Zap className="w-4 h-4" />
            <span>Encaixe</span>
          </button>

          {/* New Appointment Button (Desktop) */}
          <button 
            onClick={() => {
              const pad = (n: number) => n.toString().padStart(2, '0');
              const now = new Date();
              const end = new Date(now.getTime() + 30 * 60000);
              
              const formatLocalDateTime = (d: Date) => {
                return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
              };

              setFormData({
                usuario_id: selectedProfessional?.id || user?.id || professionals[0]?.id || '',
                pessoa_id: '',
                data_inicio: formatLocalDateTime(now),
                data_fim: formatLocalDateTime(end),
                observacao: '',
                status: 'Pendente',
                is_encaixe: false,
                items: []
              });
              setSearchPessoa('');
              setSearchProduto('');
              setSelectedEvent(null);
              setFormError(null);
              setIsModalOpen(true);
            }}
            className="hidden sm:flex bg-indigo-600 text-white px-3.5 sm:px-5 py-2.5 rounded-2xl font-bold text-xs sm:text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 items-center justify-center gap-2 shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
            <span>Novo Agendamento</span>
          </button>
        </div>
      </header>

      {/* MAIN CALENDAR CANVAS */}
      <div className="flex-1 bg-white overflow-hidden p-2 sm:p-3 relative flex flex-col">
        {loading && (
          <div className="absolute top-4 right-4 z-30 bg-white/90 backdrop-blur-xs px-3 py-1.5 rounded-full border border-slate-200 shadow-md flex items-center gap-2 text-xs font-bold text-indigo-600">
            <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
            Carregando agenda...
          </div>
        )}

        <FullCalendar
          ref={calendarRef}
          schedulerLicenseKey="GPL-My-Project-Is-Open-Source"
          plugins={[timeGridPlugin, interactionPlugin, dayGridPlugin, resourceTimeGridPlugin]}
          initialView="resourceTimeGridDay"
          initialDate={new Date()}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: isMobile ? '' : 'dayGridMonth,resourceTimeGridWeek,resourceTimeGridDay'
          }}
          locale={ptBrLocale}
          editable={true}
          selectable={true}
          selectMirror={true}
          dayMaxEvents={true}
          weekends={true}
          nowIndicator={true}
          scrollTime={formatTime(new Date()) + ':00'}
          height="100%"
          slotMinTime="06:00:00"
          slotMaxTime="23:00:00"
          slotDuration="00:15:00"
          slotLabelInterval="00:30:00"
          allDaySlot={false}
          resources={
            (selectedProfessional ? [selectedProfessional] : professionals).map((prof, idx) => ({
              id: prof.id.toString(),
              title: prof.nome,
              foto: prof.avatar || prof.foto || (prof.id === user?.id ? user?.avatar : null),
              avatarIdx: idx
            }))
          }
          resourceLabelContent={(arg) => {
            const profName = arg.resource?.title || arg.resource?._def?.title || '';
            const extendedProps = arg.resource?.extendedProps || arg.resource?._def?.extendedProps || {};
            const foto = extendedProps.foto;
            const avatarIdx = extendedProps.avatarIdx || 0;

            return (
              <div className="flex items-center justify-center gap-1.5 py-0.5 px-1.5 w-full">
                {foto ? (
                  <img 
                    src={foto} 
                    alt={profName} 
                    className="w-[26px] h-[26px] rounded-full object-cover border border-indigo-200 shrink-0 shadow-2xs" 
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className={`w-[26px] h-[26px] rounded-full flex items-center justify-center font-black text-[10px] shrink-0 text-white shadow-2xs ${getAvatarColor(avatarIdx)}`}>
                    {getInitials(profName)}
                  </div>
                )}
                <span className="font-bold text-[11px] text-slate-800 truncate max-w-[120px] leading-tight">{profName}</span>
              </div>
            );
          }}
          resourceHeaderContent={(arg) => {
            const profName = arg.resource?.title || arg.resource?._def?.title || '';
            const extendedProps = arg.resource?.extendedProps || arg.resource?._def?.extendedProps || {};
            const foto = extendedProps.foto;
            const avatarIdx = extendedProps.avatarIdx || 0;

            return (
              <div className="flex items-center justify-center gap-1.5 py-0.5 px-1.5 w-full">
                {foto ? (
                  <img 
                    src={foto} 
                    alt={profName} 
                    className="w-[26px] h-[26px] rounded-full object-cover border border-indigo-200 shrink-0 shadow-2xs" 
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className={`w-[26px] h-[26px] rounded-full flex items-center justify-center font-black text-[10px] shrink-0 text-white shadow-2xs ${getAvatarColor(avatarIdx)}`}>
                    {getInitials(profName)}
                  </div>
                )}
                <span className="font-bold text-[11px] text-slate-800 truncate max-w-[120px] leading-tight">{profName}</span>
              </div>
            );
          }}
          slotLabelFormat={{
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          }}
          titleFormat={
            isMobile 
              ? { month: 'short', day: 'numeric', year: 'numeric' } 
              : { day: 'numeric', month: 'long', year: 'numeric' }
          }
          datesSet={() => fetchAgendamentos()}
          events={agendamentos.map(ag => ({
            id: ag.id.toString(),
            resourceId: ag.usuario_id ? ag.usuario_id.toString() : (professionals[0]?.id?.toString() || ''),
            title: ag.cliente_nome || 'Cliente não informado',
            start: ag.data_inicio.replace(' ', 'T'),
            end: ag.data_fim.replace(' ', 'T'),
            extendedProps: { ...ag, colorCategory: getStatusColor(ag.status) }
          }))}
          eventContent={(info) => {
            const profName = info.event.extendedProps.profissional_nome?.trim() || 'Sem Profissional';
            const clientName = info.event.title || 'Cliente não informado';
            const status = info.event.extendedProps.status || 'Pendente';
            const isEncaixe = Boolean(info.event.extendedProps.is_encaixe);

            return (
              <div 
                className={`w-full h-full p-1.5 sm:p-2 rounded-xl border-l-4 shadow-xs flex flex-col justify-start overflow-hidden transition-all hover:brightness-95 ${
                  isEncaixe 
                    ? 'bg-amber-100/90 text-amber-950 border-amber-500 font-medium' 
                    : (info.event.extendedProps.colorCategory || 'bg-indigo-50 text-indigo-700 border-indigo-500')
                }`} 
                style={{ borderLeftColor: isEncaixe ? '#f59e0b' : 'currentColor' }}
              >
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <div className="flex items-center gap-1 min-w-0">
                    {isEncaixe && (
                      <span className="px-1 py-0.2 rounded bg-amber-500 text-white font-black text-[8px] uppercase tracking-wider shrink-0 flex items-center gap-0.5 shadow-2xs">
                        <Zap className="w-2 h-2" /> ENCAIXE
                      </span>
                    )}
                    <span className="text-[10px] font-black uppercase tracking-wider opacity-85 leading-none truncate">
                      {info.timeText}
                    </span>
                  </div>
                  <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-extrabold uppercase leading-none shrink-0 ${getStatusBadgeClass(status)}`}>
                    {status.charAt(0)}
                  </span>
                </div>
                <p className="text-xs leading-tight truncate" title={`${profName} | ${clientName}${isEncaixe ? ' (Encaixe)' : ''}`}>
                  <span className="font-extrabold opacity-90">{profName}</span>
                  <span className="mx-1 text-slate-400 font-normal">|</span>
                  <span className="text-slate-900 font-bold">{clientName}</span>
                </p>
              </div>
            );
          }}
          select={handleSelect}
          eventClick={handleEventClick}
          eventDrop={async (info) => {
            const { event, newResource } = info;
            const isEncaixe = Boolean(event.extendedProps.is_encaixe);
            if (!isEncaixe && new Date(event.startStr) < new Date()) {
              setToast({ message: "Para mover para horários passados, edite o agendamento e ative a opção 'Encaixe'.", type: 'error' });
              info.revert();
              return;
            }
            try {
              const targetProfId = newResource?.id ? parseInt(newResource.id) : undefined;
              await apiRequest(`/api/agenda/${event.id}`, {
                method: 'PUT',
                body: JSON.stringify({
                  data_inicio: event.startStr.split('.')[0],
                  data_fim: event.endStr?.split('.')[0],
                  ...(targetProfId ? { usuario_id: targetProfId } : {})
                })
              });
              fetchAgendamentos();
              setToast({ message: "Horário reagendado com sucesso!", type: 'success' });
            } catch (err) {
              info.revert();
            }
          }}
          eventResize={async (info) => {
            const { event } = info;
            const isEncaixe = Boolean(event.extendedProps.is_encaixe);
            if (!isEncaixe && new Date(event.startStr) < new Date()) {
              setToast({ message: "Para alterar agendamentos no passado, ative a opção 'Encaixe'.", type: 'error' });
              info.revert();
              return;
            }
            try {
              await apiRequest(`/api/agenda/${event.id}`, {
                method: 'PUT',
                body: JSON.stringify({
                  data_inicio: event.startStr.split('.')[0],
                  data_fim: event.endStr?.split('.')[0]
                })
              });
              fetchAgendamentos();
              setToast({ message: "Duração do agendamento atualizada!", type: 'success' });
            } catch (err) {
              info.revert();
            }
          }}
        />
      </div>

      {/* MODAL NOVO / EDITAR AGENDAMENTO */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs"
            />
            <motion.div 
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="relative bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[88vh] z-10"
            >
              {/* Modal Header */}
              <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                    <Scissors className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                      {selectedEvent ? 'Editar Agendamento' : 'Novo Agendamento'}
                    </h2>
                    <p className="text-xs text-slate-400 font-medium">Preencha os dados do atendimento</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)} 
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-700"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Form Body */}
              <form onSubmit={handleSave} className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 bg-slate-50/50">
                {formError && (
                  <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-3 text-rose-700 font-bold text-xs sm:text-sm shadow-xs">
                    <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
                    <span>{formError}</span>
                  </div>
                )}

                {/* Section: Opção de Encaixe de Agendamento */}
                <div className={`p-4 rounded-2xl border transition-all ${formData.is_encaixe ? 'bg-amber-500/10 border-amber-400 shadow-xs' : 'bg-white border-slate-200/80'}`}>
                  <div className="flex items-center justify-between cursor-pointer" onClick={() => setFormData(prev => ({ ...prev, is_encaixe: !prev.is_encaixe }))}>
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black transition-all ${formData.is_encaixe ? 'bg-amber-500 text-white shadow-sm' : 'bg-amber-100 text-amber-700'}`}>
                        <Zap className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-slate-900">Agendamento de Encaixe</span>
                          {formData.is_encaixe && (
                            <span className="px-2 py-0.5 bg-amber-500 text-white rounded-md text-[10px] font-black uppercase tracking-wider">
                              Ativado
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 font-medium">
                          Permite fazer agendamentos com horários reduzidos ou sobreposição de agenda
                        </p>
                      </div>
                    </div>
                    <input 
                      type="checkbox"
                      checked={formData.is_encaixe}
                      onChange={(e) => setFormData({ ...formData, is_encaixe: e.target.checked })}
                      className="w-5 h-5 rounded-md text-amber-600 focus:ring-amber-500 border-amber-300 cursor-pointer"
                    />
                  </div>

                  {formData.is_encaixe && (
                    <div className="mt-3 pt-3 border-t border-amber-200/80 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-amber-900 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> Duração rápida do Encaixe:
                      </span>
                      <div className="flex items-center gap-1.5">
                        {[10, 15, 20, 30].map((mins) => (
                          <button
                            key={mins}
                            type="button"
                            onClick={() => {
                              if (!formData.data_inicio) return;
                              const startD = new Date(formData.data_inicio);
                              const endD = new Date(startD.getTime() + mins * 60000);
                              const pad = (n: number) => n.toString().padStart(2, '0');
                              const formatLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                              setFormData({ ...formData, data_fim: formatLocal(endD) });
                            }}
                            className="px-2.5 py-1 bg-white hover:bg-amber-100 text-amber-900 rounded-lg text-xs font-black border border-amber-300 transition-all shadow-2xs"
                          >
                            {mins} min
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Section 1: Responsável & Status */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Profissional Responsável</span>
                    </label>
                    <select 
                      required
                      className="w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-bold text-slate-800 text-sm transition-all"
                      value={formData.usuario_id}
                      onChange={(e) => setFormData({ ...formData, usuario_id: e.target.value })}
                    >
                      <option value="">Selecione o Profissional...</option>
                      {professionals.map(p => (
                        <option key={p.id} value={p.id}>{p.nome}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Status do Agendamento</span>
                    </label>
                    <select 
                      className={`w-full px-3.5 py-3 border rounded-xl focus:ring-2 focus:ring-indigo-500 font-bold text-sm transition-all ${
                        formData.status === 'Concluido' ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 
                        formData.status === 'Cancelado' ? 'bg-rose-50 border-rose-300 text-rose-800' : 'bg-slate-50 border-slate-200 text-slate-800'
                      }`}
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    >
                      <option value="Pendente">🟡 Pendente</option>
                      <option value="Confirmado">🟢 Confirmado</option>
                      <option value="Check-in Realizado">🔵 Check-in Realizado</option>
                      <option value="Concluido">✅ Finalizado (Abrir Pagamento)</option>
                      <option value="Cancelado">🔴 Cancelado</option>
                    </select>
                  </div>
                </div>

                {/* Section 2: Cliente & Datas */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
                  {/* Client Search */}
                  <div className="space-y-1.5 col-span-1 sm:col-span-2">
                    <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Search className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Cliente</span>
                    </label>
                    <div className="relative">
                      <input 
                        type="text"
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium text-sm transition-all"
                        placeholder="Digite para buscar nome ou telefone..."
                        value={searchPessoa}
                        onChange={(e) => setSearchPessoa(e.target.value)}
                      />
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      
                      {searchPessoa && searchPessoa !== pessoas.find(p => p.id === formData.pessoa_id)?.nome && (
                        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-xl border border-slate-200 shadow-xl z-30 max-h-48 overflow-y-auto">
                          {pessoas
                            .filter(p => 
                              p.ativo === 1 && 
                              (p.tipo_pessoa === 'cliente' || p.tipo_pessoa === 'ambos') &&
                              (
                                p.nome.toLowerCase().includes(searchPessoa.toLowerCase()) ||
                                (p.sequencial_id && p.sequencial_id.toString().includes(searchPessoa)) ||
                                p.id.toString().includes(searchPessoa) ||
                                (p.telefone && p.telefone.includes(searchPessoa))
                              )
                            )
                            .map(p => (
                            <button
                              key={p.id}
                              type="button"
                              className="w-full text-left px-4 py-2.5 hover:bg-indigo-50/70 transition-colors flex items-center justify-between border-b border-slate-100 last:border-0"
                              onClick={() => {
                                setFormData({ ...formData, pessoa_id: p.id });
                                setSearchPessoa(p.nome);
                              }}
                            >
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-black text-xs">
                                  {p.nome.charAt(0)}
                                </div>
                                <div>
                                  <p className="font-bold text-slate-900 text-xs">{p.nome}</p>
                                  <p className="text-[10px] text-slate-500">{p.telefone || 'Sem telefone'}</p>
                                </div>
                              </div>
                              <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">Selecionar</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Dates */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Início</span>
                    </label>
                    <input 
                      type="datetime-local" 
                      required
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-bold text-xs sm:text-sm text-slate-800"
                      value={formData.data_inicio}
                      onChange={(e) => {
                        const newStart = e.target.value;
                        let newEnd = formData.data_fim;
                        if (newStart) {
                          const startDate = new Date(newStart);
                          if (!isNaN(startDate.getTime())) {
                            const endDate = new Date(startDate.getTime() + 60 * 60000);
                            const pad = (n: number) => n.toString().padStart(2, '0');
                            newEnd = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}T${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`;
                          }
                        }
                        setFormData(prev => ({
                          ...prev,
                          data_inicio: newStart,
                          data_fim: newEnd
                        }));
                      }}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Fim</span>
                    </label>
                    <input 
                      type="datetime-local" 
                      required
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-bold text-xs sm:text-sm text-slate-800"
                      value={formData.data_fim}
                      onChange={(e) => setFormData({ ...formData, data_fim: e.target.value })}
                    />
                  </div>
                </div>

                {/* Section 3: Serviços e Produtos */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
                  <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Serviços e Produtos Adicionados</span>
                  </label>

                  <div className="relative">
                    <input 
                      type="text"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium text-xs sm:text-sm"
                      placeholder="Adicionar serviço ou produto..."
                      value={searchProduto}
                      onChange={(e) => setSearchProduto(e.target.value)}
                    />
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

                    {searchProduto && (
                      <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-xl border border-slate-200 shadow-xl z-30 max-h-48 overflow-y-auto">
                        {produtos.filter(p => (
                          p.nome.toLowerCase().includes(searchProduto.toLowerCase()) ||
                          (p.sequencial_id && p.sequencial_id.toString().includes(searchProduto)) ||
                          p.id.toString().includes(searchProduto)
                        )).map(p => (
                          <button
                            key={p.id}
                            type="button"
                            className="w-full text-left px-4 py-2 hover:bg-slate-50 transition-colors flex items-center justify-between border-b border-slate-100 last:border-0"
                            onClick={() => {
                              const existing = formData.items.find(i => i.produto_id === p.id);
                              if (!existing) {
                                const unitPrice = parseFloat(p.preco_venda as any) || 0;
                                setFormData({
                                  ...formData,
                                  items: [...formData.items, {
                                    produto_id: p.id,
                                    nome: p.nome,
                                    quantidade: 1,
                                    preco_unitario: unitPrice,
                                    subtotal: unitPrice,
                                    tempo_execucao: p.tempo_execucao
                                  }]
                                });
                              }
                              setSearchProduto('');
                            }}
                          >
                            <div>
                              <p className="font-bold text-slate-900 text-xs">{p.nome}</p>
                              <p className="text-[10px] text-slate-500">{p.tipo === 'servico' ? `Serviço • ${p.tempo_execucao || 0} min` : 'Produto'}</p>
                            </div>
                            <p className="font-bold text-indigo-600 text-xs">{formatMoney(p.preco_venda)}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Added Items List */}
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {formData.items.length === 0 ? (
                      <p className="text-center py-4 text-xs font-bold text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        Nenhum serviço ou produto adicionado.
                      </p>
                    ) : (
                      formData.items.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
                          <div className="flex-1 min-w-[100px]">
                            <p className="font-bold text-slate-900 text-xs truncate">{item.nome}</p>
                            <p className="text-[10px] text-slate-500">{item.tempo_execucao ? `${item.tempo_execucao} min` : 'Sem tempo definido'}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <input 
                              type="number"
                              min="1"
                              className="w-14 bg-white border border-slate-200 rounded-lg text-xs text-center py-1 font-bold"
                              value={item.quantidade}
                              onChange={(e) => {
                                const q = parseFloat(e.target.value) || 0;
                                const unitPrice = parseFloat(item.preco_unitario as any) || 0;
                                const newItems = [...formData.items];
                                newItems[idx].quantidade = q;
                                newItems[idx].subtotal = q * unitPrice;
                                setFormData({ ...formData, items: newItems });
                              }}
                            />
                            <p className="font-bold text-slate-900 text-xs w-16 text-right">
                              {formatMoney(item.subtotal)}
                            </p>
                            <button 
                              type="button" 
                              onClick={() => setFormData({ ...formData, items: formData.items.filter((_, i) => i !== idx) })}
                              className="text-slate-400 hover:text-rose-600 p-1 rounded-md transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Total Bar */}
                  <div className="flex items-center justify-between pt-2 px-1 border-t border-slate-100">
                    <p className="text-xs font-bold text-slate-500">Valor Total Estimado</p>
                    <p className="text-lg font-black text-indigo-600">
                      {formatMoney(formData.items.reduce((acc, i) => acc + (parseFloat(i.subtotal as any) || 0), 0))}
                    </p>
                  </div>
                </div>

                {/* Section 4: Observações */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Observações Internas</label>
                  <textarea 
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium text-xs min-h-[70px]"
                    placeholder="Instruções ou preferências do cliente..."
                    value={formData.observacao || ''}
                    onChange={(e) => setFormData({ ...formData, observacao: e.target.value })}
                  />
                </div>

                {/* Sticky Action Footer */}
                <div className="bg-white pt-3 pb-2 flex items-center justify-end gap-3 sticky bottom-0 z-10 border-t border-slate-100">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-bold text-xs hover:bg-slate-50 transition-all"
                  >
                    Descartar
                  </button>
                  <button 
                    type="submit"
                    disabled={isSaving}
                    className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Salvando...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>Salvar Agendamento</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* SLIDE-OVER DE DETALHES DO AGENDAMENTO */}
      <AnimatePresence>
        {isDetailsOpen && selectedEvent && (
          <div className="fixed inset-0 z-[110] flex justify-end overflow-hidden">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDetailsOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 220 }}
              className="relative w-full max-w-md bg-white shadow-2xl flex flex-col h-full z-10"
            >
              {/* Top Banner & Header */}
              <div className="p-6 border-b border-slate-100 bg-white sticky top-0 z-20">
                <div className="flex items-center justify-between mb-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${getStatusBadgeClass(selectedEvent.status)}`}>
                    {selectedEvent.status}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button 
                      onClick={() => {
                        const formatForInput = (dateStr: string) => {
                          if (!dateStr) return '';
                          return dateStr.replace(' ', 'T').substring(0, 16);
                        };
                        setFormData({
                          usuario_id: selectedEvent.usuario_id,
                          pessoa_id: selectedEvent.pessoa_id || '',
                          data_inicio: formatForInput(selectedEvent.data_inicio),
                          data_fim: formatForInput(selectedEvent.data_fim),
                          observacao: selectedEvent.observacao || '',
                          status: selectedEvent.status || 'Pendente',
                          is_encaixe: Boolean(selectedEvent.is_encaixe),
                          items: (selectedEvent.items || []).map((item: any) => ({
                            ...item,
                            quantidade: parseFloat(item.quantidade) || 1,
                            preco_unitario: parseFloat(item.preco_unitario) || 0,
                            subtotal: parseFloat(item.subtotal) || 0
                          }))
                        });
                        setSearchPessoa(selectedEvent.cliente_nome || '');
                        setIsDetailsOpen(false);
                        setIsModalOpen(true);
                      }}
                      className="p-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-all"
                      title="Editar Agendamento"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setIsDetailsOpen(false)}
                      className="p-2 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-all"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Client Profile Summary */}
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-lg font-black shadow-md shadow-indigo-100 shrink-0">
                    {(selectedEvent.cliente_nome || '?').charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-black text-slate-900 leading-snug truncate">
                      {selectedEvent.cliente_nome || 'Consumidor Final'}
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 text-slate-500 text-xs font-medium mt-1">
                      {selectedEvent.cliente_telefone && (
                        <div className="flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span>{selectedEvent.cliente_telefone}</span>
                        </div>
                      )}
                      {selectedEvent.cliente_email && (
                        <div className="flex items-center gap-1">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          <span className="truncate max-w-[140px]">{selectedEvent.cliente_email}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Details Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
                {selectedEvent.is_encaixe && (
                  <div className="p-3.5 bg-amber-500/10 border border-amber-300 rounded-2xl flex items-center gap-3 text-amber-900 font-bold text-xs shadow-2xs">
                    <Zap className="w-5 h-5 text-amber-600 shrink-0" />
                    <div>
                      <p className="font-black text-amber-950">Agendamento de Encaixe</p>
                      <p className="text-[11px] text-amber-800 font-medium">Este atendimento foi agendado em horário de encaixe rápido.</p>
                    </div>
                  </div>
                )}

                {/* Time & Professional Card */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Horário</p>
                    <p className="font-bold text-slate-900 text-sm">
                      {formatTime(selectedEvent.data_inicio)} - {formatTime(selectedEvent.data_fim)}
                    </p>
                    <p className="text-[11px] text-slate-500 font-medium mt-0.5">{formatDate(selectedEvent.data_inicio)}</p>
                  </div>

                  <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Profissional</p>
                    <p className="font-bold text-slate-900 text-sm truncate">{selectedEvent.profissional_nome}</p>
                    <p className="text-[11px] text-slate-500 font-medium mt-0.5">Responsável</p>
                  </div>
                </div>

                {/* Items & Services */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
                  <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Itens e Serviços</p>
                  <div className="space-y-2">
                    {selectedEvent.items?.map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center p-2.5 bg-slate-50 rounded-xl text-xs border border-slate-100">
                        <div>
                          <p className="font-bold text-slate-900">{item.nome}</p>
                          <p className="text-[10px] text-slate-500">{item.quantidade} x {formatMoney(item.preco_unitario)}</p>
                        </div>
                        <p className="font-black text-slate-900">{formatMoney(item.subtotal)}</p>
                      </div>
                    ))}
                    <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                      <p className="text-xs font-bold text-slate-500">Total do Atendimento</p>
                      <p className="text-lg font-black text-indigo-600">
                        {formatMoney(
                          selectedEvent.items && selectedEvent.items.length > 0
                            ? selectedEvent.items.reduce((acc: number, i: any) => acc + (parseFloat(i.subtotal) || 0), 0)
                            : (parseFloat(selectedEvent.valor_total) || 0)
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Observações */}
                {selectedEvent.observacao && (
                  <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-1">
                    <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Observações</p>
                    <p className="text-xs text-slate-700 leading-relaxed">{selectedEvent.observacao}</p>
                  </div>
                )}

                {/* Notifications Actions (CONDICIONAL WHATSAPP: APENAS SE PLANO CONTEMPLAR) */}
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Notificar Cliente</p>
                  <div className={`grid ${hasWhatsAppModule ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
                    {/* Botão de WhatsApp exibido APENAS se o plano contemplar 'lembrete_whatsapp' */}
                    {hasWhatsAppModule && (
                      <button 
                        disabled={notifying === 'whatsapp'}
                        onClick={() => handleNotify(selectedEvent.id, 'whatsapp')}
                        className="flex items-center justify-center gap-2 py-2.5 px-3 bg-emerald-50 text-emerald-700 font-bold rounded-xl hover:bg-emerald-100 transition-all border border-emerald-200 text-xs disabled:opacity-50"
                      >
                        <MessageSquare className="w-4 h-4 text-emerald-600" />
                        <span>WhatsApp</span>
                      </button>
                    )}

                    <button 
                      disabled={notifying === 'email'}
                      onClick={() => handleNotify(selectedEvent.id, 'email')}
                      className="flex items-center justify-center gap-2 py-2.5 px-3 bg-blue-50 text-blue-700 font-bold rounded-xl hover:bg-blue-100 transition-all border border-blue-200 text-xs disabled:opacity-50"
                    >
                      <Mail className="w-4 h-4 text-blue-600" />
                      <span>E-mail</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Status & Finalize Footer */}
              <div className="p-4 bg-white border-t border-slate-100 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Alterar Status Rápido</p>
                <div className="flex flex-wrap gap-1.5">
                  {['Pendente', 'Confirmado', 'Check-in Realizado'].map(st => (
                    <button
                      key={st}
                      onClick={() => handleUpdateStatus(selectedEvent.id, st)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        selectedEvent.status === st 
                          ? 'bg-indigo-600 text-white shadow-xs' 
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                  <button
                    onClick={() => handleUpdateStatus(selectedEvent.id, 'Cancelado')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      selectedEvent.status === 'Cancelado' 
                        ? 'bg-rose-600 text-white shadow-xs' 
                        : 'bg-rose-50 text-rose-600 hover:bg-rose-100'
                    }`}
                  >
                    Cancelar
                  </button>
                </div>

                <div className="pt-2 flex gap-2">
                  <button 
                    disabled={selectedEvent.status === 'Concluido' || selectedEvent.venda_id}
                    onClick={() => handleConcluir(selectedEvent.id)}
                    className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs sm:text-sm hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200 flex items-center justify-center gap-2 disabled:bg-slate-300 disabled:shadow-none"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    <span>{selectedEvent.venda_id ? 'Venda Já Gerada' : 'Finalizar Atendimento e Pagar'}</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* TOAST NOTIFICATIONS */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999]"
          >
            <div className={`px-5 py-3 rounded-2xl shadow-2xl border flex items-center gap-2.5 text-xs font-bold ${
              toast.type === 'success' ? 'bg-emerald-900 text-emerald-100 border-emerald-700' : 'bg-rose-900 text-rose-100 border-rose-700'
            }`}>
              {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
              <span>{toast.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Agenda;
