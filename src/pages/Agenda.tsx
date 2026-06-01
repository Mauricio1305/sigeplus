import React, { useState, useEffect, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import dayGridPlugin from '@fullcalendar/daygrid';
import ptBrLocale from '@fullcalendar/core/locales/pt-br';
import { 
  Calendar as CalendarIcon, 
  Plus, 
  Search, 
  User, 
  Clock, 
  MessageSquare, 
  Mail, 
  CheckCircle2, 
  XCircle, 
  Trash2,
  AlertCircle,
  MoreVertical,
  Check,
  Phone,
  Save,
  ShoppingBag,
  Edit2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuthStore } from '../store/authStore';

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
  venda_id?: number;
  items?: any[];
}

const Agenda = () => {
  const token = useAuthStore(state => state.token);
  const user = useAuthStore(state => state.user);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProfessional, setSelectedProfessional] = useState<any>(null); // null means "Todos"
  const [professionals, setProfessionals] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  
  // Form State
  const [formData, setFormData] = useState({
    usuario_id: '',
    pessoa_id: '',
    data_inicio: '',
    data_fim: '',
    observacao: '',
    status: 'Pendente' as any,
    items: [] as any[]
  });

  const [pessoas, setPessoas] = useState<any[]>([]);
  const [produtos, setProdutos] = useState<any[]>([]);
  const [searchPessoa, setSearchPessoa] = useState('');
  const [searchProduto, setSearchProduto] = useState('');
  const [notifying, setNotifying] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const calendarRef = useRef<any>(null);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      
      if (mobile !== isMobile) {
        setIsMobile(mobile);
        
        // Auto switch view if crossing breakpoint
        if (calendarRef.current) {
          const api = calendarRef.current.getApi();
          if (mobile && api.view.type !== 'timeGridDay') {
            api.changeView('timeGridDay');
          } else if (!mobile && api.view.type === 'timeGridDay') {
            api.changeView('timeGridWeek');
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
    // Initial fetch handled by datesSet or professional change
    if (calendarRef.current) {
      fetchAgendamentos();
    }
  }, [selectedProfessional]);

  const fetchProfessionals = async () => {
    try {
      const response = await fetch('/api/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (Array.isArray(data)) {
        setProfessionals(data);
        // Default to "Todos" (null) or current professional if preferred. 
        // Request says "Todos" by default.
        setSelectedProfessional(null); 
      }
    } catch (err) {
      console.error('Error fetching professionals:', err);
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
      if (selectedProfessional) {
        params.append('userId', selectedProfessional.id);
      }
      if (start) params.append('start', formatToLocalISO(start));
      if (end) params.append('end', formatToLocalISO(end));
      
      const queryString = params.toString();
      if (queryString) url += `?${queryString}`;

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (Array.isArray(data)) {
        setAgendamentos(data);
      }
    } catch (err) {
      console.error('Error fetching agendamentos:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPessoas = async () => {
    try {
      const response = await fetch('/api/pessoas?tipo=cliente_or_ambos&ativo=1', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (Array.isArray(data)) {
        setPessoas(data);
      }
    } catch (err) {
      console.error('Error fetching pessoas:', err);
    }
  };

  const fetchProdutos = async () => {
    try {
      const response = await fetch('/api/products', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (Array.isArray(data)) {
        setProdutos(data.filter((p: any) => p.ativo));
      }
    } catch (err) {
      console.error('Error fetching produtos:', err);
    }
  };

  const handleSelect = (selectInfo: any) => {
    if (new Date(selectInfo.startStr) < new Date()) {
      alert("Não é possível realizar agendamentos em horários passados.");
      const calendarApi = selectInfo.view.calendar;
      calendarApi.unselect();
      return;
    }

    const defaultProf = selectedProfessional || professionals.find(p => p.id === user?.id) || professionals[0];
    
    setFormData({
      usuario_id: defaultProf?.id || '',
      pessoa_id: '',
      data_inicio: selectInfo.startStr.split('.')[0].substring(0, 16),
      data_fim: selectInfo.endStr.split('.')[0].substring(0, 16),
      observacao: '',
      status: 'Pendente',
      items: []
    });
    setSelectedEvent(null);
    setIsModalOpen(true);
  };

  const handleEventClick = async (clickInfo: any) => {
    const eventId = clickInfo.event.id;
    try {
      const response = await fetch(`/api/agenda/${eventId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setSelectedEvent(data);
      setIsDetailsOpen(true);
    } catch (err) {
      console.error('Error fetching event details:', err);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (new Date(formData.data_inicio) < new Date()) {
      alert("Não é possível realizar agendamentos em horários passados.");
      return;
    }

    try {
      const url = selectedEvent ? `/api/agenda/${selectedEvent.id}` : '/api/agenda';
      const method = selectedEvent ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          valor_total: formData.items.reduce((acc, item) => acc + item.subtotal, 0)
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error);
      }

      setIsModalOpen(false);
      fetchAgendamentos();
      
      if (formData.status === 'Concluido' && !selectedEvent?.venda_id) {
        const agId = selectedEvent ? selectedEvent.id : data.id;
        handleConcluir(agId);
      } else {
        alert('Agendamento salvo com sucesso!');
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Deseja realmente excluir este agendamento?')) return;
    try {
      await fetch(`/api/agenda/${id}`, { 
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setIsDetailsOpen(false);
      fetchAgendamentos();
    } catch (err) {
      console.error('Error deleting:', err);
    }
  };

  const handleUpdateStatus = async (id: number, status: string) => {
    try {
      await fetch(`/api/agenda/${id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });
      fetchAgendamentos();
      if (isDetailsOpen) {
        setSelectedEvent({ ...selectedEvent, status });
      }
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  const handleConcluir = async (id: number) => {
    try {
      const response = await fetch(`/api/agenda/${id}/concluir`, { 
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      
      alert('Venda gerada com sucesso! Redirecionando para pagamento...');
      // In a real app we might redirect to /vendas/:sequencial_id or open the POS
      window.location.href = `/vendas?id=${data.sequencial_id}&pay=true`;
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleNotify = async (id: number, type: 'whatsapp' | 'email') => {
    setNotifying(type);
    try {
      const response = await fetch(`/api/agenda/${id}/notify/${type}`, { 
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      alert('Notificação enviada com sucesso!');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setNotifying(null);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Confirmado': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'Check-in Realizado': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
      case 'Concluido': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Cancelado': return 'bg-rose-100 text-rose-700 border-rose-200';
      default: return 'bg-amber-100 text-amber-700 border-amber-200';
    }
  };

  return (
    <div className="space-y-3 h-full flex flex-col">
      <style>{`
        .fc {
          --fc-border-color: #f1f5f9;
          --fc-page-bg-color: #ffffff;
          --fc-neutral-bg-color: #f8fafc;
          --fc-neutral-text-color: #64748b;
          --fc-today-bg-color: #f8fafc;
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
        .fc-toolbar-title {
          font-weight: 900 !important;
          color: #0f172a !important;
          letter-spacing: -0.025em;
        }
        .fc-col-header-cell-cushion {
          font-weight: 800;
          color: #64748b;
          text-transform: uppercase;
          font-size: 0.75rem;
          padding: 12px 8px !important;
        }
        .fc-timegrid-slot-label-cushion {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.75rem;
          color: #94a3b8;
          font-weight: 500;
        }
        @media (max-width: 640px) {
          .fc-toolbar {
            flex-direction: row !important;
            flex-wrap: nowrap !important;
            gap: 0.25rem !important;
            justify-content: space-between !important;
            align-items: center;
          }
          .fc-toolbar-chunk {
            display: flex;
            align-items: center;
          }
          .fc-toolbar-title {
            font-size: 0.9rem !important;
            margin: 0 !important;
            text-align: center;
            line-height: 1.2;
          }
          .fc-header-toolbar {
            margin-bottom: 0.25rem !important;
          }
          .fc-button {
            padding: 0.2rem 0.4rem !important;
            font-size: 0.7rem !important;
          }
          .fc-col-header-cell-cushion,
          .fc-timegrid-slot-label-cushion,
          .fc-timegrid-axis-cushion,
          .fc-daygrid-day-number {
            font-size: 0.75rem !important;
          }
        }
        .fc-event {
          border: none !important;
          background: transparent !important;
        }
        .fc-event-main {
          padding: 0;
          height: 100%;
        }
        .fc-timegrid-event .fc-event-main {
          padding: 0;
        }
      `}</style>
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-1">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            Agenda
          </h1>
        </div>

        <div className="flex flex-col md:flex-row flex-wrap items-center gap-2 bg-white p-2 rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/40 w-full md:w-auto">
          <div className="flex items-center justify-between w-full md:w-auto gap-2 px-4 py-2 md:border-r border-slate-100">
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-indigo-500" />
              <select 
                className="bg-transparent border-none focus:ring-0 font-bold text-slate-700 pr-8 cursor-pointer truncate max-w-[200px] md:max-w-none"
                value={selectedProfessional?.id || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '') {
                    setSelectedProfessional(null);
                  } else {
                    const prof = professionals.find(p => p.id === parseInt(val));
                    setSelectedProfessional(prof);
                  }
                }}
              >
                <option value="">Todos os Profissionais</option>
                {professionals.map(p => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            </div>
          </div>
          
          <button 
            onClick={() => {
              setFormData({ ...formData, usuario_id: selectedProfessional?.id || user?.id || professionals[0]?.id || '' });
              setSelectedEvent(null);
              setIsModalOpen(true);
            }}
            className="w-full md:w-auto bg-indigo-600 text-white px-6 py-2.5 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" />
            <span>Novo Agendamento</span>
          </button>
        </div>
      </header>

      <div className="flex-1 bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden p-2 md:p-4">
        <FullCalendar
          ref={calendarRef}
          plugins={[timeGridPlugin, interactionPlugin, dayGridPlugin]}
          initialView={isMobile ? "timeGridDay" : "timeGridWeek"}
          headerToolbar={{
            left: isMobile ? 'prev,next' : 'prev,next today',
            center: 'title',
            right: isMobile ? 'today' : 'dayGridMonth,timeGridWeek,timeGridDay'
          }}
          locale={ptBrLocale}
          editable={true}
          selectable={true}
          selectMirror={true}
          dayMaxEvents={true}
          weekends={true}
          nowIndicator={true}
          scrollTime={new Date().toLocaleTimeString('pt-BR', { hour12: false, hour: '2-digit', minute: '2-digit' }) + ':00'}
          height="100%"
          slotMinTime="00:00:00"
          slotMaxTime="23:59:00"
          slotLabelFormat={{
            hour: 'numeric',
            minute: '2-digit',
            omitZeroMinute: false,
            meridiem: 'short'
          }}
          titleFormat={
            isMobile 
              ? { month: 'short', day: 'numeric' } 
              : { year: 'numeric', month: 'long', day: 'numeric' }
          }
          datesSet={() => fetchAgendamentos()}
          events={agendamentos.map(ag => ({
            id: ag.id.toString(),
            title: ag.cliente_nome || 'Cliente não informado',
            start: ag.data_inicio.replace(' ', 'T'),
            end: ag.data_fim.replace(' ', 'T'),
            extendedProps: { ...ag, colorCategory: getStatusColor(ag.status) }
          }))}
          eventContent={(info) => {
            return (
              <div className={`w-full h-full p-2 rounded-xl border-l-4 shadow-sm flex flex-col justify-start overflow-hidden ${info.event.extendedProps.colorCategory || 'bg-indigo-50 text-indigo-700 border-indigo-200'} `} style={{ borderLeftColor: 'currentColor' }}>
                <p className="text-[10px] font-black opacity-70 uppercase tracking-wider mb-1 leading-none whitespace-nowrap overflow-hidden text-ellipsis">{info.timeText}</p>
                <p className="text-xs font-bold leading-tight line-clamp-2">{info.event.title}</p>
              </div>
            );
          }}
          select={handleSelect}
          eventClick={handleEventClick}
          eventDrop={async (info) => {
            const { event } = info;
            if (new Date(event.startStr) < new Date()) {
              alert("Não é possível mover agendamentos para horários passados.");
              info.revert();
              return;
            }
            try {
              await fetch(`/api/agenda/${event.id}`, {
                method: 'PUT',
                headers: { 
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                  data_inicio: event.startStr.split('.')[0],
                  data_fim: event.endStr?.split('.')[0]
                })
              });
              fetchAgendamentos();
            } catch (err) {
              info.revert();
            }
          }}
          eventResize={async (info) => {
            const { event } = info;
            if (new Date(event.startStr) < new Date()) {
              alert("Não é possível alterar agendamentos para iniciar em horários passados.");
              info.revert();
              return;
            }
            try {
              await fetch(`/api/agenda/${event.id}`, {
                method: 'PUT',
                headers: { 
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                  data_inicio: event.startStr.split('.')[0],
                  data_fim: event.endStr?.split('.')[0]
                })
              });
              fetchAgendamentos();
            } catch (err) {
              info.revert();
            }
          }}
        />
      </div>

      {/* Modal Agendamento */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center md:p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative bg-white md:rounded-[2rem] shadow-2xl w-full h-full md:h-auto md:max-w-2xl overflow-hidden flex flex-col md:max-h-[90vh]"
            >
              <div className="p-5 md:p-8 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between bg-white sticky top-0 z-10 gap-4 sm:gap-0">
                <div className="flex-1">
                  <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
                    {selectedEvent ? 'Editar Agendamento' : 'Novo Agendamento'}
                  </h2>
                  <div className="flex items-center gap-2 mt-1">
                    <User className="w-4 h-4 text-slate-400" />
                    <select 
                      className="text-slate-500 text-sm font-medium bg-transparent border-none p-0 focus:ring-0 cursor-pointer"
                      value={formData.usuario_id}
                      onChange={(e) => setFormData({ ...formData, usuario_id: e.target.value })}
                    >
                      {professionals.map(p => (
                        <option key={p.id} value={p.id}>{p.nome}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 sm:static sm:top-auto sm:right-auto p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                  <XCircle className="w-6 h-6 md:w-8 md:h-8" />
                </button>
              </div>

              <form onSubmit={handleSave} className="p-5 md:p-8 overflow-y-auto space-y-5 md:space-y-6 flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Status do Agendamento</label>
                    <select 
                      className={`w-full p-4 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 font-bold transition-all ${
                        formData.status === 'Concluido' ? 'bg-emerald-50 text-emerald-700' : 
                        formData.status === 'Cancelado' ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-700'
                      }`}
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    >
                      <option value="Pendente">Pendente</option>
                      <option value="Confirmado">Confirmado</option>
                      <option value="Check-in Realizado">Check-in Realizado</option>
                      <option value="Concluido">Finalizado (Abrir Pagamento)</option>
                      <option value="Cancelado">Cancelado</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Cliente</label>
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input 
                        type="text"
                        className="w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 font-medium transition-all"
                        placeholder="Buscar cliente..."
                        value={searchPessoa}
                        onChange={(e) => setSearchPessoa(e.target.value)}
                      />
                      {searchPessoa && searchPessoa !== pessoas.find(p => p.id === formData.pessoa_id)?.nome && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-slate-100 shadow-xl z-20 max-h-48 overflow-y-auto">
                          {pessoas
                            .filter(p => 
                              p.ativo === 1 && 
                              (p.tipo_pessoa === 'cliente' || p.tipo_pessoa === 'ambos') &&
                              p.nome.toLowerCase().includes(searchPessoa.toLowerCase())
                            )
                            .map(p => (
                            <button
                              key={p.id}
                              type="button"
                              className="w-full text-left px-4 py-3 hover:bg-indigo-50 transition-colors flex items-center gap-3 border-b border-slate-50 last:border-0"
                              onClick={() => {
                                setFormData({ ...formData, pessoa_id: p.id });
                                setSearchPessoa(p.nome);
                              }}
                            >
                              <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-sm">{p.nome.charAt(0)}</div>
                              <div>
                                <p className="font-bold text-slate-900 text-sm">{p.nome}</p>
                                <p className="text-xs text-slate-500">{p.telefone || 'Sem telefone'}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Início</label>
                      <input 
                        type="datetime-local" 
                        required
                        className="w-full p-3 sm:px-2 md:px-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 font-medium text-sm sm:text-xs md:text-sm"
                        value={formData.data_inicio}
                        onChange={(e) => setFormData({ ...formData, data_inicio: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Fim</label>
                      <input 
                        type="datetime-local" 
                        required
                        className="w-full p-3 sm:px-2 md:px-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 font-medium text-sm sm:text-xs md:text-sm"
                        value={formData.data_fim}
                        onChange={(e) => setFormData({ ...formData, data_fim: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Serviços e Produtos</label>
                  <div className="relative">
                    <Plus className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input 
                      type="text"
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 font-medium"
                      placeholder="Adicionar serviço ou produto..."
                      value={searchProduto}
                      onChange={(e) => setSearchProduto(e.target.value)}
                    />
                    {searchProduto && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-slate-100 shadow-xl z-20 max-h-48 overflow-y-auto">
                        {produtos.filter(p => p.nome.toLowerCase().includes(searchProduto.toLowerCase())).map(p => (
                          <button
                            key={p.id}
                            type="button"
                            className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-center justify-between"
                            onClick={() => {
                              const existing = formData.items.find(i => i.produto_id === p.id);
                              if (!existing) {
                                setFormData({
                                  ...formData,
                                  items: [...formData.items, {
                                    produto_id: p.id,
                                    nome: p.nome,
                                    quantidade: 1,
                                    preco_unitario: p.preco_venda,
                                    subtotal: p.preco_venda,
                                    tempo_execucao: p.tempo_execucao
                                  }]
                                });
                              }
                              setSearchProduto('');
                            }}
                          >
                            <div>
                              <p className="font-bold text-slate-900 text-sm">{p.nome}</p>
                              <p className="text-xs text-slate-500">{p.tipo === 'servico' ? `Serviço • ${p.tempo_execucao}min` : 'Produto'}</p>
                            </div>
                            <p className="font-bold text-indigo-600">{formatCurrency(p.preco_venda)}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    {formData.items.map((item, idx) => (
                      <div key={idx} className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-4 bg-slate-50 p-3 sm:p-4 rounded-2xl group">
                        <div className="flex-1 min-w-[120px]">
                          <p className="font-bold text-slate-900 text-sm leading-tight">{item.nome}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{item.tempo_execucao > 0 ? `${item.tempo_execucao} min` : 'Sem tempo'}</p>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto mt-2 sm:mt-0 justify-end">
                          <div className="w-20 sm:w-24">
                            <input 
                              type="number"
                              className="w-full bg-white border-slate-200 rounded-lg text-sm text-center py-1.5 font-bold"
                              value={item.quantidade}
                              onChange={(e) => {
                                const q = parseFloat(e.target.value) || 0;
                                const newItems = [...formData.items];
                                newItems[idx].quantidade = q;
                                newItems[idx].subtotal = q * item.preco_unitario;
                                setFormData({ ...formData, items: newItems });
                              }}
                            />
                          </div>
                          <p className="font-bold text-slate-900 w-20 sm:w-24 text-right">{formatCurrency(item.subtotal)}</p>
                          <button 
                            type="button" 
                            onClick={() => setFormData({ ...formData, items: formData.items.filter((_, i) => i !== idx) })}
                            className="text-slate-400 hover:text-rose-500 transition-colors md:opacity-0 md:group-hover:opacity-100 p-1"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-4 px-2">
                    <p className="text-sm font-bold text-slate-400">Total Previsto</p>
                    <p className="text-2xl font-black text-indigo-600">
                      {formatCurrency(formData.items.reduce((acc, i) => acc + i.subtotal, 0))}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Observações</label>
                  <textarea 
                    className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 font-medium min-h-[100px]"
                    placeholder="Adicione observações aqui..."
                    value={formData.observacao}
                    onChange={(e) => setFormData({ ...formData, observacao: e.target.value })}
                  ></textarea>
                </div>

                <div className="sticky bottom-0 left-0 right-0 bg-white pt-4 pb-4 md:pb-0 flex flex-col-reverse sm:flex-row gap-3 md:gap-4 mt-auto">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 py-3 md:py-4 px-6 border-2 border-slate-100 text-slate-500 rounded-2xl font-black text-sm uppercase tracking-wider hover:bg-slate-50 transition-all"
                  >
                    Descartar
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 sm:flex-[2] py-3 md:py-4 px-6 md:px-12 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-wider hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-2"
                  >
                    <Save className="w-5 h-5" />
                    Salvar Agendamento
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Slide-over de Detalhes */}
      <AnimatePresence>
        {isDetailsOpen && selectedEvent && (
          <div className="fixed inset-0 z-[110] flex justify-end overflow-hidden">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDetailsOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-lg bg-white shadow-2xl flex flex-col h-full"
            >
              <div className="p-8 border-b border-slate-100">
                <div className="flex items-center justify-between mb-6">
                  <div className={`px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest ${getStatusColor(selectedEvent.status)}`}>
                    {selectedEvent.status}
                  </div>
                  <div className="flex items-center gap-2">
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
                          items: selectedEvent.items || []
                        });
                        setSearchPessoa(selectedEvent.cliente_nome || '');
                        setIsDetailsOpen(false);
                        setIsModalOpen(true);
                      }}
                      className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl hover:bg-indigo-100 transition-all border border-indigo-100"
                      title="Editar Agendamento"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => setIsDetailsOpen(false)}
                      className="p-3 bg-slate-100 text-slate-500 rounded-2xl hover:bg-slate-200 transition-all"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-start gap-6 mb-8">
                  <div className="w-16 h-16 bg-indigo-600 rounded-3xl flex items-center justify-center text-white text-2xl font-black shadow-xl shadow-indigo-100">
                    {(selectedEvent.cliente_nome || '?').charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-slate-900 leading-tight mb-1">
                      {selectedEvent.cliente_nome || 'Consumidor'}
                    </h3>
                    <div className="flex items-center gap-4 text-slate-500 text-sm font-medium">
                      <div className="flex items-center gap-1">
                        <Phone className="w-4 h-4" />
                        {selectedEvent.cliente_telefone || 'Sem tel'}
                      </div>
                      <div className="flex items-center gap-1">
                        <Mail className="w-4 h-4" />
                        {selectedEvent.cliente_email || 'Sem e-mail'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-6 rounded-3xl">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Horário</p>
                    <div className="flex items-center gap-3">
                      <Clock className="w-5 h-5 text-indigo-600" />
                      <p className="font-bold text-slate-900">
                        {new Date(selectedEvent.data_inicio.replace(' ', 'T')).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(selectedEvent.data_fim.replace(' ', 'T')).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 font-medium">{new Date(selectedEvent.data_inicio.replace(' ', 'T')).toLocaleDateString()}</p>
                  </div>
                  <div className="bg-slate-50 p-6 rounded-3xl">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Profissional</p>
                    <div className="flex items-center gap-3">
                      <User className="w-5 h-5 text-indigo-600" />
                      <p className="font-bold text-slate-900 truncate">{selectedEvent.profissional_nome}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                <div>
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Itens do Agendamento</h4>
                  <div className="space-y-3">
                    {selectedEvent.items?.map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
                        <div>
                          <p className="font-bold text-slate-900">{item.nome}</p>
                          <p className="text-xs text-slate-500">{item.quantidade} x {formatCurrency(item.preco_unitario)}</p>
                        </div>
                        <p className="font-black text-slate-900">{formatCurrency(item.subtotal)}</p>
                      </div>
                    ))}
                    <div className="flex justify-between items-center px-4 pt-4 border-t border-slate-100">
                      <p className="font-bold text-slate-400">Total</p>
                      <p className="text-xl font-black text-indigo-600">{formatCurrency(selectedEvent.valor_total)}</p>
                    </div>
                  </div>
                </div>

                {selectedEvent.observacao && (
                  <div>
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Observações</h4>
                    <p className="text-slate-600 bg-slate-50 p-4 rounded-2xl text-sm leading-relaxed">{selectedEvent.observacao}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <button 
                    disabled={notifying === 'whatsapp'}
                    onClick={() => handleNotify(selectedEvent.id, 'whatsapp')}
                    className="flex flex-col items-center gap-2 p-4 bg-emerald-50 text-emerald-600 rounded-3xl hover:bg-emerald-100 transition-all border border-emerald-100 disabled:opacity-50"
                  >
                    <MessageSquare className="w-6 h-6" />
                    <span className="text-[10px] font-black uppercase tracking-widest">WhatsApp</span>
                  </button>
                  <button 
                    disabled={notifying === 'email'}
                    onClick={() => handleNotify(selectedEvent.id, 'email')}
                    className="flex flex-col items-center gap-2 p-4 bg-blue-50 text-blue-600 rounded-3xl hover:bg-blue-100 transition-all border border-blue-100 disabled:opacity-50"
                  >
                    <Mail className="w-6 h-6" />
                    <span className="text-[10px] font-black uppercase tracking-widest">E-mail</span>
                  </button>
                </div>
              </div>

              <div className="p-8 bg-slate-50 border-t border-slate-100">
                <div className="flex flex-wrap gap-2 mb-6">
                  {['Pendente', 'Confirmado', 'Check-in Realizado'].map(status => (
                    <button
                      key={status}
                      onClick={() => handleUpdateStatus(selectedEvent.id, status)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${selectedEvent.status === status ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-500 hover:bg-slate-100 border border-slate-200'}`}
                    >
                      {status}
                    </button>
                  ))}
                  <button
                    onClick={() => handleUpdateStatus(selectedEvent.id, 'Cancelado')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${selectedEvent.status === 'Cancelado' ? 'bg-rose-600 text-white shadow-lg' : 'bg-white text-rose-500 hover:bg-rose-50 border border-slate-200'}`}
                  >
                    Cancelar
                  </button>
                </div>

                <div className="flex gap-4">
                  <button 
                    disabled={selectedEvent.status === 'Concluido' || selectedEvent.venda_id}
                    onClick={() => handleConcluir(selectedEvent.id)}
                    className="flex-1 py-4 px-12 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-wider hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-2 disabled:bg-slate-300 disabled:shadow-none"
                  >
                    <ShoppingBag className="w-5 h-5" />
                    {selectedEvent.venda_id ? 'Venda Já Gerada' : 'Finalizar e Pagar'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Agenda;
