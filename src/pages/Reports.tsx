import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { AlertCircle, FileText, FileSpreadsheet, Eye, RefreshCw } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { formatMoney, formatDate, formatTime, formatDateTime } from "../utils/format";

export const Reports = () => {
  const { type } = useParams();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const canExportExcel = user?.perfil === 'superadmin' || user?.modulos?.includes("export_excel");
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .split("T")[0];
  });
  
  const [notificationDate, setNotificationDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [notificationTimeFilter, setNotificationTimeFilter] = useState("1h");

  const [statusFilter, setStatusFilter] = useState("todos");
  const [origemFilter, setOrigemFilter] = useState("Todas");
  const [personFilter, setPersonFilter] = useState("todos");
  const [financeTypeFilter, setFinanceTypeFilter] = useState<string[]>([
    "Pagar",
    "Receber",
    "Caixa",
    "Banco",
    "Cartão",
  ]);
  const [financeOpTypeFilter, setFinanceOpTypeFilter] = useState("todos");
  const [financeStatusFilter, setFinanceStatusFilter] = useState("todos");
  const [stockStatusFilter, setStockStatusFilter] = useState("todos");
  const [stockGroupFilter, setStockGroupFilter] = useState("todos");
  const [stockTypeFilter, setStockTypeFilter] = useState("todos");
  const [stockSearchTerm, setStockSearchTerm] = useState("");
  const [stockBrandFilter, setStockBrandFilter] = useState("");
  const [peopleFilter, setPeopleFilter] = useState("todos"); // 'todos' ou 'aniversariantes'
  const [professionalFilter, setProfessionalFilter] = useState("todos");
  const [agendaStatusFilter, setAgendaStatusFilter] = useState("todos");
  const [groupBy, setGroupBy] = useState("nenhum");

  const [pessoas, setPessoas] = useState<any[]>([]);
  const [grupos, setGrupos] = useState<any[]>([]);
  const [professionals, setProfessionals] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/pessoas", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then(setPessoas)
      .catch((err) => console.error("Error fetching pessoas for filter:", err));
      
    fetch("/api/inventory/groups", { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(setGrupos)
      .catch(err => console.error("Error fetching groups:", err));

    fetch("/api/users", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => setProfessionals(Array.isArray(data) ? data : []))
      .catch((err) => console.error("Error fetching professionals for filter:", err));
  }, [token]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    let url = "";
    switch (type) {
      case "sales":
        url = "/api/sales";
        break;
      case "inventory":
        url = "/api/products";
        break;
      case "finance":
        url = "/api/finance/accounts";
        break;
      case "people":
        url = "/api/pessoas";
        break;
      case "agenda":
        url = "/api/agenda?includeCanceled=true";
        break;
      case "notifications":
        url = `/api/reports/notifications?date=${notificationDate}&time=${notificationTimeFilter}`;
        break;
      default:
        return;
    }

    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "Erro ao carregar dados");
        setData(Array.isArray(d) ? d : []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching report data:", err);
        setError(err.message);
        setLoading(false);
      });
  }, [type, token, notificationDate, notificationTimeFilter]);

  const getTitle = () => {
    switch (type) {
      case "sales":
        return "Relatório de Vendas";
      case "inventory":
        return "Relatório de Estoque";
      case "finance":
        return "Relatório Financeiro";
      case "people":
        return "Relatório de Pessoas";
      case "agenda":
        return "Relatório de Agendamentos";
      case "notifications":
        return "Logs de Notificações";
      default:
        return "Relatório";
    }
  };

  const handlePrint = () => {
    const params = new URLSearchParams({
      start: startDate,
      end: endDate,
      status: statusFilter,
      origem: origemFilter,
      fType: financeTypeFilter.join(","),
      fOpType: financeOpTypeFilter,
      fStatus: financeStatusFilter,
      person: personFilter,
      stockStatus: stockStatusFilter,
      stockGroup: stockGroupFilter,
      stockType: stockTypeFilter,
      stockSearch: stockSearchTerm,
      stockBrand: stockBrandFilter,
      peopleStatus: peopleFilter,
      professional: professionalFilter,
      aStatus: agendaStatusFilter,
      groupBy: groupBy,
      t: token,
    });
    window.open(`/print/report/${type}?${params.toString()}`, "_blank");
  };

  const getFilteredData = () => {
    let filteredData = [...data];

    if (type === "sales") {
      filteredData = data.filter((s) => {
        if (!s.data_venda) return false;
        // Permite Venda, Mesa (Comanda) e OS
        if (s.tipo !== "venda" && s.tipo !== "mesa" && s.tipo !== "os") return false;
        const dateStr = s.data_venda.includes("T")
          ? s.data_venda
          : s.data_venda.replace(" ", "T");
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return false;
        const saleDate = d.toISOString().split("T")[0];
        const matchesDate = saleDate >= startDate && saleDate <= endDate;
        const matchesStatus =
          statusFilter === "todos" || s.status === statusFilter;
        
        // Normalização da origem para comparação robusta
        const normalizeOrigem = (o: string | null, tipo: string) => {
            if (tipo === 'os') return "OS";
            if (!o) return "Balcão";
            const upper = o.toUpperCase();
            if (upper === "BALCAO" || upper === "BALCÃO") return "Balcão";
            if (upper === "MESA" || upper === "COMANDA") return "Mesa";
            return o;
        };

        const matchesOrigem =
          origemFilter === "Todas" || normalizeOrigem(s.origem, s.tipo) === origemFilter;
        const matchesPerson =
          personFilter === "todos" || s.pessoa_id?.toString() === personFilter;
        return matchesDate && matchesStatus && matchesOrigem && matchesPerson;
      });
    }

    if (type === "finance") {
      filteredData = data.filter((a) => {
        if (!a.vencimento) return false;
        const dateStr = a.vencimento.includes("T")
          ? a.vencimento
          : a.vencimento + "T12:00:00";
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return false;
        const dueDate = d.toISOString().split("T")[0];
        const matchesDate = dueDate >= startDate && dueDate <= endDate;

        const normalizeLocal = (l: string | null, t: "receita" | "despesa") => {
          if (!l) return t === "receita" ? "Receber" : "Pagar";
          if (l === "Contas a Receber") return "Receber";
          if (l === "Contas a Pagar") return "Pagar";
          return l;
        };
        const local = normalizeLocal(a.local, a.tipo);
        const matchesType = financeTypeFilter.includes(local);
        const matchesOpType =
          financeOpTypeFilter === "todos" ||
          (financeOpTypeFilter === "entrada"
            ? a.tipo === "receita"
            : a.tipo === "despesa");

        const matchesStatus =
          financeStatusFilter === "todos" ||
          (financeStatusFilter === "pago" ? a.pago : !a.pago);
        const matchesPerson =
          personFilter === "todos" || a.pessoa_id?.toString() === personFilter;
        return (
          matchesDate &&
          matchesType &&
          matchesOpType &&
          matchesStatus &&
          matchesPerson
        );
      });
    }

    if (type === "inventory") {
      filteredData = data.filter((p) => {
        const estoque = p.estoque_atual || 0;
        const minimo = p.estoque_minimo || 0;

        let matchesStatus = true;
        switch (stockStatusFilter) {
          case "minimo":
            matchesStatus = estoque > 0 && estoque <= minimo; break;
          case "regular":
            matchesStatus = estoque > minimo; break;
          case "negativo":
            matchesStatus = estoque < 0; break;
          case "zerado":
            matchesStatus = estoque === 0; break;
          default:
            matchesStatus = true;
        }
        
        const matchesGroup = stockGroupFilter === "todos" || p.grupo_id?.toString() === stockGroupFilter;
        const matchesType = stockTypeFilter === "todos" || p.tipo === stockTypeFilter;
        const matchesBrand = !stockBrandFilter || p.marca?.toLowerCase().includes(stockBrandFilter.toLowerCase());
        
        let matchesSearchTerm = true;
        if (stockSearchTerm) {
          const lowerTerm = stockSearchTerm.toLowerCase();
          matchesSearchTerm = (p.nome && p.nome.toLowerCase().includes(lowerTerm)) || 
                              (p.codigo_barras && p.codigo_barras.toLowerCase().includes(lowerTerm));
        }

        return matchesStatus && matchesGroup && matchesType && matchesBrand && matchesSearchTerm;
      });
    }

    if (type === "people") {
      filteredData = data.filter((p) => {
        if (peopleFilter === "aniversariantes") {
          if (!p.data_aniversario) return false;
          // check if birthday month is between startDate and endDate months
          const dateStr = p.data_aniversario.includes("T")
            ? p.data_aniversario
            : p.data_aniversario + "T12:00:00";
          const bday = new Date(dateStr);
          if (isNaN(bday.getTime())) return false;

          const sDate = new Date(startDate + "T00:00:00");
          const eDate = new Date(endDate + "T23:59:59");

          // Translated birthday to the current year
          const currentYear = sDate.getFullYear();
          const bdayThisYear = new Date(
            currentYear,
            bday.getMonth(),
            bday.getDate(),
            12,
            0,
            0,
          );

          return bdayThisYear >= sDate && bdayThisYear <= eDate;
        }
        return true;
      });
    }

    if (type === "agenda") {
      filteredData = data.filter((a) => {
        if (!a.data_inicio) return false;
        
        let dateStr = a.data_inicio;
        if (!dateStr.includes("T")) {
          dateStr = dateStr.replace(" ", "T");
          if (!dateStr.includes("T")) dateStr += "T00:00:00";
        }
        
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return false;
        
        const agendaDate = d.toISOString().split("T")[0];
        const matchesDate = agendaDate >= startDate && agendaDate <= endDate;
        
        const isAgendado = !a.status || ['Pendente', 'Confirmado', 'Check-in Realizado'].includes(a.status);
        const mappedStatus = isAgendado ? 'Agendado' : a.status;
        const matchesStatus = agendaStatusFilter === "todos" || mappedStatus === agendaStatusFilter;

        const matchesProfessional = professionalFilter === "todos" || a.usuario_id?.toString() === professionalFilter;
        const matchesPerson = personFilter === "todos" || a.pessoa_id?.toString() === personFilter;
        return matchesDate && matchesStatus && matchesProfessional && matchesPerson;
      });
    }

    if (type === "notifications") {
      filteredData = data.filter((log) => {
        const matchesStatus = statusFilter === "todos" || log.status === statusFilter;
        return matchesStatus;
      });
    }

    return filteredData;
  };

  const handleExportExcel = async () => {
    const filteredData = getFilteredData();
    if (filteredData.length === 0) {
      alert("Não há dados para exportar.");
      return;
    }

    let exportData: any[] = [];

    if (type === "sales") {
      exportData = filteredData.map((s) => ({
        Data: formatDate(s.data_venda),
        Tipo: s.tipo === "mesa" ? "Mesa" : "Venda Rápida",
        Identificação: s.identificacao || `Venda #${s.sequencial_id || s.id}`,
        Cliente: s.cliente_nome || "Consumidor Final",
        Status:
          s.status === "finalizada"
            ? "Finalizada"
            : s.status === "aberta"
              ? "Aberta"
              : "Cancelada",
        "Valor Total": parseFloat(s.valor_total),
      }));
    } else if (type === "finance") {
      exportData = filteredData.map((a) => ({
        Vencimento: formatDate(a.vencimento),
        Descrição: a.descricao,
        Tipo: a.tipo === "receita" ? "Entrada" : "Saída",
        Valor: parseFloat(a.valor),
        Pessoa: pessoas.find((p) => p.id === a.pessoa_id)?.nome || a.pessoa_id,
        Status: a.pago ? "Pago" : "Pendente",
      }));
    } else if (type === "inventory") {
      exportData = filteredData.map((p) => ({
        "Nome do Item": p.nome,
        Tipo: p.tipo,
        Unidade: p.unidade,
        Custo: parseFloat(p.custo),
        "Valor de Venda": parseFloat(p.preco_venda),
        "Estoque Atual": parseFloat(p.estoque_atual),
        "Estoque Mínimo": parseFloat(p.estoque_minimo),
        Categoria: p.categoria,
        "Código de Barras": p.codigo_barras,
        Ativo: p.ativo ? "Sim" : "Não",
        Marca: p.marca,
      }));
    } else if (type === "people") {
      exportData = filteredData.map((p) => ({
        Nome: p.razao_social || p.nome,
        Tipo:
          p.tipo_pessoa === "cliente"
            ? "Cliente"
            : p.tipo_pessoa === "fornecedor"
              ? "Fornecedor"
              : p.tipo_pessoa === "funcionario"
                ? "Funcionário"
                : p.tipo_pessoa,
        "CPF/CNPJ": p.cpf_cnpj,
        Telefone: p.telefone_celular || p.telefone_fixo || p.telefone,
        Email: p.email,
        Cidade: p.cidade,
        UF: p.uf,
        Aniversário: p.data_aniversario ? formatDate(p.data_aniversario) : "",
      }));
    } else if (type === "agenda") {
      exportData = filteredData.map((a) => {
        const d = new Date(a.data_inicio);
        const isValid = !isNaN(d.getTime());
        return {
          Data: formatDate(a.data_inicio),
          Hora: formatTime(a.data_inicio),
          Profissional: a.profissional_nome || "-",
          Cliente: a.cliente_nome || "-",
          Valor: parseFloat(a.valor_total || 0),
          Status: a.status || "Agendado",
        };
      });
    }

    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Relatório');
    
    if (exportData.length > 0) {
      ws.columns = Object.keys(exportData[0]).map(key => ({ header: key, key: key }));
      exportData.forEach(item => {
        ws.addRow(item);
      });
    }

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Relatorio_${type}_${new Date().getTime()}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const renderTable = () => {
    if (loading)
      return (
        <div className="p-8 text-center text-slate-500">
          Gerando relatório...
        </div>
      );
    if (error)
      return (
        <div className="p-12 text-center text-rose-600">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="font-bold">Erro ao carregar relatório</p>
          <p className="text-sm opacity-80">{error}</p>
        </div>
      );

    const filteredData = getFilteredData();

    if (filteredData.length === 0) {
      return (
        <div className="p-12 text-center border rounded-2xl bg-white">
          <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="text-slate-300 w-8 h-8" />
          </div>
          <h3 className="text-slate-900 font-bold">Nenhum dado encontrado</h3>
          <p className="text-slate-500 text-sm mt-1 max-w-xs mx-auto">
            Não encontramos registros para os filtros selecionados.
          </p>
        </div>
      );
    }

    switch (type) {
      case "notifications":
        return (
          <div className="grid grid-cols-1 gap-4">
            <div className="hidden md:block overflow-x-auto bg-white rounded-2xl shadow-sm border border-slate-100">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-50 uppercase tracking-widest text-[10px] font-black text-slate-400">
                    <th className="px-6 py-4">Data Envio</th>
                    <th className="px-6 py-4">Data Prevista</th>
                    <th className="px-6 py-4">Cliente / Tipo</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Ações / Erro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredData.map((log: any) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <p className="text-xs font-bold text-slate-700">
                          {formatDate(log.enviado_at)}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {log.enviado_at ? formatTime(log.enviado_at) : "-" }
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-xs font-bold text-indigo-600">
                          {formatDate(log.data_prevista)}
                        </p>
                        <p className="text-[10px] text-indigo-400">
                          {log.data_prevista ? formatTime(log.data_prevista) : ""}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-slate-900">{log.cliente_nome || "N/A"}</p>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${log.tipo === "whatsapp" ? "bg-emerald-50 text-emerald-600" : "bg-indigo-50 text-indigo-600"}`}>
                            {log.tipo}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 line-clamp-1 max-w-[200px]">{log.destino}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold ${
                          log.status === "enviado" ? "bg-emerald-50 text-emerald-600" : 
                          log.status === "erro" ? "bg-rose-50 text-rose-600" : 
                          "bg-amber-50 text-amber-600"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            log.status === "enviado" ? "bg-emerald-400" : 
                            log.status === "erro" ? "bg-rose-400" : 
                            "bg-amber-400"
                          }`} />
                          {log.status === "enviado" ? "Enviado" : log.status === "erro" ? "Falhou" : "Pendente"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {log.status === "erro" && (
                          <p className="text-[10px] text-rose-500 bg-rose-50 p-1.5 rounded-lg line-clamp-2 max-w-[150px]">
                            {log.erro_log}
                          </p>
                        )}
                        {log.status === "enviado" && (
                          <div className="relative group/view">
                            <button className="text-slate-300 hover:text-indigo-600 transition-colors">
                              <Eye className="w-4 h-4" />
                            </button>
                            <div className="invisible group-hover/view:visible opacity-0 group-hover/view:opacity-100 absolute right-0 bottom-full mb-2 w-64 p-3 bg-white border border-slate-100 rounded-xl shadow-xl z-50 text-[10px] text-slate-600 leading-relaxed transition-all transform scale-95 group-hover/view:scale-100">
                              {log.mensagem}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile View */}
            <div className="md:hidden space-y-4">
              {filteredData.map((log: any) => (
                <div key={log.id} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${log.tipo === "whatsapp" ? "bg-emerald-50 text-emerald-600" : "bg-indigo-50 text-indigo-600"}`}>
                        {log.tipo}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${
                        log.status === "enviado" ? "bg-emerald-50 text-emerald-600" : 
                        log.status === "erro" ? "bg-rose-50 text-rose-600" : 
                        "bg-amber-50 text-amber-600"
                      }`}>
                        {log.status === "enviado" ? "Enviado" : log.status === "erro" ? "Falhou" : "Pendente"}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-slate-400">
                        Envio: {log.enviado_at ? formatTime(log.enviado_at) : '-'}
                      </p>
                      {log.data_prevista && (
                        <p className="text-[9px] text-indigo-500 font-medium">
                          Previsto: {formatDateTime(log.data_prevista)}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <p className="text-sm font-bold text-slate-900">{log.cliente_nome || "N/A"}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{log.destino}</p>
                  </div>

                  {log.status === 'enviado' && (
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 italic text-[11px] text-slate-600 leading-relaxed">
                      "{log.mensagem}"
                    </div>
                  )}

                  {log.status === 'erro' && (
                    <div className="bg-rose-50 rounded-xl p-3 border border-rose-100 text-[11px] text-rose-600">
                      <p className="font-bold mb-1">Motivo do Erro:</p>
                      {log.erro_log}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      case "sales":
        return (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 text-[10px] sm:text-xs md:text-sm uppercase tracking-wider">
                <tr>
                  <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold hidden md:table-cell">Nº</th>
                  <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold hidden sm:table-cell">Data</th>
                  <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold hidden lg:table-cell">Origem</th>
                  <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold">Cliente</th>
                  <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold text-right">Total</th>
                  <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold text-center hidden sm:table-cell">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[10px] sm:text-xs md:text-sm">
                {filteredData.map((s) => (
                  <tr key={`sale-${s.id}`}>
                    <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-medium text-slate-900 hidden md:table-cell">
                      #{s.sequencial_id?.toString().padStart(6, "0")}
                    </td>
                    <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 text-slate-600 hidden sm:table-cell">
                      {formatDate(s.data_venda)}
                    </td>
                    <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 text-slate-600 whitespace-nowrap hidden lg:table-cell">
                      <span className="px-1.5 md:px-2 py-0.5 md:py-1 bg-slate-100 text-slate-600 rounded-lg text-[8px] md:text-[10px] font-medium">
                        {s.origem || "Balcão"}
                      </span>
                    </td>
                    <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4">
                      <div className="font-medium text-slate-900 leading-tight">
                        <div className="line-clamp-2 md:line-clamp-none whitespace-normal min-w-[80px]">{s.cliente_nome || "Consumidor Final"}</div>
                      </div>
                      <div className="text-[8px] sm:text-[10px] text-slate-400 font-mono mt-0.5 sm:hidden">#{s.sequencial_id?.toString().padStart(6, '0')} • {formatDate(s.data_venda)}</div>
                      <div className="md:hidden mt-0.5">
                        <span className={`px-1.5 py-0.5 text-[8px] font-bold rounded uppercase ${s.status === "finalizada" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                          {s.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 text-right font-bold text-slate-900 whitespace-nowrap">
                      R$ {formatMoney(s.valor_total)}
                    </td>
                    <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 text-center hidden sm:table-cell">
                      <span
                        className={`px-1.5 sm:px-2 py-0.5 sm:py-1 text-[8px] sm:text-[10px] font-bold rounded uppercase ${s.status === "finalizada" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
                      >
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case "inventory":
        return (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 text-[10px] sm:text-xs md:text-sm uppercase tracking-wider">
                <tr>
                  <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold">Produto</th>
                  <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold hidden sm:table-cell">Tipo</th>
                  <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold text-right">
                    Preço Venda
                  </th>
                  <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold text-right hidden md:table-cell">Custo</th>
                  <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold text-right">
                    Estoque
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[10px] sm:text-xs md:text-sm">
                {filteredData.map((p) => (
                  <tr key={`inventory-${p.id}`}>
                    <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-medium text-slate-900 leading-tight">
                      <div className="line-clamp-2 md:line-clamp-none whitespace-normal min-w-[80px]">{p.nome}</div>
                      <div className="text-[8px] sm:text-[10px] text-slate-400 capitalize sm:hidden mt-0.5">{p.tipo}</div>
                    </td>
                    <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 text-slate-600 capitalize hidden sm:table-cell">
                      {p.tipo}
                    </td>
                    <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 text-right whitespace-nowrap">
                      R$ {formatMoney(p.preco_venda)}
                    </td>
                    <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 text-right text-slate-500 whitespace-nowrap hidden md:table-cell">
                      R$ {formatMoney(p.custo)}
                    </td>
                    <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 text-right font-bold whitespace-nowrap">
                      <span
                        className={
                          p.estoque_atual <= p.estoque_minimo
                            ? "text-rose-600"
                            : "text-emerald-600"
                        }
                      >
                        {(parseFloat(p.estoque_atual) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })} <span className="text-[8px] md:text-[10px]">{p.unidade}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case "finance":
        // Apply grouping if selected
        if (groupBy !== "nenhum") {
          const groups: { [key: string]: any[] } = {};
          filteredData.forEach((item) => {
            let key = "";
            if (groupBy === "data")
              key = formatDate(item.vencimento);
            else if (groupBy === "tipo")
              key = item.tipo === "receita" ? "Entradas" : "Saídas";
            else if (groupBy === "status")
              key = item.pago ? "Pagas" : "Pendentes";
            else if (groupBy === "pessoa")
              key = item.pessoa_nome || "Sem Pessoa";

            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
          });

          return (
            <div className="space-y-8">
              {Object.entries(groups).map(([groupTitle, items]) => (
                <div
                  key={groupTitle}
                  className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden"
                >
                  <div className="bg-slate-50 px-6 py-3 border-b border-slate-100">
                    <h3 className="font-bold text-slate-700">
                      {groupTitle}{" "}
                      <span className="text-slate-400 font-normal ml-2">
                        ({items.length} registros)
                      </span>
                    </h3>
                  </div>
                  <table className="w-full text-left">
                    <thead className="bg-slate-25 text-slate-400 text-[8px] md:text-[10px] uppercase tracking-wider">
                      <tr>
                        <th className="px-2 sm:px-3 md:px-6 py-2 md:py-3 font-semibold hidden sm:table-cell">Vencimento</th>
                        <th className="px-2 sm:px-3 md:px-6 py-2 md:py-3 font-semibold">Descrição</th>
                        <th className="px-2 sm:px-3 md:px-6 py-2 md:py-3 font-semibold hidden md:table-cell">Categoria</th>
                        <th className="px-2 sm:px-3 md:px-6 py-2 md:py-3 font-semibold hidden lg:table-cell">Pessoa</th>
                        <th className="px-2 sm:px-3 md:px-6 py-2 md:py-3 font-semibold text-right">
                          Valor
                        </th>
                        <th className="px-2 sm:px-3 md:px-6 py-2 md:py-3 font-semibold text-center hidden sm:table-cell">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[10px] sm:text-xs md:text-sm">
                      {items.map((a) => (
                        <tr
                          key={`finance-grouped-${a.id}-${a.local}-${a.tipo}`}
                        >
                          <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 text-slate-600 border-r border-slate-50 hidden sm:table-cell whitespace-nowrap">
                            {formatDate(a.vencimento)}
                          </td>
                          <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-medium text-slate-900">
                            <div className="line-clamp-2 md:line-clamp-none whitespace-normal min-w-[80px]">{a.descricao}</div>
                            <div className="text-[8px] sm:text-[10px] text-slate-400 font-mono mt-0.5 md:hidden uppercase">{a.categoria_nome || "Sem Categoria"}</div>
                            <div className="text-[8px] sm:text-[10px] text-slate-400 sm:hidden mt-0.5">{formatDate(a.vencimento)}</div>
                          </td>
                          <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 text-slate-600 hidden md:table-cell">
                            <span className="px-1.5 md:px-2 py-0.5 md:py-1 bg-slate-100 text-slate-600 rounded text-[8px] md:text-[10px] uppercase font-bold">
                              {a.categoria_nome || "Sem Categoria"}
                            </span>
                          </td>
                          <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 text-slate-600 hidden lg:table-cell">
                            {a.pessoa_nome || "-"}
                          </td>
                          <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 text-right font-bold text-slate-900 whitespace-nowrap">
                            R$ {formatMoney(a.valor)}
                          </td>
                          <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 text-center hidden sm:table-cell">
                            <span
                              className={`px-1.5 sm:px-2 py-0.5 sm:py-1 text-[8px] sm:text-[10px] font-bold rounded uppercase ${a.pago ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
                            >
                              {a.pago ? "Pago" : "Pendente"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="bg-slate-50 px-6 py-3 border-t border-slate-100 text-right">
                    <span className="text-sm font-bold text-slate-900">
                      Total do Grupo: R${" "}
                      {formatMoney(items.reduce((acc, i) => acc + i.valor, 0))}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          );
        }

        return (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 text-[10px] sm:text-xs md:text-sm uppercase tracking-wider">
                <tr>
                  <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold hidden sm:table-cell">Vencimento</th>
                  <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold">Descrição</th>
                  <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold hidden md:table-cell">Categoria</th>
                  <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold hidden lg:table-cell">Pessoa</th>
                  <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold text-right">Valor</th>
                  <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold text-center hidden sm:table-cell">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[10px] sm:text-xs md:text-sm">
                {filteredData.map((a) => (
                  <tr key={`finance-${a.local}-${a.id}-${a.tipo}`}>
                    <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 text-slate-600 hidden sm:table-cell whitespace-nowrap">
                      {formatDate(a.vencimento)}
                    </td>
                    <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-medium text-slate-900">
                      <div className="line-clamp-2 md:line-clamp-none whitespace-normal min-w-[80px]">{a.descricao}</div>
                      <div className="text-[8px] sm:text-[10px] text-slate-400 font-mono md:hidden mt-0.5 uppercase">{a.categoria_nome || "Sem Categoria"}</div>
                      <div className="text-[8px] sm:text-[10px] text-slate-400 sm:hidden mt-0.5">{formatDate(a.vencimento)}</div>
                    </td>
                    <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 text-slate-600 hidden md:table-cell">
                      <span className="px-1.5 md:px-2 py-0.5 md:py-1 bg-slate-100 text-slate-600 rounded text-[8px] md:text-[10px] uppercase font-bold">
                        {a.categoria_nome || "Sem Categoria"}
                      </span>
                    </td>
                    <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 text-slate-600 hidden lg:table-cell">
                      {a.pessoa_nome || "-"}
                    </td>
                    <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 text-right font-bold text-slate-900 whitespace-nowrap">
                      R$ {formatMoney(a.valor)}
                    </td>
                    <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 text-center hidden sm:table-cell">
                      <span
                        className={`px-1.5 sm:px-2 py-0.5 sm:py-1 text-[8px] md:text-[10px] font-bold rounded uppercase ${a.pago ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
                      >
                        {a.pago ? "Pago" : "Pendente"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case "people":
        return (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 text-[10px] sm:text-xs md:text-sm uppercase tracking-wider">
                <tr>
                  <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold">Nome</th>
                  <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold hidden sm:table-cell">Tipo</th>
                  <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold hidden lg:table-cell">CPF/CNPJ</th>
                  <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold">Contato</th>
                  <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold text-right hidden sm:table-cell">
                    Aniversário
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[10px] sm:text-xs md:text-sm">
                {filteredData.map((p) => (
                  <tr key={`people-${p.id}`}>
                    <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-medium text-slate-900">
                      <div className="line-clamp-2 md:line-clamp-none whitespace-normal min-w-[80px]">{p.razao_social || p.nome}</div>
                      <div className="text-[8px] sm:text-[10px] text-slate-400 capitalize sm:hidden mt-0.5">{p.tipo_pessoa}</div>
                    </td>
                    <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 text-slate-600 capitalize hidden sm:table-cell">
                      {p.tipo_pessoa}
                    </td>
                    <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 text-slate-600 font-mono text-[10px] md:text-xs hidden lg:table-cell">
                      {p.cpf_cnpj}
                    </td>
                    <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 text-slate-600">
                      <div className="whitespace-nowrap">{p.telefone_celular || p.telefone}</div>
                    </td>
                    <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 text-slate-600 text-right hidden sm:table-cell whitespace-nowrap">
                      {p.data_aniversario ? formatDate(p.data_aniversario) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case "agenda":
        return (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 text-[10px] sm:text-xs md:text-sm uppercase tracking-wider">
                <tr>
                  <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold">Data/Hora</th>
                  <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold">Cliente</th>
                  <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold hidden sm:table-cell">Profissional</th>
                  <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold text-right">Valor</th>
                  <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold text-center hidden sm:table-cell">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[10px] sm:text-xs md:text-sm">
                {filteredData.map((a) => (
                  <tr key={`agenda-${a.id}`}>
                    <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 text-slate-600 whitespace-nowrap">
                      {(() => {
                        const datePart = formatDate(a.data_inicio);
                        const timeStart = formatTime(a.data_inicio);
                        const timeEnd = formatTime(a.data_fim);
                        
                        return (
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-900">{datePart}</span>
                            <span className="text-[10px] text-slate-500">{timeStart}{timeEnd !== '-' ? ` - ${timeEnd}` : ""}</span>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-medium text-slate-900">
                      <div className="line-clamp-2 md:line-clamp-none whitespace-normal min-w-[80px]">{a.cliente_nome || "-"}</div>
                    </td>
                    <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 text-slate-600 hidden sm:table-cell">
                      {a.profissional_nome || "-"}
                    </td>
                    <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 text-right font-bold text-slate-900 whitespace-nowrap">
                      R$ {formatMoney(a.valor_total || 0)}
                    </td>
                    <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 text-center hidden sm:table-cell">
                      <span
                        className={`px-1.5 sm:px-2 py-0.5 sm:py-1 text-[8px] sm:text-[10px] font-bold rounded uppercase ${
                          a.status === "Concluido"
                            ? "bg-emerald-100 text-emerald-700"
                            : a.status === "Cancelado"
                            ? "bg-rose-100 text-rose-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {a.status || "Agendado"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      default:
        return <div>Relatório não encontrado.</div>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{getTitle()}</h1>
          <p className="text-slate-500 text-sm">
            Visualize e exporte dados filtrados do seu sistema.
          </p>
        </div>
        <div className="flex gap-2">
          {canExportExcel && (
            <button
              onClick={handleExportExcel}
              className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 flex items-center gap-2"
            >
              <FileSpreadsheet className="w-4 h-4" /> Exportar Excel
            </button>
          )}
          <button
            onClick={handlePrint}
            className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center gap-2"
          >
            <FileText className="w-4 h-4" /> Imprimir PDF
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {type === "notifications" ? (
            <>
              <div className="space-y-1 md:col-span-1 lg:col-span-1">
                <label className="block text-xs font-bold text-slate-500 uppercase">
                  Data
                </label>
                <input
                  type="date"
                  value={notificationDate}
                  onChange={(e) => setNotificationDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-500 uppercase">
                  Filtro de Tempo
                </label>
                <select
                  value={notificationTimeFilter}
                  onChange={(e) => setNotificationTimeFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="1h">Última 1 hora</option>
                  <option value="24h">Últimas 24 horas</option>
                  <option value="all">Todo o Período</option>
                </select>
              </div>
            </>
          ) : (
            <div className="space-y-1 md:col-span-2 lg:col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase">
                Período
              </label>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-slate-400 self-center">a</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          )}

          {type === "sales" && (
            <>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-500 uppercase">
                  Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="todos">Todos</option>
                  <option value="finalizada">Finalizada</option>
                  <option value="orcamento">Orçamento</option>
                  <option value="cancelada">Cancelada</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-500 uppercase">
                  Origem
                </label>
                <select
                  value={origemFilter}
                  onChange={(e) => setOrigemFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Todas">Todas Origens</option>
                  <option value="Balcão">Balcão</option>
                  <option value="Mesa">Mesa</option>
                  <option value="PDV">PDV</option>
                  <option value="OS">OS</option>
                  <option value="Agenda">Agenda</option>
                </select>
              </div>
            </>
          )}

          {type === "finance" && (
            <>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-500 uppercase">
                  Tipo Operação
                </label>
                <select
                  value={financeOpTypeFilter}
                  onChange={(e) => setFinanceOpTypeFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="todos">Todas (Entrada/Saída)</option>
                  <option value="entrada">Apenas Entradas</option>
                  <option value="saida">Apenas Saídas</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-500 uppercase">
                  Status Pagamento
                </label>
                <select
                  value={financeStatusFilter}
                  onChange={(e) => setFinanceStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="todos">Todos (Pago/Pendente)</option>
                  <option value="pago">Apenas Pagos</option>
                  <option value="pendente">Apenas Pendentes</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-500 uppercase">
                  Agrupar por
                </label>
                <select
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="nenhum">Nenhum Agrupamento</option>
                  <option value="data">Data de Vencimento</option>
                  <option value="tipo">Tipo (Entrada/Saída)</option>
                  <option value="status">Status (Pago/Pendente)</option>
                  <option value="pessoa">Pessoa</option>
                </select>
              </div>
            </>
          )}

          {type === "inventory" && (
            <>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-500 uppercase">
                  Busca Inteligente
                </label>
                <input
                  type="text"
                  placeholder="Nome ou Cód. Barras"
                  value={stockSearchTerm}
                  onChange={(e) => setStockSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-500 uppercase">
                  Tipo
                </label>
                <select
                  value={stockTypeFilter}
                  onChange={(e) => setStockTypeFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="todos">Todos</option>
                  <option value="produto">Produto</option>
                  <option value="servico">Serviço</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-500 uppercase">
                  Grupo
                </label>
                <select
                  value={stockGroupFilter}
                  onChange={(e) => setStockGroupFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="todos">Todos</option>
                  {grupos.map(g => (
                    <option key={g.id} value={g.id}>{g.nome}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-500 uppercase">
                  Marca
                </label>
                <input
                  type="text"
                  placeholder="Fabricante/Marca"
                  value={stockBrandFilter}
                  onChange={(e) => setStockBrandFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-500 uppercase">
                  Status Estoque
                </label>
                <select
                  value={stockStatusFilter}
                  onChange={(e) => setStockStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="todos">Todos os Níveis</option>
                  <option value="minimo">Abaixo do Mínimo</option>
                  <option value="zerado">Estoques Zerados</option>
                  <option value="negativo">Estoques Negativos</option>
                  <option value="regular">Estoque Regular</option>
                </select>
              </div>
            </>
          )}

          {type === "notifications" && (
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-500 uppercase">
                Status do Envio
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="todos">Todos os Status</option>
                <option value="enviado">Enviados</option>
                <option value="erro">Falhas</option>
                <option value="pendente">Pendentes</option>
              </select>
            </div>
          )}

          {type === "people" && (
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-500 uppercase">
                Pessoas
              </label>
              <select
                value={peopleFilter}
                onChange={(e) => setPeopleFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="todos">Todas as Pessoas</option>
                <option value="aniversariantes">
                  Aniversariantes do Período
                </option>
              </select>
            </div>
          )}

          {(type === "sales" || type === "finance" || type === "agenda") && (
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-500 uppercase">
                Pessoa
              </label>
              <select
                value={personFilter}
                onChange={(e) => setPersonFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="todos">Todas as Pessoas</option>
                {pessoas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
          )}

          {type === "agenda" && (
            <>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-500 uppercase">
                  Profissional
                </label>
                <select
                  value={professionalFilter}
                  onChange={(e) => setProfessionalFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="todos">Todos os Profissionais</option>
                  {professionals.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-500 uppercase">
                  Status
                </label>
                <select
                  value={agendaStatusFilter}
                  onChange={(e) => setAgendaStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="todos">Todos</option>
                  <option value="Agendado">Somente Agendados</option>
                  <option value="Concluido">Somente Concluídos</option>
                  <option value="Cancelado">Somente Cancelados</option>
                </select>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {renderTable()}
      </div>
    </div>
  );
};

export default Reports;
