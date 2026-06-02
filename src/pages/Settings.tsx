import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Users, Edit2, X, Send, Globe, Mail, Eye, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Toast } from '../components/ui/Toast';
import { FormField } from '../components/ui/FormField';

export const Settings = () => {
  const user = useAuthStore(state => state.user);
  const token = useAuthStore(state => state.token);
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<'general' | 'finance' | 'users' | 'inventory' | 'integrations'>('general');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [financeFieldErrors, setFinanceFieldErrors] = useState<Record<string, string>>({});
  const [company, setCompany] = useState<any>({
    nome_fantasia: '',
    razao_social: '',
    cnpj: '',
    email: '',
    whatsapp: '',
    telefone_fixo: '',
    telefone_celular: '',
    endereco: '',
    numero: '',
    cep: '',
    cidade: '',
    estado: '',
    logo: '',
    whatsapp_api_url: '',
    whatsapp_api_key: '',
    whatsapp_instance: '',
    whatsapp_msg_agendamento: '',
    email_host: '',
    email_port: '',
    email_user: '',
    email_pass: '',
    email_from: '',
    email_msg_agendamento: '',
    whatsapp_automatico: false,
    email_automatico: false
  });

  const [paymentTypes, setPaymentTypes] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [productGroups, setProductGroups] = useState<any[]>([]);
  const [labelLayouts, setLabelLayouts] = useState<any[]>([]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }
      
      if (event.data?.type === 'STRIPE_SUCCESS' && event.data?.sessionId) {
        setLoading(true);
        fetch('/api/stripe/verify-session', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ sessionId: event.data.sessionId })
        })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setToast({ message: 'Assinatura confirmada com sucesso!', type: 'success' });
            setTimeout(() => setToast(null), 5000);
            fetch('/api/company/settings', {
              headers: { 'Authorization': `Bearer ${token}` }
            })
            .then(res => res.json())
            .then(setCompany);
          }
        })
        .catch(err => console.error("Verification error:", err))
        .finally(() => setLoading(false));
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [token]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab === 'finance' || tab === 'general') {
      setActiveTab(tab as 'general' | 'finance');
    }
  }, [location]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isModalSubmitting, setIsModalSubmitting] = useState(false);
  const [modalType, setModalType] = useState<'category' | 'paymentType' | 'group' | 'user' | 'productGroup' | 'labelLayout'>('category');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [testPhone, setTestPhone] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [isTestingEmail, setIsTestingEmail] = useState(false);

  const handleTestEmail = async () => {
    if (!testEmail) {
      setToast({ message: 'Digite um e-mail para testar', type: 'error' });
      return;
    }
    if (!company.email_host || !company.email_user || !company.email_pass) {
      setToast({ message: 'Preencha as configurações de SMTP antes de testar', type: 'error' });
      return;
    }

    setIsTestingEmail(true);
    try {
      const res = await fetch('/api/email/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          host: company.email_host,
          port: company.email_port,
          user: company.email_user,
          pass: company.email_pass,
          from: company.email_from,
          to: testEmail,
          message: (company.email_msg_agendamento || '')
            .replace(/{nome_cliente}/g, 'Cliente Teste')
            .replace(/{data_agendamento}/g, new Date().toLocaleString('pt-BR'))
        })
      });

      const data = await res.json();
      if (res.ok) {
        setToast({ message: 'E-mail de teste enviado com sucesso!', type: 'success' });
      } else {
        setToast({ message: data.error || 'Erro ao testar e-mail', type: 'error' });
      }
    } catch (err) {
      console.error("Error testing email:", err);
      setToast({ message: 'Erro de conexão ao testar e-mail', type: 'error' });
    } finally {
      setIsTestingEmail(false);
      setTimeout(() => setToast(null), 5000);
    }
  };

  const handleTestWhatsApp = async () => {
    if (!testPhone) {
      setToast({ message: 'Digite um número para testar', type: 'error' });
      return;
    }
    if (!company.whatsapp_api_url || !company.whatsapp_api_key || !company.whatsapp_instance) {
      setToast({ message: 'Preencha as configurações da Evolution API antes de testar', type: 'error' });
      return;
    }

    setIsTesting(true);
    try {
      const res = await fetch('/api/whatsapp/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          number: testPhone,
          url: company.whatsapp_api_url,
          key: company.whatsapp_api_key,
          instance: company.whatsapp_instance,
          message: (company.whatsapp_msg_agendamento || '')
            .replace(/{nome_cliente}/g, 'Cliente Teste')
            .replace(/{data_agendamento}/g, new Date().toLocaleString('pt-BR'))
        })
      });

      const data = await res.json();
      if (res.ok) {
        setToast({ message: 'Mensagem de teste enviada com sucesso!', type: 'success' });
      } else {
        setToast({ message: data.error || 'Erro ao testar WhatsApp', type: 'error' });
      }
    } catch (err) {
      console.error("Error testing WhatsApp:", err);
      setToast({ message: 'Erro de conexão ao testar WhatsApp', type: 'error' });
    } finally {
      setIsTesting(false);
      setTimeout(() => setToast(null), 5000);
    }
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/company/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(company)
      });
      if (res.ok) {
        setToast({ message: 'Configurações salvas com sucesso!', type: 'success' });
      } else {
        const data = await res.json();
        setToast({ message: data.error || 'Erro ao salvar', type: 'error' });
      }
    } catch (error) {
      console.error('Save company error:', error);
      setToast({ message: 'Erro de conexão', type: 'error' });
    } finally {
      setLoading(false);
      setTimeout(() => setToast(null), 5000);
    }
  };

  useEffect(() => {
    fetch('/api/company/settings', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(async res => {
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with ${res.status}`);
      }
      return res.json();
    })
    .then(data => {
      if (data && !data.error) setCompany(data);
    })
    .catch(err => console.error("Error fetching company settings:", err));
  }, [token]);

  const fetchPaymentTypes = () => {
    fetch('/api/finance/payment-types', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => setPaymentTypes(Array.isArray(data) ? data : []))
      .catch(err => console.error("Error fetching payment types:", err));
  };

  const fetchCategories = () => {
    fetch('/api/finance/categories', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => setCategories(Array.isArray(data) ? data : []))
      .catch(err => console.error("Error fetching categories:", err));
  };

  const fetchGroups = () => {
    fetch('/api/settings/groups', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => setGroups(Array.isArray(data) ? data : []))
      .catch(err => console.error("Error fetching groups:", err));
  };

  const fetchUsers = () => {
    fetch('/api/settings/users', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => setUsers(Array.isArray(data) ? data : []))
      .catch(err => console.error("Error fetching users:", err));
  };

  const fetchProductGroups = () => {
    fetch('/api/inventory/groups', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => setProductGroups(Array.isArray(data) ? data : []))
      .catch(err => console.error("Error fetching product groups:", err));
  };

  const fetchLabelLayouts = () => {
    fetch('/api/inventory/layouts', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => setLabelLayouts(Array.isArray(data) ? data : []))
      .catch(err => console.error("Error fetching label layouts:", err));
  };

  useEffect(() => {
    if (activeTab === 'finance') {
      fetchPaymentTypes();
      fetchCategories();
    }
    if (activeTab === 'users') {
      fetchGroups();
      fetchUsers();
    }
    if (activeTab === 'inventory') {
      fetchProductGroups();
      fetchLabelLayouts();
    }
  }, [activeTab, token]);

  const formatWhatsApp = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!company.nome_fantasia) errors.nome_fantasia = 'Nome Fantasia é obrigatório';
    if (!company.email) {
      errors.email = 'E-mail é obrigatório';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(company.email)) {
      errors.email = 'E-mail inválido';
    }
    
    const whatsappDigits = (company.whatsapp || '').replace(/\D/g, '');
    if (whatsappDigits && (whatsappDigits.length < 10 || whatsappDigits.length > 11)) {
      errors.whatsapp = 'Número de WhatsApp inválido';
    }
    
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setLoading(true);
    try {
      const res = await fetch('/api/company/settings', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(company)
      });
      if (res.ok) {
        setToast({ message: 'Dados da empresa atualizados com sucesso!', type: 'success' });
      } else {
        const data = await res.json();
        setToast({ message: data.error || 'Erro ao salvar dados da empresa', type: 'error' });
      }
    } catch (err) {
      console.error("Error saving company settings:", err);
      setToast({ message: 'Erro de conexão ao salvar dados', type: 'error' });
    } finally {
      setLoading(false);
      setTimeout(() => setToast(null), 5000);
    }
  };

  const handleSubmitModal = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!formData.nome) errors.nome = 'Nome é obrigatório';
    if (modalType === 'paymentType') {
      if (formData.prazo_dias === undefined || formData.prazo_dias === null) errors.prazo_dias = 'Prazo é obrigatório';
      if (!formData.qtd_parcelas) errors.qtd_parcelas = 'Quantidade de parcelas é obrigatória';
    }
    if (modalType === 'user') {
      if (!formData.email) errors.email = 'E-mail é obrigatório';
      if (!formData.grupo_id) errors.grupo_id = 'Grupo é obrigatório';
    }
    
    if (Object.keys(errors).length > 0) {
      setFinanceFieldErrors(errors);
      return;
    }

    setFinanceFieldErrors({});
    setIsModalSubmitting(true);
    let url = '';
    let method = 'POST';

    if (modalType === 'category') {
      if (selectedItem?.id) { url = `/api/finance/categories/${selectedItem.id}`; method = 'PUT'; } 
      else { url = '/api/finance/categories'; method = 'POST'; }
    }
    if (modalType === 'paymentType') {
      if (selectedItem?.id) { url = `/api/finance/payment-types/${selectedItem.id}`; method = 'PUT'; } 
      else { url = '/api/finance/payment-types'; method = 'POST'; }
    }
    if (modalType === 'group') {
      if (selectedItem?.id) { url = `/api/settings/groups/${selectedItem.id}`; method = 'PUT'; } 
      else { url = '/api/settings/groups'; method = 'POST'; }
    }
    if (modalType === 'productGroup') {
      if (selectedItem?.id) { url = `/api/inventory/groups/${selectedItem.id}`; method = 'PUT'; } 
      else { url = '/api/inventory/groups'; method = 'POST'; }
    }
    if (modalType === 'labelLayout') {
      if (selectedItem?.id) { url = `/api/inventory/layouts/${selectedItem.id}`; method = 'PUT'; } 
      else { url = '/api/inventory/layouts'; method = 'POST'; }
    }
    if (modalType === 'user') {
      if (selectedItem?.id) { url = `/api/settings/users/${selectedItem.id}`; method = 'PUT'; } 
      else { url = '/api/settings/users'; method = 'POST'; }
    }

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        setToast({ message: 'Salvo com sucesso!', type: 'success' });
        setIsModalOpen(false);
        setFormData({});
        setSelectedItem(null);
        if (modalType === 'category') fetchCategories();
        if (modalType === 'paymentType') fetchPaymentTypes();
        if (modalType === 'group') fetchGroups();
        if (modalType === 'user') fetchUsers();
        if (modalType === 'productGroup') fetchProductGroups();
        if (modalType === 'labelLayout') fetchLabelLayouts();
      } else {
        const data = await res.json();
        setToast({ message: data.error || data.message || 'Erro ao salvar', type: 'error' });
      }
    } catch (error) {
      console.error('Submit error:', error);
      setToast({ message: 'Erro de conexão com o servidor', type: 'error' });
    } finally {
      setIsModalSubmitting(false);
      setTimeout(() => setToast(null), 5000);
    }
  };

  const canUseWhatsApp = user?.modulos?.includes('lembrete_whatsapp');
  const canUseEmail = user?.modulos?.includes('lembrete_email');

  return (
    <div className="space-y-6 max-w-6xl relative">
      <AnimatePresence>
        {toast && (
          <Toast 
            message={toast.message} 
            type={toast.type} 
            onClose={() => setToast(null)} 
          />
        )}
      </AnimatePresence>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">Configurações</h1>
        <div className="flex flex-wrap bg-white p-1 rounded-xl border border-slate-100 shadow-sm w-full md:w-auto gap-1">
          <button 
            onClick={() => setActiveTab('general')} 
            className={`whitespace-nowrap px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'general' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            Geral
          </button>
          <button 
            onClick={() => setActiveTab('finance')} 
            className={`whitespace-nowrap px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'finance' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            Financeiro
          </button>
          <button 
            onClick={() => setActiveTab('inventory')} 
            className={`whitespace-nowrap px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'inventory' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            Estoque
          </button>
          <button 
            onClick={() => setActiveTab('users')} 
            className={`whitespace-nowrap px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'users' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            Usuários
          </button>
          <button 
            onClick={() => setActiveTab('integrations')} 
            className={`whitespace-nowrap px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'integrations' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            Integrações
          </button>
        </div>
      </div>
      
      {activeTab === 'general' && (
        <div className="space-y-6 max-w-4xl">
          {user?.perfil === 'superadmin' && (
            <div className="bg-indigo-600 p-6 rounded-2xl shadow-lg shadow-indigo-100 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold">Gestão de Planos</h3>
                <p className="text-indigo-100 text-sm">Gerencie, cadastre e edite os planos do sistema.</p>
              </div>
              <button 
                onClick={() => navigate('/admin')}
                className="bg-white text-indigo-600 px-4 py-2 rounded-xl font-bold hover:bg-indigo-50 transition-all"
              >
                Acessar Painel
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
                <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <SettingsIcon className="w-5 h-5 text-indigo-600" />
                  Dados da Empresa
                </h3>
                <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-4" noValidate>
                  <div className="md:col-span-2">
                    <FormField label="Nome Fantasia" error={fieldErrors.nome_fantasia} required>
                      <input 
                        type="text" 
                        maxLength={255}
                        className={`w-full px-4 py-2 rounded-xl border outline-none transition-all ${fieldErrors.nome_fantasia ? 'border-rose-500 bg-rose-50 focus:ring-rose-200' : 'border-slate-200 focus:ring-indigo-500'}`}
                        value={company.nome_fantasia || ''}
                        onChange={e => {
                          setCompany({...company, nome_fantasia: e.target.value});
                          if (fieldErrors.nome_fantasia) setFieldErrors({...fieldErrors, nome_fantasia: ''});
                        }}
                      />
                    </FormField>
                  </div>
                  <div className="md:col-span-2">
                    <FormField label="Razão Social">
                      <input 
                        type="text" 
                        maxLength={255}
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={company.razao_social || ''}
                        onChange={e => setCompany({...company, razao_social: e.target.value})}
                      />
                    </FormField>
                  </div>
                  <div className="md:col-span-2">
                    <FormField label="Logo da Empresa (Formato Paisagem)">
                      <div className="flex items-center gap-4">
                        {company.logo && (
                          <img src={company.logo} alt="Logo" className="h-16 object-contain rounded-lg border border-slate-200 bg-white" />
                        )}
                        <input 
                          type="file" 
                          accept="image/*"
                          className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onloadend = () => {
                                setCompany({ ...company, logo: reader.result as string });
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </div>
                    </FormField>
                  </div>
                  <div>
                    <FormField label="CPF / CNPJ">
                      <input 
                        type="text" 
                        maxLength={20}
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={company.cnpj || ''}
                        onChange={e => setCompany({...company, cnpj: e.target.value})}
                      />
                    </FormField>
                  </div>
                  <div>
                    <FormField label="E-mail" error={fieldErrors.email} required>
                      <input 
                        type="email" 
                        maxLength={255}
                        className={`w-full px-4 py-2 rounded-xl border outline-none transition-all ${fieldErrors.email ? 'border-rose-500 bg-rose-50 focus:ring-rose-200' : 'border-slate-200 focus:ring-indigo-500'}`}
                        value={company.email || ''}
                        onChange={e => {
                          setCompany({...company, email: e.target.value});
                          if (fieldErrors.email) setFieldErrors({...fieldErrors, email: ''});
                        }}
                      />
                    </FormField>
                  </div>
                  <div>
                    <FormField label="WhatsApp" error={fieldErrors.whatsapp}>
                      <input 
                        type="text" 
                        placeholder="(00) 00000-0000"
                        maxLength={15}
                        className={`w-full px-4 py-2 rounded-xl border outline-none transition-all ${fieldErrors.whatsapp ? 'border-rose-500 bg-rose-50 focus:ring-rose-200' : 'border-slate-200 focus:ring-indigo-500'}`}
                        value={company.whatsapp || ''}
                        onChange={e => {
                          const formatted = formatWhatsApp(e.target.value);
                          if (formatted.length <= 15) {
                            setCompany({...company, whatsapp: formatted});
                          }
                          if (fieldErrors.whatsapp) setFieldErrors({...fieldErrors, whatsapp: ''});
                        }}
                      />
                    </FormField>
                  </div>
                  <div>
                    <FormField label="Telefone Fixo">
                      <input 
                        type="text" 
                        maxLength={20}
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={company.telefone_fixo || ''}
                        onChange={e => setCompany({...company, telefone_fixo: e.target.value})}
                      />
                    </FormField>
                  </div>
                  <div>
                    <FormField label="Telefone Celular">
                      <input 
                        type="text" 
                        maxLength={20}
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={company.telefone_celular || ''}
                        onChange={e => setCompany({...company, telefone_celular: e.target.value})}
                      />
                    </FormField>
                  </div>
                  <div className="md:col-span-2">
                    <FormField label="Endereço">
                      <input 
                        type="text" 
                        maxLength={65535}
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={company.endereco || ''}
                        onChange={e => setCompany({...company, endereco: e.target.value})}
                      />
                    </FormField>
                  </div>
                  <div>
                    <FormField label="Número">
                      <input 
                        type="text" 
                        maxLength={20}
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={company.numero || ''}
                        onChange={e => setCompany({...company, numero: e.target.value})}
                      />
                    </FormField>
                  </div>
                  <div>
                    <FormField label="CEP">
                      <input 
                        type="text" 
                        maxLength={20}
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={company.cep || ''}
                        onChange={e => setCompany({...company, cep: e.target.value})}
                      />
                    </FormField>
                  </div>
                  <div>
                    <FormField label="Cidade">
                      <input 
                        type="text" 
                        maxLength={255}
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={company.cidade || ''}
                        onChange={e => setCompany({...company, cidade: e.target.value})}
                      />
                    </FormField>
                  </div>
                  <div>
                    <FormField label="Estado (UF)">
                      <input 
                        type="text" 
                        maxLength={2}
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none uppercase"
                        value={company.estado || ''}
                        onChange={e => setCompany({...company, estado: e.target.value.toUpperCase()})}
                      />
                    </FormField>
                  </div>
                  <div className="md:col-span-2 pt-4">
                    <button 
                      type="submit" 
                      disabled={loading}
                      className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
                    >
                      {loading ? 'Salvando...' : 'Salvar Alterações'}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
                <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-600" />
                  Usuário Atual
                </h3>
                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl">
                  <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xl shrink-0 overflow-hidden">
                    {user?.avatar ? (
                      <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      user?.nome.charAt(0)
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 truncate">{user?.nome}</p>
                    <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                    <span className="inline-block mt-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-bold uppercase rounded">
                      {user?.perfil}
                    </span>
                  </div>
                </div>
                <div className="mt-6 space-y-4">
                  <Link 
                    to="/profile"
                    className="flex items-center justify-center gap-2 w-full py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition-all text-sm"
                  >
                    <Edit2 className="w-4 h-4" />
                    Editar Perfil
                  </Link>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">ID Cliente</label>
                    <div className="p-3 bg-slate-50 rounded-lg text-slate-600 font-mono text-xs break-all">
                      {user?.tenant_id}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'finance' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-900">Tipos de Pagamento</h3>
              <button 
                onClick={() => { 
                  setModalType('paymentType'); 
                  setSelectedItem(null); 
                  setFormData({ prazo_dias: 0, local_lancamento: 'Caixa', ativo: true }); 
                  setIsModalOpen(true); 
                }} 
                className="text-indigo-600 text-sm font-bold hover:underline"
              >
                + Adicionar
              </button>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]">
                  <tr>
                    <th className="px-4 py-2">Nome</th>
                    <th className="px-4 py-2">Prazo</th>
                    <th className="px-4 py-2">Parcelas</th>
                    <th className="px-4 py-2">Local</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paymentTypes.map(pt => (
                    <tr key={pt.id}>
                      <td className="px-4 py-2 font-medium">{pt.nome}</td>
                      <td className="px-4 py-2">{pt.prazo_dias} dias</td>
                      <td className="px-4 py-2">{pt.qtd_parcelas || 1}x</td>
                      <td className="px-4 py-2">{pt.local_lancamento}</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${pt.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {pt.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button 
                          onClick={() => {
                            setModalType('paymentType');
                            setSelectedItem(pt);
                            setFormData({ ...pt, ativo: !!pt.ativo });
                            setIsModalOpen(true);
                          }}
                          className="text-indigo-600 hover:text-indigo-900"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-900">Categorias de Contas</h3>
              <button 
                onClick={() => { 
                  setModalType('category'); 
                  setSelectedItem(null); 
                  setFormData({ tipo: 'receita', ativo: true }); 
                  setIsModalOpen(true); 
                }} 
                className="text-indigo-600 text-sm font-bold hover:underline"
              >
                + Adicionar
              </button>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]">
                  <tr>
                    <th className="px-4 py-2">Nome</th>
                    <th className="px-4 py-2">Tipo</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {categories.map(c => (
                    <tr key={c.id}>
                      <td className="px-4 py-2 font-medium">{c.nome}</td>
                      <td className="px-4 py-2 capitalize">{c.tipo}</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${c.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {c.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button 
                          onClick={() => {
                            setModalType('category');
                            setSelectedItem(c);
                            setFormData({ ...c, ativo: !!c.ativo });
                            setIsModalOpen(true);
                          }}
                          className="text-indigo-600 hover:text-indigo-900"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'inventory' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-900">Grupos de Produtos</h3>
              <button 
                onClick={() => { 
                  setModalType('productGroup'); 
                  setSelectedItem(null); 
                  setFormData({ nome: '' }); 
                  setIsModalOpen(true); 
                }} 
                className="text-indigo-600 text-sm font-bold hover:underline"
              >
                + Adicionar
              </button>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]">
                  <tr>
                    <th className="px-4 py-2">Habilitação</th>
                    <th className="px-4 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {productGroups.map(pg => (
                    <tr key={pg.id}>
                      <td className="px-4 py-3 font-medium text-slate-800">{pg.nome}</td>
                      <td className="px-4 py-3 text-right">
                        <button 
                          onClick={() => {
                            setModalType('productGroup');
                            setSelectedItem(pg);
                            setFormData({ ...pg });
                            setIsModalOpen(true);
                          }}
                          className="text-indigo-600 hover:text-indigo-900"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-900">Layouts de Etiquetas</h3>
              <button 
                onClick={() => { 
                  setModalType('labelLayout'); 
                  setSelectedItem(null); 
                  setFormData({ nome: '', largura: 100, altura: 50, colunas: 1, json_config: {} }); 
                  setIsModalOpen(true); 
                }} 
                className="text-indigo-600 text-sm font-bold hover:underline"
              >
                + Adicionar
              </button>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]">
                  <tr>
                    <th className="px-4 py-2">Nome</th>
                    <th className="px-4 py-2">Dimensões</th>
                    <th className="px-4 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {labelLayouts.map(ll => (
                    <tr key={ll.id}>
                      <td className="px-4 py-3 font-medium text-slate-800">{ll.nome}</td>
                      <td className="px-4 py-3 text-slate-500">{ll.largura}x{ll.altura}mm ({ll.colunas} col)</td>
                      <td className="px-4 py-3 text-right">
                        <button 
                          onClick={() => {
                            setModalType('labelLayout');
                            setSelectedItem(ll);
                            setFormData({ ...ll });
                            setIsModalOpen(true);
                          }}
                          className="text-indigo-600 hover:text-indigo-900"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-900">Grupos de Usuários</h3>
              <button 
                onClick={() => { 
                  setModalType('group'); 
                  setSelectedItem(null); 
                  setFormData({ permissoes: {} }); 
                  setIsModalOpen(true); 
                }} 
                className="text-indigo-600 text-sm font-bold hover:underline"
              >
                + Adicionar
              </button>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[300px]">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]">
                  <tr>
                    <th className="px-4 py-2">Nome</th>
                    <th className="px-4 py-2">Módulos Acesso</th>
                    <th className="px-4 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {groups.map(g => (
                    <tr key={g.id}>
                      <td className="px-4 py-2 font-medium flex items-center gap-2">
                        {g.nome}
                        {g.is_master ? <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px] uppercase font-bold">Master</span> : null}
                      </td>
                      <td className="px-4 py-2">
                        {Object.keys(g.permissoes).filter(k => g.permissoes[k]?.acessar).join(', ')}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button 
                          onClick={() => {
                            setModalType('group');
                            setSelectedItem(g);
                            setFormData(g);
                            setIsModalOpen(true);
                          }}
                          className={`text-indigo-600 hover:text-indigo-900 ${g.is_master ? 'opacity-50 pointer-events-none' : ''}`}
                          disabled={g.is_master}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-900">Usuários</h3>
              <button 
                onClick={() => { 
                  setModalType('user'); 
                  setSelectedItem(null); 
                  setFormData({ ativo: true }); 
                  setIsModalOpen(true); 
                }} 
                className="text-indigo-600 text-sm font-bold hover:underline"
              >
                + Adicionar
              </button>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[500px]">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]">
                  <tr>
                    <th className="px-4 py-2">Nome</th>
                    <th className="px-4 py-2">Email</th>
                    <th className="px-4 py-2">Grupo</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map(u => (
                    <tr key={u.id}>
                      <td className="px-4 py-2 font-medium">{u.nome}</td>
                      <td className="px-4 py-2">{u.email}</td>
                      <td className="px-4 py-2">{u.grupo_nome || '-'}</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${u.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {u.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button 
                          onClick={() => {
                            setModalType('user');
                            setSelectedItem(u);
                            setFormData({ ...u, ativo: !!u.ativo });
                            setIsModalOpen(true);
                          }}
                          className={`text-indigo-600 hover:text-indigo-900 ${u.perfil === 'superadmin' ? 'opacity-50 pointer-events-none' : ''}`}
                          disabled={u.perfil === 'superadmin'}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }} 
            animate={{ scale: 1, opacity: 1 }} 
            className={`bg-white w-full ${modalType === 'labelLayout' || modalType === 'group' ? 'max-w-2xl' : 'max-w-md'} rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden`}
          >
            <div className="flex justify-between items-center p-6 border-b border-slate-100 shrink-0">
              <h2 className="text-xl font-bold text-slate-900">
                {modalType === 'category' && (selectedItem ? 'Editar Categoria' : 'Nova Categoria')}
                {modalType === 'paymentType' && (selectedItem ? 'Editar Tipo de Pagamento' : 'Novo Tipo de Pagamento')}
                {modalType === 'group' && (selectedItem ? 'Editar Grupo' : 'Novo Grupo')}
                {modalType === 'user' && (selectedItem ? 'Editar Usuário' : 'Novo Usuário')}
                {modalType === 'productGroup' && (selectedItem ? 'Editar Grupo de Produto' : 'Novo Grupo de Produto')}
                {modalType === 'labelLayout' && (selectedItem ? 'Editar Layout de Etiqueta' : 'Novo Layout de Etiqueta')}
              </h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-2 rounded-xl transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleSubmitModal} className="flex flex-col flex-grow overflow-hidden" noValidate>
              <div className="p-6 overflow-y-auto space-y-4">
              {modalType === 'paymentType' && (
                <>
                  <FormField label="Nome" error={financeFieldErrors.nome} required>
                    <input 
                      type="text" 
                      className={`w-full px-4 py-2 rounded-xl border outline-none transition-all ${financeFieldErrors.nome ? 'border-rose-500 bg-rose-50 focus:ring-rose-200' : 'border-slate-200 focus:ring-indigo-500'}`}
                      value={formData.nome || ''} 
                      onChange={e => {
                        setFormData({...formData, nome: e.target.value});
                        if (financeFieldErrors.nome) setFinanceFieldErrors({...financeFieldErrors, nome: ''});
                      }} 
                    />
                  </FormField>
                  <FormField label="Prazo de Recebimento (dias)" error={financeFieldErrors.prazo_dias} required>
                    <input 
                      type="number" 
                      className={`w-full px-4 py-2 rounded-xl border outline-none transition-all ${financeFieldErrors.prazo_dias ? 'border-rose-500 bg-rose-50 focus:ring-rose-200' : 'border-slate-200 focus:ring-indigo-500'}`}
                      value={formData.prazo_dias || 0} 
                      onChange={e => {
                        setFormData({...formData, prazo_dias: parseInt(e.target.value)});
                        if (financeFieldErrors.prazo_dias) setFinanceFieldErrors({...financeFieldErrors, prazo_dias: ''});
                      }} 
                    />
                  </FormField>
                  <FormField label="Quantidade de Parcelas" error={financeFieldErrors.qtd_parcelas} required>
                    <input 
                      type="number" 
                      className={`w-full px-4 py-2 rounded-xl border outline-none transition-all ${financeFieldErrors.qtd_parcelas ? 'border-rose-500 bg-rose-50 focus:ring-rose-200' : 'border-slate-200 focus:ring-indigo-500'}`}
                      value={formData.qtd_parcelas || 1} 
                      onChange={e => {
                        setFormData({...formData, qtd_parcelas: parseInt(e.target.value)});
                        if (financeFieldErrors.qtd_parcelas) setFinanceFieldErrors({...financeFieldErrors, qtd_parcelas: ''});
                      }} 
                    />
                  </FormField>
                  <FormField label="Local de Lançamento">
                    <select className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none" value={formData.local_lancamento || 'Caixa'} onChange={e => setFormData({...formData, local_lancamento: e.target.value})}>
                      <option value="Caixa">Caixa</option>
                      <option value="Banco">Banco</option>
                      <option value="Cartão">Cartão</option>
                      <option value="Receber">Receber</option>
                      <option value="Pagar">Pagar</option>
                    </select>
                  </FormField>

                  <div className="bg-slate-50 p-4 rounded-xl space-y-4">
                    <div className="flex items-center gap-2">
                      <input 
                        type="checkbox" 
                        id="eh_cartao"
                        checked={formData.eh_cartao ?? false} 
                        onChange={e => setFormData({...formData, eh_cartao: e.target.checked, tipo_cartao: e.target.checked ? 'credito' : null})} 
                        className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                      />
                      <label htmlFor="eh_cartao" className="text-sm font-semibold text-slate-700">É Cartão?</label>
                    </div>

                    {formData.eh_cartao && (
                      <FormField label="Tipo de Cartão">
                        <select 
                          className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none" 
                          value={formData.tipo_cartao || 'credito'} 
                          onChange={e => setFormData({...formData, tipo_cartao: e.target.value})}
                        >
                          <option value="credito">Crédito</option>
                          <option value="debito">Débito</option>
                        </select>
                      </FormField>
                    )}

                    {(formData.qtd_parcelas > 1 || !formData.qtd_parcelas) && (
                      <FormField label="Valor Mín. por Parcela (R$)">
                        <input 
                          type="number" 
                          step="0.01"
                          placeholder="0,00"
                          className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                          value={formData.valor_min_parcela || ''} 
                          onChange={e => setFormData({...formData, valor_min_parcela: parseFloat(e.target.value) || 0})} 
                        />
                        <p className="text-[10px] text-slate-400 mt-1">Deixe 0 para não validar valor mínimo.</p>
                      </FormField>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      id="pt_ativo"
                      checked={formData.ativo ?? true} 
                      onChange={e => setFormData({...formData, ativo: e.target.checked})} 
                      className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                    />
                    <label htmlFor="pt_ativo" className="text-sm font-semibold text-slate-700">Ativo</label>
                  </div>
                </>
              )}

              {modalType === 'productGroup' && (
                <>
                  <FormField label="Nome do Grupo" error={financeFieldErrors.nome} required>
                    <input 
                      type="text" 
                      className={`w-full px-4 py-2 rounded-xl border outline-none transition-all ${financeFieldErrors.nome ? 'border-rose-500 bg-rose-50 focus:ring-rose-200' : 'border-slate-200 focus:ring-indigo-500'}`}
                      value={formData.nome || ''} 
                      onChange={e => {
                        setFormData({...formData, nome: e.target.value});
                        if (financeFieldErrors.nome) setFinanceFieldErrors({...financeFieldErrors, nome: ''});
                      }} 
                    />
                  </FormField>
                </>
              )}

              {modalType === 'labelLayout' && (
                <>
                  <FormField label="Nome do Layout" error={financeFieldErrors.nome} required>
                    <input 
                      type="text" 
                      className={`w-full px-4 py-2 rounded-xl border outline-none transition-all ${financeFieldErrors.nome ? 'border-rose-500 bg-rose-50 focus:ring-rose-200' : 'border-slate-200 focus:ring-indigo-500'}`}
                      value={formData.nome || ''} 
                      onChange={e => {
                        setFormData({...formData, nome: e.target.value});
                        if (financeFieldErrors.nome) setFinanceFieldErrors({...financeFieldErrors, nome: ''});
                      }} 
                    />
                  </FormField>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField label="Largura (mm)">
                      <input type="number" className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none" value={formData.largura || 100} onChange={e => setFormData({...formData, largura: Number(e.target.value)})} />
                    </FormField>
                    <FormField label="Altura (mm)">
                      <input type="number" className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none" value={formData.altura || 50} onChange={e => setFormData({...formData, altura: Number(e.target.value)})} />
                    </FormField>
                  </div>
                  <FormField label="Colunas na Folha">
                    <input type="number" className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none" value={formData.colunas || 1} onChange={e => setFormData({...formData, colunas: Number(e.target.value)})} />
                  </FormField>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <FormField label="Margem Topo (mm)">
                      <input type="number" step="0.1" className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none" value={formData.json_config?.margins?.top ?? 1} onChange={e => setFormData({...formData, json_config: { ...formData.json_config, margins: { ...(formData.json_config?.margins || { top: 1, left: 1, right: 1, bottom: 1 }), top: Number(e.target.value) } }})} />
                    </FormField>
                    <FormField label="Margem Esq. (mm)">
                      <input type="number" step="0.1" className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none" value={formData.json_config?.margins?.left ?? 1} onChange={e => setFormData({...formData, json_config: { ...formData.json_config, margins: { ...(formData.json_config?.margins || { top: 1, left: 1, right: 1, bottom: 1 }), left: Number(e.target.value) } }})} />
                    </FormField>
                    <FormField label="Margem Dir. (mm)">
                      <input type="number" step="0.1" className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none" value={formData.json_config?.margins?.right ?? 1} onChange={e => setFormData({...formData, json_config: { ...formData.json_config, margins: { ...(formData.json_config?.margins || { top: 1, left: 1, right: 1, bottom: 1 }), right: Number(e.target.value) } }})} />
                    </FormField>
                    <FormField label="Margem Rodapé (mm)">
                      <input type="number" step="0.1" className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none" value={formData.json_config?.margins?.bottom ?? 1} onChange={e => setFormData({...formData, json_config: { ...formData.json_config, margins: { ...(formData.json_config?.margins || { top: 1, left: 1, right: 1, bottom: 1 }), bottom: Number(e.target.value) } }})} />
                    </FormField>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField label="Espaç. Interno (mm)">
                      <input type="number" step="0.1" className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none" value={formData.json_config?.spacing ?? 0.5} onChange={e => setFormData({...formData, json_config: { ...formData.json_config, spacing: Number(e.target.value) }})} />
                    </FormField>

                    <FormField label="Gap Horizontal (mm)">
                      <input type="number" step="0.1" className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none" value={formData.json_config?.column_gap ?? 0} onChange={e => setFormData({...formData, json_config: { ...formData.json_config, column_gap: Number(e.target.value) }})} />
                    </FormField>

                    <FormField label="Gap Vertical (mm)">
                      <input type="number" step="0.1" className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none" value={formData.json_config?.row_gap ?? 0} onChange={e => setFormData({...formData, json_config: { ...formData.json_config, row_gap: Number(e.target.value) }})} />
                    </FormField>
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-bold text-slate-700 mb-2">Informações na Etiqueta</label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
                      {[
                        { key: 'showNome', label: 'Nome do Produto' },
                        { key: 'showPreco', label: 'Preço de Venda' },
                        { key: 'showMarca', label: 'Marca' },
                        { key: 'showBarcode', label: 'Cód. Barras' },
                        { key: 'showId', label: 'Cód. Interno (ID)' },
                        { key: 'showGrupo', label: 'Grupo' }
                      ].map(field => (
                        <div key={field.key} className="flex items-center gap-2">
                          <input 
                            type="checkbox" 
                            id={`lbl_${field.key}`}
                            checked={formData.json_config?.fields?.[field.key] ?? (field.key === 'showNome' || field.key === 'showPreco' || field.key === 'showBarcode')}
                            onChange={e => {
                              const defaultFields = { showNome: true, showPreco: true, showBarcode: true, showMarca: false, showId: false, showGrupo: false };
                              const currentFields = formData.json_config?.fields || defaultFields;
                              const fields = { ...currentFields, [field.key]: e.target.checked };
                              setFormData({ ...formData, json_config: { ...formData.json_config, fields } });
                            }}
                            className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                          />
                          <label htmlFor={`lbl_${field.key}`} className="text-xs font-semibold text-slate-700 cursor-pointer select-none">{field.label}</label>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Improved Preview */}
                  <div className="bg-slate-100 p-8 rounded-3xl border border-slate-200 flex flex-col items-center">
                    <p className="text-[10px] font-black text-slate-400 mb-6 uppercase tracking-[0.2em]">Escala Realista (Ajustável)</p>
                    <div className="bg-white border shadow-2xl flex flex-col items-center overflow-hidden"
                      style={{ 
                        width: `${(formData.largura || 100) * 3}px`, 
                        height: `${(formData.altura || 50) * 3}px`,
                        padding: `${(formData.json_config?.margins?.top || 1) * 3}px ${(formData.json_config?.margins?.right || 1) * 3}px ${(formData.json_config?.margins?.bottom || 1) * 3}px ${(formData.json_config?.margins?.left || 1) * 3}px`,
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                      }}
                    >
                      <div className="w-full h-full border border-slate-50 flex flex-col items-center justify-center relative bg-white">
                        <div className="flex flex-col items-center w-full grow" style={{ gap: `${(formData.json_config?.spacing || 0.5) * 3}px` }}>
                          {(formData.json_config?.fields?.showNome ?? true) && (
                            <div className="w-full text-center truncate leading-none uppercase" style={{ fontSize: `${Math.max(3, Math.min(10, (formData.altura || 50) / 5))}px`, fontWeight: '900' }}>Produto Teste</div>
                          )}
                          {(formData.json_config?.fields?.showMarca ?? false) && (
                            <div className="w-full text-center truncate italic opacity-70 leading-none" style={{ fontSize: `${Math.max(3, Math.min(8, (formData.altura || 50) / 6))}px` }}>Marca Exemplo</div>
                          )}
                          {(formData.json_config?.fields?.showGrupo ?? false) && (
                            <div className="w-full text-center truncate opacity-60 leading-none" style={{ fontSize: `${Math.max(3, Math.min(7, (formData.altura || 50) / 7))}px` }}>Grupo Exemplo</div>
                          )}
                          {(formData.json_config?.fields?.showBarcode ?? true) && (
                            <div className="flex flex-col items-center w-full overflow-hidden">
                              <div className="h-[20%] min-h-[4px] w-full border-l border-r border-slate-900 border-b border-t flex items-center justify-center bg-white"></div>
                              <span style={{ fontSize: '3px' }} className="font-mono mt-0.5 tracking-widest uppercase">789123456</span>
                            </div>
                          )}
                        </div>
                        <div className="flex justify-between items-end w-full mt-auto">
                          {(formData.json_config?.fields?.showId ?? false) && (
                            <span style={{ fontSize: `${Math.max(2, Math.min(7, (formData.altura || 50) / 8))}px` }} className="text-slate-400 font-black">#101</span>
                          )}
                          {(formData.json_config?.fields?.showPreco ?? true) && (
                            <span style={{ fontSize: `${Math.max(4, Math.min(12, (formData.altura || 50) / 3.2))}px`, fontWeight: '900' }} className="ml-auto text-indigo-600">R$ 99.90</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-4 text-[10px] text-slate-400">
                      <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                      <span className="italic">Visualização em tempo real conforme configurações</span>
                    </div>
                  </div>
                </>
              )}

              {modalType === 'category' && (
                <>
                  <FormField label="Nome" error={financeFieldErrors.nome} required>
                    <input 
                      type="text" 
                      className={`w-full px-4 py-2 rounded-xl border outline-none transition-all ${financeFieldErrors.nome ? 'border-rose-500 bg-rose-50 focus:ring-rose-200' : 'border-slate-200 focus:ring-indigo-500'}`}
                      value={formData.nome || ''} 
                      onChange={e => {
                        setFormData({...formData, nome: e.target.value});
                        if (financeFieldErrors.nome) setFinanceFieldErrors({...financeFieldErrors, nome: ''});
                      }} 
                    />
                  </FormField>
                  <FormField label="Tipo">
                    <select className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none" value={formData.tipo || 'receita'} onChange={e => setFormData({...formData, tipo: e.target.value})}>
                      <option value="receita">Receita</option>
                      <option value="despesa">Despesa</option>
                    </select>
                  </FormField>
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      id="cat_ativo"
                      checked={formData.ativo ?? true} 
                      onChange={e => setFormData({...formData, ativo: e.target.checked})} 
                      className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                    />
                    <label htmlFor="cat_ativo" className="text-sm font-semibold text-slate-700">Ativo</label>
                  </div>
                </>
              )}

              {modalType === 'group' && (
                <>
                  <FormField label="Nome" error={financeFieldErrors.nome} required>
                    <input 
                      type="text" 
                      className={`w-full px-4 py-2 rounded-xl border outline-none transition-all ${financeFieldErrors.nome ? 'border-rose-500 bg-rose-50 focus:ring-rose-200' : 'border-slate-200 focus:ring-indigo-500'}`}
                      value={formData.nome || ''} 
                      onChange={e => {
                        setFormData({...formData, nome: e.target.value});
                        if (financeFieldErrors.nome) setFinanceFieldErrors({...financeFieldErrors, nome: ''});
                      }} 
                    />
                  </FormField>
                  
                  <div className="space-y-4 max-h-[300px] overflow-y-auto p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <h4 className="font-bold text-slate-900 text-sm">Permissões Detalhadas</h4>
                    {[
                      { mod: 'dashboard', label: 'Dashboard', actions: [{key: 'acessar', label: 'Acessar Módulo'}, {key: 'estatisticas', label: 'Ver Estatísticas'}] },
                      { mod: 'financeiro', label: 'Financeiro', actions: [{key: 'acessar', label: 'Acessar Módulo'}, {key: 'lancar', label: 'Lançar/Baixar'}, {key: 'editar', label: 'Editar'}, {key: 'cancelar', label: 'Cancelar'}, {key: 'estornar', label: 'Estornar'}] },
                      { mod: 'vendas', label: 'Vendas', actions: [{key: 'acessar', label: 'Acessar Módulo'}, {key: 'lancar', label: 'Nova Venda'}, {key: 'cancelar', label: 'Cancelar Venda'}, {key: 'relatorios', label: 'Ver Relatórios'}] },
                      { mod: 'os', label: 'Ordem de Serviço', actions: [{key: 'acessar', label: 'Acessar Módulo'}, {key: 'lancar', label: 'Nova OS'}, {key: 'editar', label: 'Editar OS'}, {key: 'excluir', label: 'Cancelar/Excluir'}] },
                      { mod: 'mesas', label: 'Mesas & Comandas', actions: [{key: 'acessar', label: 'Acessar Módulo'}, {key: 'lancar', label: 'Lançar Itens'}, {key: 'fechar', label: 'Fechar Mesa/Comanda'}, {key: 'cancelar', label: 'Cancelar'}] },
                      { mod: 'pdv', label: 'PDV', actions: [{key: 'acessar', label: 'Acessar Módulo'}, {key: 'vender', label: 'Realizar Venda'}, {key: 'cancelar', label: 'Cancelar'}] },
                      { mod: 'estoque', label: 'Estoque', actions: [{key: 'acessar', label: 'Acessar Módulo'}, {key: 'editar', label: 'Lançar Movimentação'}, {key: 'excluir', label: 'Excluir'}] },
                      { mod: 'cadastros', label: 'Cadastros', actions: [{key: 'acessar', label: 'Acessar Módulo'}, {key: 'editar', label: 'Criar/Editar'}, {key: 'excluir', label: 'Excluir'}] },
                      { mod: 'configuracoes', label: 'Configurações', actions: [{key: 'acessar', label: 'Acessar Módulo'}, {key: 'editar', label: 'Alterar Configurações'}] }
                    ].map(({ mod, label, actions }) => (
                      <div key={mod} className="border-b border-slate-200 pb-3 last:border-0 last:pb-0">
                        <h5 className="font-bold text-slate-800 text-xs uppercase mb-2">{label}</h5>
                        <div className="grid grid-cols-2 gap-2">
                          {actions.map(action => (
                            <div key={action.key} className="flex items-center gap-2">
                              <input 
                                type="checkbox" 
                                id={`perm_${mod}_${action.key}`}
                                checked={formData.permissoes?.[mod]?.[action.key] || false}
                                onChange={e => {
                                  const newPerms = { ...(formData.permissoes || {}) };
                                  if (!newPerms[mod]) newPerms[mod] = {};
                                  newPerms[mod][action.key] = e.target.checked;
                                  setFormData({ ...formData, permissoes: newPerms });
                                }}
                                className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                              />
                              <label htmlFor={`perm_${mod}_${action.key}`} className="text-[11px] font-semibold text-slate-700">{action.label}</label>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {modalType === 'user' && (
                <>
                  <FormField label="Nome" error={financeFieldErrors.nome} required>
                    <input 
                      type="text" 
                      className={`w-full px-4 py-2 rounded-xl border outline-none transition-all ${financeFieldErrors.nome ? 'border-rose-500 bg-rose-50 focus:ring-rose-200' : 'border-slate-200 focus:ring-indigo-500'}`}
                      value={formData.nome || ''} 
                      onChange={e => {
                        setFormData({...formData, nome: e.target.value});
                        if (financeFieldErrors.nome) setFinanceFieldErrors({...financeFieldErrors, nome: ''});
                      }} 
                    />
                  </FormField>
                  
                  <FormField label="E-mail" error={financeFieldErrors.email} required>
                    <input 
                      type="email" 
                      disabled={!!selectedItem}
                      className={`w-full px-4 py-2 rounded-xl border outline-none transition-all ${financeFieldErrors.email ? 'border-rose-500 bg-rose-50 focus:ring-rose-200' : 'border-slate-200 focus:ring-indigo-500'} ${selectedItem ? 'bg-slate-100 text-slate-500' : ''}`}
                      value={formData.email || ''} 
                      onChange={e => {
                        setFormData({...formData, email: e.target.value});
                        if (financeFieldErrors.email) setFinanceFieldErrors({...financeFieldErrors, email: ''});
                      }} 
                    />
                  </FormField>

                  <FormField label="Grupo" error={financeFieldErrors.grupo_id} required>
                    <select 
                      className={`w-full px-4 py-2 rounded-xl border outline-none transition-all ${financeFieldErrors.grupo_id ? 'border-rose-500 bg-rose-50 focus:ring-rose-200' : 'border-slate-200 focus:ring-indigo-500'}`}
                      value={formData.grupo_id || ''} 
                      onChange={e => {
                        setFormData({...formData, grupo_id: e.target.value});
                        if (financeFieldErrors.grupo_id) setFinanceFieldErrors({...financeFieldErrors, grupo_id: ''});
                      }}
                    >
                      <option value="">Selecione um grupo...</option>
                      {groups.map(g => (
                        <option key={g.id} value={g.id}>{g.nome}</option>
                      ))}
                    </select>
                  </FormField>

                  {selectedItem && (
                    <div className="flex items-center gap-2">
                      <input 
                        type="checkbox" 
                        id="user_ativo"
                        checked={formData.ativo ?? true} 
                        onChange={e => setFormData({...formData, ativo: e.target.checked})} 
                        className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                      />
                      <label htmlFor="user_ativo" className="text-sm font-semibold text-slate-700">Ativo</label>
                    </div>
                  )}
                </>
              )}

              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50 shrink-0">
                <button type="submit" disabled={isModalSubmitting} className="w-full bg-indigo-600 text-white py-3.5 rounded-2xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                  {isModalSubmitting ? 'Salvando...' : selectedItem ? 'Atualizar Alterações' : 'Cadastrar Registro'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
      {activeTab === 'integrations' && (
        <div className="space-y-6 max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 sm:p-6 md:p-8 space-y-6 md:space-y-8">
              <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                  <Globe className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 line-clamp-1">Integrações</h3>
                  <p className="text-xs text-slate-500 line-clamp-1">Configure APIs externas e notificações</p>
                </div>
              </div>

              <div className="space-y-10">
                <section className="space-y-4">
                  <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Send className="w-4 h-4" /> Evolution API (WhatsApp)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <FormField label="URL da API">
                        <input 
                          type="url" 
                          className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                          placeholder="https://api.verificion.com"
                          value={company.whatsapp_api_url || ''}
                          onChange={e => setCompany({...company, whatsapp_api_url: e.target.value})}
                        />
                      </FormField>
                    </div>
                    <div>
                      <FormField label="API Key">
                        <input 
                          type="password" 
                          className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                          value={company.whatsapp_api_key || ''}
                          onChange={e => setCompany({...company, whatsapp_api_key: e.target.value})}
                        />
                      </FormField>
                    </div>
                    <div>
                      <FormField label="Nome da Instância">
                        <input 
                          type="text" 
                          className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                          placeholder="MinhaInstancia"
                          value={company.whatsapp_instance || ''}
                          onChange={e => setCompany({...company, whatsapp_instance: e.target.value})}
                        />
                      </FormField>
                    </div>
                    <div className="md:col-span-2">
                      <FormField 
                        label="Template Mensagem Agendamento (WhatsApp)" 
                        helpText="Use {nome_cliente} e {data_agendamento} para personalizar."
                      >
                        <textarea 
                          className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none min-h-[100px] text-sm"
                          placeholder="Olá {nome_cliente}, seu agendamento está confirmado para {data_agendamento}."
                          value={company.whatsapp_msg_agendamento || ''}
                          onChange={e => setCompany({...company, whatsapp_msg_agendamento: e.target.value})}
                        />
                      </FormField>
                    </div>
                    <div className="md:col-span-2">
                      <label className={`flex items-center gap-3 p-3 rounded-xl border border-slate-100 transition-all ${!canUseWhatsApp ? 'bg-slate-100 opacity-70 cursor-not-allowed' : 'bg-slate-50 cursor-pointer hover:bg-slate-100'}`}>
                        <input 
                          type="checkbox" 
                          disabled={!canUseWhatsApp}
                          className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          checked={company.whatsapp_automatico || false}
                          onChange={e => setCompany({...company, whatsapp_automatico: e.target.checked})}
                        />
                        <div>
                          <p className="text-sm font-bold text-slate-700">Lembrete Automático via WhatsApp</p>
                          <p className="text-[11px] text-slate-500">Enviar automaticamente para o cliente 2 horas antes do agendamento. {!canUseWhatsApp && <span className="text-rose-500 font-bold ml-1">(Não disponível no seu plano)</span>}</p>
                        </div>
                      </label>
                    </div>
                    <div className="md:col-span-2 bg-slate-50 p-4 rounded-xl space-y-3">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-tight">Testar Envio (WhatsApp)</p>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input 
                          type="text" 
                          placeholder="Número com DDD (ex: 11999999999)"
                          className="w-full sm:flex-1 px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                          value={testPhone}
                          onChange={e => setTestPhone(e.target.value)}
                        />
                        <button 
                          type="button"
                          onClick={handleTestWhatsApp}
                          disabled={isTesting}
                          className="w-full sm:w-auto bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all disabled:opacity-50"
                        >
                          <Send className="w-4 h-4" />
                          {isTesting ? 'Testando...' : 'Testar Envio'}
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                <hr className="border-slate-100" />

                <section className="space-y-4">
                  <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Mail className="w-4 h-4" /> E-mail Marketing (SMTP)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <FormField label="Servidor SMTP (Host)">
                        <input 
                          type="text" 
                          className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                          placeholder="smtp.gmail.com"
                          value={company.email_host || ''}
                          onChange={e => setCompany({...company, email_host: e.target.value})}
                        />
                      </FormField>
                    </div>
                    <div>
                      <FormField label="Porta SMTP">
                        <input 
                          type="number" 
                          className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                          placeholder="587 ou 465"
                          value={company.email_port || ''}
                          onChange={e => setCompany({...company, email_port: e.target.value})}
                        />
                      </FormField>
                    </div>
                    <div>
                      <FormField label="E-mail de Envio (User)">
                        <input 
                          type="email" 
                          className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                          placeholder="contato@empresa.com"
                          value={company.email_user || ''}
                          onChange={e => setCompany({...company, email_user: e.target.value})}
                        />
                      </FormField>
                    </div>
                    <div>
                      <FormField label="Senha SMTP">
                        <input 
                          type="password" 
                          className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                          value={company.email_pass || ''}
                          onChange={e => setCompany({...company, email_pass: e.target.value})}
                        />
                      </FormField>
                    </div>
                    <div>
                      <FormField label="Nome de Exibição (From)">
                        <input 
                          type="text" 
                          className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                          placeholder="Minha Empresa"
                          value={company.email_from || ''}
                          onChange={e => setCompany({...company, email_from: e.target.value})}
                        />
                      </FormField>
                    </div>
                    <div className="md:col-span-2">
                      <FormField 
                        label="Template Mensagem Agendamento (E-mail)" 
                        helpText="Use {nome_cliente} e {data_agendamento} para personalizar."
                      >
                        <textarea 
                          className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none min-h-[100px] text-sm"
                          placeholder="Olá {nome_cliente}, seu agendamento está confirmado para {data_agendamento}."
                          value={company.email_msg_agendamento || ''}
                          onChange={e => setCompany({...company, email_msg_agendamento: e.target.value})}
                        />
                      </FormField>
                    </div>
                    <div className="md:col-span-2">
                      <label className={`flex items-center gap-3 p-3 rounded-xl border border-slate-100 transition-all ${!canUseEmail ? 'bg-slate-100 opacity-70 cursor-not-allowed' : 'bg-slate-50 cursor-pointer hover:bg-slate-100'}`}>
                        <input 
                          type="checkbox" 
                          disabled={!canUseEmail}
                          className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          checked={company.email_automatico || false}
                          onChange={e => setCompany({...company, email_automatico: e.target.checked})}
                        />
                        <div>
                          <p className="text-sm font-bold text-slate-700">Lembrete Automático via E-mail</p>
                          <p className="text-[11px] text-slate-500">Enviar automaticamente para o cliente 2 horas antes do agendamento. {!canUseEmail && <span className="text-rose-500 font-bold ml-1">(Não disponível no seu plano)</span>}</p>
                        </div>
                      </label>
                    </div>
                    <div className="md:col-span-2 bg-slate-50 p-4 rounded-xl space-y-3">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-tight">Testar Envio (E-mail)</p>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input 
                          type="email" 
                          placeholder="E-mail de destino para o teste"
                          className="w-full sm:flex-1 px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                          value={testEmail}
                          onChange={e => setTestEmail(e.target.value)}
                        />
                        <button 
                          type="button"
                          onClick={handleTestEmail}
                          disabled={isTestingEmail}
                          className="w-full sm:w-auto bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all disabled:opacity-50"
                        >
                          <Send className="w-4 h-4" />
                          {isTestingEmail ? 'Testando...' : 'Testar Envio'}
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                <div className="pt-8 border-t border-slate-100 flex flex-col sm:flex-row justify-end">
                  <button 
                    onClick={() => handleSaveCompany(null as any)}
                    disabled={loading}
                    className="w-full sm:w-auto bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
                  >
                    {loading ? 'Salvando...' : 'Salvar Alterações'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
