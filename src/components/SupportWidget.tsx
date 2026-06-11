import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../store/authStore';

export default function SupportWidget() {
  const user = useAuthStore(state => state.user);
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(0); 
  const [ticketId, setTicketId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<{sender: 'bot' | 'user', text: string}[]>([]);
  const [draftMessage, setDraftMessage] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, step]);

  const handleStart = async () => {
    setIsOpen(true);
    if (step === 0) {
      if (!user) {
        setStep(0.5);
        setMessages([
          { sender: 'bot', text: 'Olá! Como não identificamos seu login, por favor informe seu e-mail para iniciarmos o atendimento e referenciarmos o chamado.' }
        ]);
      } else {
        await startTicket(user.email, user.tenant_id, user.id);
      }
    }
  };

  const startTicket = async (emailToUse: string, tenantIdToUse?: string, userIdToUse?: number) => {
    setStep(1);
    try {
      const res = await fetch('/api/suporte/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantIdToUse,
          email: emailToUse,
          usuario_id: userIdToUse
        })
      });
      const data = await res.json();
      if (data.id) {
        setTicketId(data.id);
        setMessages(prev => [
          ...prev,
          { sender: 'bot', text: `Olá, obrigado por entrar em contato, vou registrar sua solicitação. O seu ticket desse atendimento é o #${data.id}` },
          { sender: 'bot', text: 'Me informe qual problema está enfrentando que vou abrir o seu chamado.' }
        ]);
        setStep(2); // Wait for user input
      }
    } catch (err) {
      console.error("Failed to start ticket", err);
      setStep(0);
    }
  };

  const handleSendDraft = () => {
    if (!message.trim()) return;

    if (step === 0.5) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(message)) {
        setMessages(prev => [...prev, { sender: 'user', text: message }, { sender: 'bot', text: 'O formato do e-mail é inválido. Por favor, digite um e-mail correto.' }]);
        setMessage('');
        return;
      }
      setGuestEmail(message);
      setMessages(prev => [...prev, { sender: 'user', text: message }]);
      setMessage('');
      startTicket(message);
      return;
    }

    if (step !== 2) return;
    setDraftMessage(message);
    setMessages(prev => [...prev, { sender: 'user', text: message }]);
    setTimeout(() => {
      setMessages(prev => [...prev, { sender: 'bot', text: `Posso abrir sua solicitação: "${message}"?` }]);
      setStep(3); // Wait for Confirm/Edit
    }, 500);
    setMessage('');
  };

  const handleConfirm = async () => {
    if (!ticketId || !draftMessage) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/suporte/${ticketId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagem: draftMessage })
      });
      if (res.ok) {
        setMessages(prev => [...prev, { sender: 'bot', text: 'Obrigado, sua solicitação foi registrada com sucesso! Acompanhe pelo seu e-mail ou, se tiver cadastro, pela aba "Meus Chamados". Você será respondido em breve.' }]);
        setStep(4);
        setTimeout(() => setIsOpen(false), 5000);
      }
    } catch (err) {
      console.error("Failed to confirm ticket", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = () => {
    setMessage(draftMessage);
    // Remove the last bot question and the user message
    setMessages(prev => prev.slice(0, prev.length - 2));
    setStep(2);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="bg-white w-80 sm:w-96 rounded-2xl shadow-2xl mb-4 overflow-hidden border border-slate-100 flex flex-col"
            style={{ height: '450px', maxHeight: '80vh' }}
          >
            <div className="bg-indigo-600 p-4 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-full">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold">Suporte</h3>
                  <p className="text-indigo-100 text-xs">Atendimento online</p>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-indigo-200 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`p-3 rounded-2xl max-w-[85%] text-sm ${m.sender === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none shadow-sm'}`}>
                    {m.text}
                  </div>
                </div>
              ))}
              
              {step === 3 && (
                <div className="flex justify-start gap-2 pt-2">
                  <button onClick={handleConfirm} disabled={isSubmitting} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2">
                    <Check className="w-4 h-4" /> Confirmar
                  </button>
                  <button onClick={handleEdit} disabled={isSubmitting} className="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors">
                    Editar
                  </button>
                </div>
              )}
              <div ref={endOfMessagesRef} />
            </div>

            <div className="p-3 bg-white border-t border-slate-100 shrink-0">
              {step === 0.5 || step === 2 ? (
                <div className="flex gap-2 relative">
                  <input
                    type="text"
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSendDraft()}
                    placeholder={step === 0.5 ? "Digite seu e-mail..." : "Digite seu problema..."}
                    className="flex-1 px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 pr-10"
                  />
                  <button 
                    onClick={handleSendDraft}
                    disabled={!message.trim()}
                    className="absolute right-2 top-1.5 p-1 text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="text-center text-xs text-slate-400 py-2">
                  {step === 4 ? "Atendimento encerrado." : step === 3 ? "Aguardando confirmação..." : "Aguardando resposta do agente..."}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {!isOpen && (
        <button
          onClick={handleStart}
          className="bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-full shadow-lg transition-transform hover:scale-105 flex items-center justify-center"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}
