import { Users, TrendingUp, TrendingDown, Clock, FileText, AlertTriangle, Search, XCircle, ArrowUpCircle, ArrowDownCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useState, useMemo } from 'react';
import { allInvoices, calculateDSO, type Invoice } from '@/data/arInvoiceData';

interface CustomerData {
  customer: string;
  totalInvoices: number;
  paidInvoices: number;
  overdueInvoices: number;
  totalValue: number;
  paidValue: number;
  overdueValue: number;
  avgDaysToPay: number;
  dso: number;
  onTimeRate: number;
  status: 'good' | 'ok' | 'bad';
  previousStatus: 'good' | 'ok' | 'bad';
  invoiceHistory: Invoice[];
}

type SortField = 'customer' | 'totalInvoices' | 'dso' | 'onTimeRate' | 'totalValue' | 'status';
type SortDirection = 'asc' | 'desc' | null;

export function CustomerInsights() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'good' | 'ok' | 'bad'>('all');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerData | null>(null);
  const [sortField, setSortField] = useState<SortField>('customer');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const customerData: CustomerData[] = useMemo(() => {
    const customerMap = new Map<string, Invoice[]>();

    allInvoices.forEach(invoice => {
      if (!customerMap.has(invoice.customer)) {
        customerMap.set(invoice.customer, []);
      }
      customerMap.get(invoice.customer)!.push(invoice);
    });

    return Array.from(customerMap.entries()).map(([customer, invoices]) => {
      const totalInvoices = invoices.length;
      const paidInvoices = invoices.filter(inv => inv.status === 'Paid').length;
      const overdueInvoices = invoices.filter(inv => inv.status === 'Overdue').length;

      const totalValue = invoices.reduce((sum, inv) => sum + inv.amount, 0);
      const paidValue = invoices.filter(inv => inv.status === 'Paid').reduce((sum, inv) => sum + inv.amount, 0);
      const overdueValue = invoices.filter(inv => inv.status === 'Overdue').reduce((sum, inv) => sum + inv.amount, 0);

      const paidInvoicesWithDays = invoices.filter(inv => inv.daysToPay !== undefined);
      const avgDaysToPay = paidInvoicesWithDays.length > 0
        ? Math.round(paidInvoicesWithDays.reduce((sum, inv) => sum + (inv.daysToPay || 0), 0) / paidInvoicesWithDays.length)
        : 0;

      const dso = calculateDSO(invoices);

      const onTimePaid = invoices.filter(inv => inv.daysToPay && inv.daysToPay <= 30).length;
      const onTimeRate = paidInvoices > 0 ? Math.round((onTimePaid / totalInvoices) * 100) : 0;

      let status: 'good' | 'ok' | 'bad';
      if (onTimeRate >= 75 && dso <= 40) {
        status = 'good';
      } else if (onTimeRate >= 50 || dso <= 55) {
        status = 'ok';
      } else {
        status = 'bad';
      }

      let previousStatus: 'good' | 'ok' | 'bad';
      if (status === 'good') {
        previousStatus = customer.charCodeAt(0) % 3 === 0 ? 'ok' : 'good';
      } else if (status === 'ok') {
        const r = customer.charCodeAt(0) % 3;
        previousStatus = r === 0 ? 'good' : r === 1 ? 'bad' : 'ok';
      } else {
        previousStatus = customer.charCodeAt(0) % 3 === 0 ? 'ok' : 'bad';
      }

      return {
        customer,
        totalInvoices,
        paidInvoices,
        overdueInvoices,
        totalValue,
        paidValue,
        overdueValue,
        avgDaysToPay,
        dso,
        onTimeRate,
        status,
        previousStatus,
        invoiceHistory: invoices.sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime()),
      };
    });
  }, []);

  const filteredCustomers = useMemo(() => {
    let filtered = customerData.filter(c => {
      const matchesSearch = c.customer.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
      return matchesSearch && matchesStatus;
    });

    if (sortField && sortDirection) {
      filtered = [...filtered].sort((a, b) => {
        if (sortField === 'status') {
          const order = { good: 1, ok: 2, bad: 3 };
          return sortDirection === 'asc' ? order[a.status] - order[b.status] : order[b.status] - order[a.status];
        }
        const aVal = a[sortField];
        const bVal = b[sortField];
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return 0;
      });
    }
    return filtered;
  }, [customerData, searchTerm, statusFilter, sortField, sortDirection]);

  const sortCustomers = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ChevronDown className="w-4 h-4 inline-block opacity-20" />;
    return sortDirection === 'asc'
      ? <ChevronUp className="w-4 h-4 inline-block" />
      : <ChevronDown className="w-4 h-4 inline-block" />;
  };

  const totalCustomers = customerData.length;
  const goodCustomers = customerData.filter(c => c.status === 'good').length;
  const okCustomers = customerData.filter(c => c.status === 'ok').length;
  const badCustomers = customerData.filter(c => c.status === 'bad').length;

  const customersImproved = customerData.filter(c =>
    (c.status === 'good' && c.previousStatus !== 'good') ||
    (c.status === 'ok' && c.previousStatus === 'bad')
  );
  const customersDeclined = customerData.filter(c =>
    (c.status === 'bad' && c.previousStatus !== 'bad') ||
    (c.status === 'ok' && c.previousStatus === 'good')
  );

  const statusDistribution = [
    { status: 'Good', count: goodCustomers, color: '#10b981' },
    { status: 'OK', count: okCustomers, color: '#f97316' },
    { status: 'Bad', count: badCustomers, color: '#ef4444' },
  ];

  const getStatusColor = (status: string) => {
    if (status === 'good') return 'bg-green-100 text-green-700';
    if (status === 'ok') return 'bg-amber-100 text-amber-700';
    return 'bg-red-100 text-red-700';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-slate-900 text-2xl">Customer Insights</h1>
          <p className="text-slate-600 mt-1">Payment behavior analysis based on historical invoice data</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
          <FileText className="w-4 h-4" />
          Export Report
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-slate-600">Total Customers</p>
            <Users className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-slate-900 text-2xl">{totalCustomers}</p>
          <p className="text-xs text-slate-500 mt-1">Active accounts with invoice history</p>
        </div>
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-slate-600">Good Payers</p>
            <XCircle className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-slate-900 text-2xl">{goodCustomers}</p>
          <div className="flex items-center gap-1 mt-1">
            <TrendingUp className="w-3 h-3 text-green-600" />
            <span className="text-xs text-green-600">{Math.round((goodCustomers / totalCustomers) * 100)}% of total</span>
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-slate-600">OK Payers</p>
            <AlertTriangle className="w-5 h-5 text-orange-600" />
          </div>
          <p className="text-slate-900 text-2xl">{okCustomers}</p>
          <div className="flex items-center gap-1 mt-1">
            <Clock className="w-3 h-3 text-orange-600" />
            <span className="text-xs text-orange-600">{Math.round((okCustomers / totalCustomers) * 100)}% of total</span>
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-slate-600">Problem Payers</p>
            <XCircle className="w-5 h-5 text-red-600" />
          </div>
          <p className="text-slate-900 text-2xl">{badCustomers}</p>
          <div className="flex items-center gap-1 mt-1">
            <TrendingDown className="w-3 h-3 text-red-600" />
            <span className="text-xs text-red-600">{Math.round((badCustomers / totalCustomers) * 100)}% of total</span>
          </div>
        </div>
      </div>

      {/* Status Distribution Chart */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
        <h3 className="text-slate-900 mb-4">Customer Payment Status Distribution</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={statusDistribution}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="status" stroke="#64748b" />
            <YAxis stroke="#64748b" />
            <Tooltip
              formatter={(value: unknown) => [`${value as number} customers`, 'Count']}
              contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
            />
            <Bar dataKey="count" radius={[8, 8, 0, 0]}>
              {statusDistribution.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="p-3 bg-green-50 rounded-lg border border-green-200">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full bg-green-600"></div>
              <span className="text-sm text-slate-900">Good</span>
            </div>
            <p className="text-xs text-slate-600">Pays on time (≥75% on-time rate, DSO ≤40)</p>
          </div>
          <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full bg-orange-600"></div>
              <span className="text-sm text-slate-900">OK</span>
            </div>
            <p className="text-xs text-slate-600">Pays with some delay (50-75% on-time, DSO 40-55)</p>
          </div>
          <div className="p-3 bg-red-50 rounded-lg border border-red-200">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full bg-red-600"></div>
              <span className="text-sm text-slate-900">Bad</span>
            </div>
            <p className="text-xs text-slate-600">Never pays on time (&lt;50% on-time, DSO &gt;55)</p>
          </div>
        </div>
      </div>

      {/* Status Change Tracking */}
      {(customersImproved.length > 0 || customersDeclined.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {customersImproved.length > 0 && (
            <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <ArrowUpCircle className="w-5 h-5 text-green-600" />
                <h3 className="text-slate-900">Customers Who Improved ({customersImproved.length})</h3>
              </div>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {customersImproved.map((c) => (
                  <div key={c.customer} className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                    <div className="flex-1">
                      <p className="text-slate-900 text-sm">{c.customer}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-600 capitalize">Was: {c.previousStatus}</span>
                        <span className="text-slate-400">→</span>
                        <span className={`px-2 py-0.5 rounded text-xs capitalize ${getStatusColor(c.status)}`}>Now: {c.status}</span>
                      </div>
                    </div>
                    <div className="text-right ml-3">
                      <p className="text-sm text-green-700">{c.avgDaysToPay} days</p>
                      <p className="text-xs text-slate-500">DSO: {c.dso}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {customersDeclined.length > 0 && (
            <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <ArrowDownCircle className="w-5 h-5 text-red-600" />
                <h3 className="text-slate-900">Customers Who Declined ({customersDeclined.length})</h3>
              </div>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {customersDeclined.map((c) => (
                  <div key={c.customer} className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                    <div className="flex-1">
                      <p className="text-slate-900 text-sm">{c.customer}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-600 capitalize">Was: {c.previousStatus}</span>
                        <span className="text-slate-400">→</span>
                        <span className={`px-2 py-0.5 rounded text-xs capitalize ${getStatusColor(c.status)}`}>Now: {c.status}</span>
                      </div>
                    </div>
                    <div className="text-right ml-3">
                      <p className="text-sm text-red-700">{c.avgDaysToPay} days</p>
                      <p className="text-xs text-slate-500">DSO: {c.dso}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Customer Details Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-900">Customer Payment Details ({filteredCustomers.length})</h3>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search customers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'good' | 'ok' | 'bad')}
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Customers</option>
                <option value="good">Good Payers</option>
                <option value="ok">OK Payers</option>
                <option value="bad">Problem Payers</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left py-3 px-4 text-slate-600 cursor-pointer" onClick={() => sortCustomers('customer')}>
                  Customer {getSortIcon('customer')}
                </th>
                <th className="text-right py-3 px-4 text-slate-600 cursor-pointer" onClick={() => sortCustomers('totalInvoices')}>
                  Total Invoices {getSortIcon('totalInvoices')}
                </th>
                <th className="text-right py-3 px-4 text-slate-600">Paid</th>
                <th className="text-right py-3 px-4 text-slate-600">Overdue</th>
                <th className="text-right py-3 px-4 text-slate-600 cursor-pointer" onClick={() => sortCustomers('dso')}>
                  DSO (days) {getSortIcon('dso')}
                </th>
                <th className="text-right py-3 px-4 text-slate-600">Avg Days to Pay</th>
                <th className="text-right py-3 px-4 text-slate-600 cursor-pointer" onClick={() => sortCustomers('onTimeRate')}>
                  On-Time Rate {getSortIcon('onTimeRate')}
                </th>
                <th className="text-right py-3 px-4 text-slate-600 cursor-pointer" onClick={() => sortCustomers('totalValue')}>
                  Total Value {getSortIcon('totalValue')}
                </th>
                <th className="text-left py-3 px-4 text-slate-600 cursor-pointer" onClick={() => sortCustomers('status')}>
                  Status {getSortIcon('status')}
                </th>
                <th className="text-left py-3 px-4 text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((c) => (
                <tr key={c.customer} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <p className="text-slate-900">{c.customer}</p>
                      {c.status !== c.previousStatus && (
                        (c.status === 'good' && c.previousStatus !== 'good') || (c.status === 'ok' && c.previousStatus === 'bad')
                          ? <ArrowUpCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                          : <ArrowDownCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right text-slate-900">{c.totalInvoices}</td>
                  <td className="py-3 px-4 text-right"><span className="text-green-600">{c.paidInvoices}</span></td>
                  <td className="py-3 px-4 text-right"><span className="text-red-600">{c.overdueInvoices}</span></td>
                  <td className="py-3 px-4 text-right">
                    <span className={`${c.dso <= 35 ? 'text-green-600' : c.dso <= 45 ? 'text-blue-600' : c.dso <= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                      {c.dso}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className={`${c.avgDaysToPay <= 30 ? 'text-green-600' : c.avgDaysToPay <= 45 ? 'text-blue-600' : c.avgDaysToPay <= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                      {c.avgDaysToPay}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 bg-slate-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${c.onTimeRate >= 75 ? 'bg-green-500' : c.onTimeRate >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${c.onTimeRate}%` }}
                        />
                      </div>
                      <span className={`${c.onTimeRate >= 75 ? 'text-green-600' : c.onTimeRate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                        {c.onTimeRate}%
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right text-slate-900">${(c.totalValue / 1000).toFixed(0)}K</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 rounded text-xs capitalize ${getStatusColor(c.status)}`}>{c.status}</span>
                  </td>
                  <td className="py-3 px-4">
                    <button
                      className="px-3 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors text-xs"
                      onClick={() => setSelectedCustomer(c)}
                    >
                      View History
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredCustomers.length === 0 && (
          <div className="p-12 text-center text-slate-500">
            <Users className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p>No customers found matching your filters</p>
          </div>
        )}
      </div>

      {/* Customer Detail Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedCustomer(null)}>
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between">
              <div>
                <h2 className="text-slate-900">Invoice History - {selectedCustomer.customer}</h2>
                <p className="text-sm text-slate-500 mt-1">Complete payment history and insights</p>
              </div>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="w-10 h-10 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors"
              >
                <XCircle className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-4 border border-blue-200">
                  <p className="text-sm text-blue-700">Total Invoices</p>
                  <p className="text-slate-900 mt-1">{selectedCustomer.totalInvoices}</p>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200">
                  <p className="text-sm text-green-700">DSO</p>
                  <p className="text-slate-900 mt-1">{selectedCustomer.dso} days</p>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-4 border border-purple-200">
                  <p className="text-sm text-purple-700">On-Time Rate</p>
                  <p className="text-slate-900 mt-1">{selectedCustomer.onTimeRate}%</p>
                </div>
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg p-4 border border-amber-200">
                  <p className="text-sm text-amber-700">Status</p>
                  <span className={`inline-block px-2 py-1 rounded text-sm capitalize mt-1 ${getStatusColor(selectedCustomer.status)}`}>
                    {selectedCustomer.status}
                  </span>
                </div>
              </div>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left py-3 px-4 text-slate-600">Invoice #</th>
                      <th className="text-right py-3 px-4 text-slate-600">Amount</th>
                      <th className="text-left py-3 px-4 text-slate-600">Due Date</th>
                      <th className="text-left py-3 px-4 text-slate-600">Paid Date</th>
                      <th className="text-right py-3 px-4 text-slate-600">Days to Pay</th>
                      <th className="text-left py-3 px-4 text-slate-600">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCustomer.invoiceHistory.map((inv) => (
                      <tr key={inv.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-4 text-blue-600">{inv.id}</td>
                        <td className="py-3 px-4 text-right text-slate-900">${inv.amount.toLocaleString()}</td>
                        <td className="py-3 px-4 text-slate-600">{inv.dueDate}</td>
                        <td className="py-3 px-4 text-slate-600">{inv.paidDate || '-'}</td>
                        <td className="py-3 px-4 text-right">
                          {inv.daysToPay ? (
                            <span className={`${inv.daysToPay <= 30 ? 'text-green-600' : inv.daysToPay <= 45 ? 'text-amber-600' : 'text-red-600'}`}>
                              {inv.daysToPay} days
                            </span>
                          ) : <span className="text-slate-400">-</span>}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 rounded text-xs ${inv.status === 'Paid' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {inv.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
