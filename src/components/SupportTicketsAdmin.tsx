import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { formatDate } from '../utils/format';
import { CheckCircle, Clock, AlertCircle, MessageCircle, Send } from 'lucide-react';

export default function SupportTicketsAdmin() {
  const token = useAuthStore(state => state.token);
  const [tickets, setTickets] = useState<any[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('Todos');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchTickets = async () => {
    try {
      const res = await fetch('/api/suporte/admin', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setTickets(data);
      } else {
        setTickets([]);
        console.error("Expected array but got:", data);
      }
    } catch (err) {
      console.error(err);
      setTickets([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (ticketId: number) => {
    try {
      const res = await fetch(`/api/suporte/${ticketId}/messages`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setMessages(data);
      } else {
        setMessages([]);
      }
    } catch (err) {
      console.error(err);
      setMessages([]);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [token]);

  const handleSelectTicket = (ticket: any) => {
    setSelectedTicket(ticket);
    fetchMessages(ticket.id);
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedTicket) return;
    try {
      await fetch(`/api/suporte/${selectedTicket.id}/reply`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ mensagem: newMessage, sender_type: 'support' })
      });
      setNewMessage('');
      fetchMessages(selectedTicket.id);
      fetchTickets();
      setSelectedTicket({ ...selectedTicket, status: 'Aguardando Interação' });
    } catch (err) {
      console.error(err);
    }
  };

  const handleCompleteTicket = async () => {
    if (!selectedTicket) return;
    try {
      await fetch(`/api/suporte/${selectedTicket.id}/complete`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchTickets();
      setSelectedTicket(null);
    } catch (err) {
      console.error(err);
    }
  };

  const filteredTickets = tickets.filter(ticket => {
    const matchStatus = filterStatus === 'Todos' || ticket.status === filterStatus;
    const matchSearch = 
      ticket.id.toString().includes(searchQuery) ||
      (ticket.assunto || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (ticket.empresa_nome || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (ticket.email || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchStatus && matchSearch;
  });

  if (loading) return <div className="p-8 text-center text-slate-500">Carregando chamados...</div>;

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
      {selectedTicket ? (
        <div className="flex flex-col h-[600px]">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-lg">Chamado #{selectedTicket.id} - {selectedTicket.empresa_nome || 'Sem Nome'}</h3>
              <p className="text-sm text-slate-500">Contato: {selectedTicket.email || 'N/A'} | Status: {selectedTicket.status}</p>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={handleCompleteTicket}
                className="bg-emerald-100 text-emerald-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-emerald-200"
              >
                Encerrar Chamado
              </button>
              <button onClick={() => setSelectedTicket(null)} className="bg-slate-100 text-slate-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200">
                Voltar
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.sender_type === 'support' ? 'justify-end' : 'justify-start'}`}>
                <div className={`p-4 rounded-xl max-w-[80%] ${msg.sender_type === 'support' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                  <p className="text-sm whitespace-pre-wrap">{msg.mensagem}</p>
                  <span className={`text-[10px] mt-2 block ${msg.sender_type === 'support' ? 'text-indigo-200' : 'text-slate-400'}`}>
                    {msg.sender_type === 'support' ? 'Suporte' : 'Usuário'} - {formatDate(msg.created_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
          
          <div className="flex gap-2 shrink-0">
            <textarea 
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              placeholder="Digite sua resposta técnica..."
              className="flex-1 px-4 py-3 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 min-h-[80px]"
            />
            <button 
              onClick={handleSendMessage}
              disabled={!newMessage.trim()}
              className="bg-indigo-600 text-white px-6 py-2 rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center shrink-0"
            >
              <Send className="w-5 h-5 mr-2" /> Enviar
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
            <h2 className="text-xl font-bold text-slate-900 shrink-0">Fila de Atendimento</h2>
            
            <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
              <input
                type="text"
                placeholder="Buscar por ID, Empresa, Email ou Assunto..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 w-full md:w-80"
              />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 min-w-[200px]"
              >
                <option value="Todos">Todos os Status</option>
                <option value="Aguardando Análise">NOVO (Aguardando Análise)</option>
                <option value="Aguardando Interação">Aguardando Interação</option>
                <option value="Finalizado">Finalizado</option>
              </select>
            </div>
          </div>
          
          <div className="space-y-4">
            {filteredTickets.map(ticket => (
              <div onClick={() => handleSelectTicket(ticket)} key={ticket.id} className={`flex items-center justify-between p-4 border rounded-2xl cursor-pointer transition-all ${ticket.unread_admin ? 'border-amber-200 bg-amber-50/50 hover:bg-amber-50' : 'border-slate-100 hover:border-indigo-100 hover:bg-indigo-50/30'}`}>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-slate-900 border bg-slate-50 px-2 py-0.5 rounded text-xs">#{ticket.id}</span>
                    {ticket.unread_admin && (
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse ml-1"></span>
                    )}
                    <h4 className={`text-slate-800 ${ticket.unread_admin ? 'font-bold' : 'font-semibold'}`}>
                      {ticket.assunto || 'Sem assunto'}
                    </h4>
                  </div>
                  <p className="text-sm text-slate-600">{ticket.empresa_nome || 'Usuário Avulso'} - {ticket.email}</p>
                  <p className="text-xs text-slate-400 mt-1">{formatDate(ticket.created_at)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium px-3 py-1.5 rounded-full ${
                    ticket.status === 'Aguardando Análise' ? 'bg-rose-100 text-rose-700' :
                    ticket.status === 'Aguardando Interação' ? 'bg-amber-100 text-amber-700' :
                    'bg-emerald-100 text-emerald-700'
                  }`}>
                    {ticket.status === 'Aguardando Análise' ? 'NOVO' : ticket.status}
                  </span>
                </div>
              </div>
            ))}
            {filteredTickets.length === 0 && (
               <div className="text-center py-12 text-slate-500">Nenhum chamado encontrado com esses filtros.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
