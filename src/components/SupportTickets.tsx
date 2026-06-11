import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { formatDate } from '../utils/format';
import { CheckCircle, Clock, AlertCircle, MessageCircle, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function SupportTickets() {
  const token = useAuthStore(state => state.token);
  const [tickets, setTickets] = useState<any[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchTickets = async () => {
    try {
      const res = await fetch('/api/suporte/my_tickets', {
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
        body: JSON.stringify({ mensagem: newMessage, sender_type: 'user' })
      });
      setNewMessage('');
      fetchMessages(selectedTicket.id);
      fetchTickets();
      // Update selected ticket status locally
      setSelectedTicket({ ...selectedTicket, status: 'Aguardando Análise' });
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Carregando chamados...</div>;

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
      {selectedTicket ? (
        <div className="flex flex-col h-[500px]">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-lg">Chamado #{selectedTicket.id}</h3>
              <p className="text-sm text-slate-500">Status: {selectedTicket.status}</p>
            </div>
            <button onClick={() => setSelectedTicket(null)} className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
              ← Voltar para lista
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.sender_type === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`p-4 rounded-xl max-w-[80%] ${msg.sender_type === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                  <p className="text-sm">{msg.mensagem}</p>
                  <span className={`text-[10px] mt-2 block ${msg.sender_type === 'user' ? 'text-indigo-200' : 'text-slate-400'}`}>
                    {formatDate(msg.created_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
          
          {selectedTicket.status === 'Aguardando Interação' ? (
            <div className="flex gap-2 shrink-0">
              <input 
                type="text" 
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                placeholder="Digite sua resposta..."
                className="flex-1 px-4 py-2 border border-slate-200 rounded-xl outline-none focus:border-indigo-500"
              />
              <button 
                onClick={handleSendMessage}
                disabled={!newMessage.trim()}
                className="bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 disabled:opacity-50"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <div className="text-center p-3 bg-slate-50 text-slate-500 rounded-xl text-sm shrink-0">
              {selectedTicket.status === 'Finalizado' ? 'Este chamado foi encerrado.' : 'Aguardando resposta do suporte para enviar nova mensagem.'}
            </div>
          )}
        </div>
      ) : (
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-6">Meus Chamados</h2>
          {tickets.length === 0 ? (
            <div className="text-center py-12 text-slate-500">Você não possui chamados.</div>
          ) : (
            <div className="space-y-4">
              {tickets.map(ticket => (
                <div onClick={() => handleSelectTicket(ticket)} key={ticket.id} className={`flex items-center justify-between p-4 border rounded-2xl cursor-pointer transition-all ${ticket.unread_user ? 'border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50' : 'border-slate-100 hover:border-indigo-100 hover:bg-indigo-50/30'}`}>
                  <div>
                    <h4 className={`text-slate-800 ${ticket.unread_user ? 'font-bold' : 'font-semibold'}`}>
                      Chamado #{ticket.id}: {ticket.assunto || 'Sem assunto'}
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">{formatDate(ticket.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {ticket.unread_user && (
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
                    )}
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                      ticket.status === 'Aguardando Análise' ? 'bg-amber-100 text-amber-700' :
                      ticket.status === 'Aguardando Interação' ? 'bg-indigo-100 text-indigo-700' :
                      'bg-emerald-100 text-emerald-700'
                    }`}>
                      {ticket.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
