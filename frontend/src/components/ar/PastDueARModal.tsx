import { X, AlertTriangle, Download, Filter, Search, Phone, Mail, ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { useState, useMemo } from 'react';
import { CommunicationHistoryModal } from './CommunicationHistoryModal';

interface PastDueARModalProps {
  onClose: () => void;
}

type SortField = 'id' | 'customer' | 'amount' | 'daysOverdue' | 'risk' | 'collector';
type SortDirection = 'asc' | 'desc' | null;

export function PastDueARModal({ onClose }: PastDueARModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedInvoiceForComm, setSelectedInvoiceForComm] = useState<typeof overdueInvoices[0] | null>(null);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [filters, setFilters] = useState({
    customer: [] as string[],
    aging: [] as string[],
    risk: [] as string[],
    collector: [] as string[],
    amountMin: '',
    amountMax: '',
  });

  const agingBreakdown = [
    { name: '1-30 days', value: 425000, color: '#fbbf24', count: 12 },
    { name: '31-60 days', value: 165000, color: '#f97316', count: 8 },
    { name: '61-90 days', value: 65000, color: '#ef4444', count: 5 },
    { name: '90+ days', value: 30000, color: '#dc2626', count: 3 },
  ];

  const overdueInvoices = [
    // 90+ days - 3 invoices
    { 
      id: 'INV-10523', 
      customer: 'Mega Corp Industries', 
      amount: 12000, 
      dueDate: '2024-08-15', 
      daysOverdue: 102,
      aging: '90+ days', 
      risk: 'high',
      lastContact: '2024-10-15',
      collector: 'Sarah Johnson'
    },
    { 
      id: 'INV-10567', 
      customer: 'Quality Partners LLC', 
      amount: 9500, 
      dueDate: '2024-09-20', 
      daysOverdue: 66,
      aging: '90+ days', 
      risk: 'high',
      lastContact: '2024-10-01',
      collector: 'Mike Chen'
    },
    { 
      id: 'INV-10589', 
      customer: 'Legacy Systems Inc', 
      amount: 8500, 
      dueDate: '2024-09-05', 
      daysOverdue: 81,
      aging: '90+ days', 
      risk: 'high',
      lastContact: '2024-10-10',
      collector: 'Sarah Johnson'
    },
    
    // 61-90 days - 5 invoices
    { 
      id: 'INV-10412', 
      customer: 'Tech Solutions Inc', 
      amount: 15000, 
      dueDate: '2024-10-20', 
      daysOverdue: 36,
      aging: '61-90 days', 
      risk: 'high',
      lastContact: '2024-11-01',
      collector: 'Sarah Johnson'
    },
    { 
      id: 'INV-10234', 
      customer: 'ABC Manufacturing Ltd', 
      amount: 13000, 
      dueDate: '2024-10-15', 
      daysOverdue: 41,
      aging: '61-90 days', 
      risk: 'medium',
      lastContact: '2024-11-10',
      collector: 'Sarah Johnson'
    },
    { 
      id: 'INV-10445', 
      customer: 'Precision Tools Inc', 
      amount: 14500, 
      dueDate: '2024-10-18', 
      daysOverdue: 38,
      aging: '61-90 days', 
      risk: 'medium',
      lastContact: '2024-11-05',
      collector: 'Mike Chen'
    },
    { 
      id: 'INV-10467', 
      customer: 'Industrial Components', 
      amount: 11500, 
      dueDate: '2024-10-22', 
      daysOverdue: 34,
      aging: '61-90 days', 
      risk: 'medium',
      lastContact: '2024-11-08',
      collector: 'Emily Taylor'
    },
    { 
      id: 'INV-10489', 
      customer: 'Machine Works Ltd', 
      amount: 11000, 
      dueDate: '2024-10-12', 
      daysOverdue: 44,
      aging: '61-90 days', 
      risk: 'high',
      lastContact: '2024-11-02',
      collector: 'Robert Wilson'
    },
    
    // 31-60 days - 8 invoices
    { 
      id: 'INV-10298', 
      customer: 'Global Retail Corp', 
      amount: 22000, 
      dueDate: '2024-11-05', 
      daysOverdue: 20,
      aging: '31-60 days', 
      risk: 'medium',
      lastContact: '2024-11-18',
      collector: 'Mike Chen'
    },
    { 
      id: 'INV-10401', 
      customer: 'ABC Manufacturing Ltd', 
      amount: 18500, 
      dueDate: '2024-11-01', 
      daysOverdue: 24,
      aging: '31-60 days', 
      risk: 'medium',
      lastContact: '2024-11-10',
      collector: 'Sarah Johnson'
    },
    { 
      id: 'INV-10321', 
      customer: 'Metro Supplies Ltd', 
      amount: 21000, 
      dueDate: '2024-10-28', 
      daysOverdue: 28,
      aging: '31-60 days', 
      risk: 'medium',
      lastContact: '2024-11-15',
      collector: 'Emily Taylor'
    },
    { 
      id: 'INV-10334', 
      customer: 'Coastal Distributors', 
      amount: 20500, 
      dueDate: '2024-10-30', 
      daysOverdue: 26,
      aging: '31-60 days', 
      risk: 'low',
      lastContact: '2024-11-17',
      collector: 'Robert Wilson'
    },
    { 
      id: 'INV-10345', 
      customer: 'Valley Electronics', 
      amount: 19000, 
      dueDate: '2024-11-02', 
      daysOverdue: 23,
      aging: '31-60 days', 
      risk: 'low',
      lastContact: '2024-11-19',
      collector: 'Mike Chen'
    },
    { 
      id: 'INV-10356', 
      customer: 'Urban Systems', 
      amount: 20000, 
      dueDate: '2024-11-04', 
      daysOverdue: 21,
      aging: '31-60 days', 
      risk: 'low',
      lastContact: '2024-11-20',
      collector: 'Sarah Johnson'
    },
    { 
      id: 'INV-10367', 
      customer: 'Regional Partners', 
      amount: 22500, 
      dueDate: '2024-10-29', 
      daysOverdue: 27,
      aging: '31-60 days', 
      risk: 'medium',
      lastContact: '2024-11-14',
      collector: 'Emily Taylor'
    },
    { 
      id: 'INV-10378', 
      customer: 'District Trading', 
      amount: 21500, 
      dueDate: '2024-11-03', 
      daysOverdue: 22,
      aging: '31-60 days', 
      risk: 'low',
      lastContact: '2024-11-18',
      collector: 'Robert Wilson'
    },
    
    // 1-30 days - 12 invoices
    { 
      id: 'INV-10456', 
      customer: 'Premium Distributors', 
      amount: 38500, 
      dueDate: '2024-11-15', 
      daysOverdue: 10,
      aging: '1-30 days', 
      risk: 'low',
      lastContact: '2024-11-20',
      collector: 'Mike Chen'
    },
    { 
      id: 'INV-10478', 
      customer: 'Summit Corporation', 
      amount: 35000, 
      dueDate: '2024-11-10', 
      daysOverdue: 15,
      aging: '1-30 days', 
      risk: 'low',
      lastContact: '2024-11-22',
      collector: 'Sarah Johnson'
    },
    { 
      id: 'INV-10489', 
      customer: 'Alpine Industries', 
      amount: 36500, 
      dueDate: '2024-11-12', 
      daysOverdue: 13,
      aging: '1-30 days', 
      risk: 'low',
      lastContact: '2024-11-21',
      collector: 'Emily Taylor'
    },
    { 
      id: 'INV-10501', 
      customer: 'Riverside Partners', 
      amount: 32000, 
      dueDate: '2024-11-08', 
      daysOverdue: 17,
      aging: '1-30 days', 
      risk: 'low',
      lastContact: '2024-11-19',
      collector: 'Robert Wilson'
    },
    { 
      id: 'INV-10512', 
      customer: 'Northwest Trading', 
      amount: 34000, 
      dueDate: '2024-11-14', 
      daysOverdue: 11,
      aging: '1-30 days', 
      risk: 'low',
      lastContact: '2024-11-23',
      collector: 'Mike Chen'
    },
    { 
      id: 'INV-10523', 
      customer: 'Pacific Ventures', 
      amount: 37500, 
      dueDate: '2024-11-11', 
      daysOverdue: 14,
      aging: '1-30 days', 
      risk: 'low',
      lastContact: '2024-11-20',
      collector: 'Sarah Johnson'
    },
    { 
      id: 'INV-10534', 
      customer: 'Mountain Corp', 
      amount: 31500, 
      dueDate: '2024-11-09', 
      daysOverdue: 16,
      aging: '1-30 days', 
      risk: 'low',
      lastContact: '2024-11-18',
      collector: 'Emily Taylor'
    },
    { 
      id: 'INV-10545', 
      customer: 'Ocean Industries', 
      amount: 33500, 
      dueDate: '2024-11-13', 
      daysOverdue: 12,
      aging: '1-30 days', 
      risk: 'low',
      lastContact: '2024-11-22',
      collector: 'Robert Wilson'
    },
    { 
      id: 'INV-10556', 
      customer: 'Forest Solutions', 
      amount: 30000, 
      dueDate: '2024-11-16', 
      daysOverdue: 9,
      aging: '1-30 days', 
      risk: 'low',
      lastContact: '2024-11-21',
      collector: 'Mike Chen'
    },
    { 
      id: 'INV-10567', 
      customer: 'Desert Trading', 
      amount: 35500, 
      dueDate: '2024-11-07', 
      daysOverdue: 18,
      aging: '1-30 days', 
      risk: 'low',
      lastContact: '2024-11-19',
      collector: 'Sarah Johnson'
    },
    { 
      id: 'INV-10578', 
      customer: 'Prairie Partners', 
      amount: 34500, 
      dueDate: '2024-11-17', 
      daysOverdue: 8,
      aging: '1-30 days', 
      risk: 'low',
      lastContact: '2024-11-23',
      collector: 'Emily Taylor'
    },
    { 
      id: 'INV-10589', 
      customer: 'Lake Systems', 
      amount: 36000, 
      dueDate: '2024-11-06', 
      daysOverdue: 19,
      aging: '1-30 days', 
      risk: 'low',
      lastContact: '2024-11-20',
      collector: 'Robert Wilson'
    },
  ];

  const total = agingBreakdown.reduce((sum, item) => sum + item.value, 0);

  // Get unique values for filters
  const uniqueCustomers = Array.from(new Set(overdueInvoices.map(inv => inv.customer))).sort();
  const uniqueCollectors = Array.from(new Set(overdueInvoices.map(inv => inv.collector)));

  // Apply filters
  const filteredInvoices = overdueInvoices.filter(invoice => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (
        !invoice.id.toLowerCase().includes(query) &&
        !invoice.customer.toLowerCase().includes(query) &&
        !invoice.collector.toLowerCase().includes(query)
      ) {
        return false;
      }
    }

    // Aging filter
    if (filters.aging.length > 0 && !filters.aging.includes(invoice.aging)) {
      return false;
    }

    // Risk filter
    if (filters.risk.length > 0 && !filters.risk.includes(invoice.risk)) {
      return false;
    }

    // Customer filter
    if (filters.customer.length > 0 && !filters.customer.includes(invoice.customer)) {
      return false;
    }

    // Collector filter
    if (filters.collector.length > 0 && !filters.collector.includes(invoice.collector)) {
      return false;
    }

    // Amount filter
    if (filters.amountMin && invoice.amount < Number(filters.amountMin)) {
      return false;
    }
    if (filters.amountMax && invoice.amount > Number(filters.amountMax)) {
      return false;
    }

    return true;
  });

  const toggleFilter = (category: keyof typeof filters, value: string) => {
    setFilters(prev => {
      const current = prev[category] as string[];
      if (current.includes(value)) {
        return { ...prev, [category]: current.filter(v => v !== value) };
      } else {
        return { ...prev, [category]: [...current, value] };
      }
    });
  };

  const clearAllFilters = () => {
    setFilters({
      customer: [],
      aging: [],
      risk: [],
      collector: [],
      amountMin: '',
      amountMax: '',
    });
    setSearchQuery('');
  };

  const hasActiveFilters = 
    filters.customer.length > 0 || 
    filters.aging.length > 0 || 
    filters.risk.length > 0 || 
    filters.collector.length > 0 || 
    filters.amountMin || 
    filters.amountMax ||
    searchQuery;

  const sortInvoices = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedInvoices = useMemo(() => {
    if (!sortField || !sortDirection) {
      return filteredInvoices;
    }
    return [...filteredInvoices].sort((a, b) => {
      let aValue: any = a[sortField];
      let bValue: any = b[sortField];
      
      // Explicit handling for numeric fields
      if (sortField === 'amount' || sortField === 'daysOverdue') {
        const numA = Number(aValue);
        const numB = Number(bValue);
        return sortDirection === 'asc' ? numA - numB : numB - numA;
      }
      
      // String comparison for other fields
      const strA = String(aValue);
      const strB = String(bValue);
      return sortDirection === 'asc' 
        ? strA.localeCompare(strB) 
        : strB.localeCompare(strA);
    });
  }, [filteredInvoices, sortField, sortDirection]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-red-600 to-orange-600 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-slate-900">Past Due Accounts Receivable</h2>
              <p className="text-sm text-slate-500">Overdue invoices requiring immediate attention</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-lg p-4 border border-red-200">
              <p className="text-sm text-red-700">Total Past Due</p>
              <p className="text-slate-900 mt-1">${total.toLocaleString()}</p>
            </div>
            <div className="bg-gradient-to-br from-amber-50 to-yellow-50 rounded-lg p-4 border border-amber-200">
              <p className="text-sm text-amber-700">Critical (90+ days)</p>
              <p className="text-slate-900 mt-1">${agingBreakdown[3].value.toLocaleString()}</p>
              <p className="text-xs text-amber-600 mt-1">{agingBreakdown[3].count} invoices</p>
            </div>
            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-4 border border-blue-200">
              <p className="text-sm text-blue-700">Average Days Overdue</p>
              <p className="text-slate-900 mt-1">
                {Math.round(overdueInvoices.reduce((sum, inv) => sum + inv.daysOverdue, 0) / overdueInvoices.length)} days
              </p>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-4 border border-purple-200">
              <p className="text-sm text-purple-700">Invoices at Risk</p>
              <p className="text-slate-900 mt-1">{overdueInvoices.filter(inv => inv.risk === 'high').length}</p>
              <p className="text-xs text-purple-600 mt-1">high risk</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Aging Distribution */}
            <div className="bg-white rounded-lg p-6 border border-slate-200">
              <h3 className="text-slate-900 mb-4">Past Due Distribution</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={agingBreakdown}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {agingBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: unknown) => `$${(value as number).toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Aging Breakdown Table */}
            <div className="bg-white rounded-lg p-6 border border-slate-200">
              <h3 className="text-slate-900 mb-4">Breakdown by Bucket</h3>
              <div className="space-y-3">
                {agingBreakdown.map((item) => (
                  <div key={item.name} className="p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-4 h-4 rounded"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-slate-900">{item.name}</span>
                      </div>
                      <span className="text-slate-900">${(item.value / 1000).toFixed(0)}K</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{item.count} invoices</span>
                      <span>{((item.value / total) * 100).toFixed(1)}% of total</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Invoice List */}
          <div className="bg-white rounded-lg border border-slate-200">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-slate-900">Overdue Invoices ({filteredInvoices.length})</h3>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search..."
                    className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <button 
                  className={`flex items-center gap-2 px-3 py-2 border rounded-lg transition-colors text-sm ${
                    hasActiveFilters 
                      ? 'bg-blue-50 border-blue-300 text-blue-700' 
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <Filter className="w-4 h-4" />
                  Filter
                  {hasActiveFilters && (
                    <span className="ml-1 px-1.5 py-0.5 bg-blue-600 text-white rounded text-xs">
                      {[
                        ...filters.customer,
                        ...filters.aging,
                        ...filters.risk,
                        ...filters.collector,
                        filters.amountMin ? 'min' : null,
                        filters.amountMax ? 'max' : null,
                      ].filter(Boolean).length}
                    </span>
                  )}
                </button>
                <button className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm">
                  <Download className="w-4 h-4" />
                  Export
                </button>
              </div>
            </div>

            {/* Filter Panel */}
            {showFilters && (
              <div className="p-4 bg-slate-50 border-b border-slate-200">
                <div className="flex items-start justify-between mb-4">
                  <h4 className="text-sm text-slate-900">Filter Invoices</h4>
                  {hasActiveFilters && (
                    <button
                      onClick={clearAllFilters}
                      className="text-sm text-blue-600 hover:text-blue-700"
                    >
                      Clear all
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Aging Bucket Filter */}
                  <div>
                    <label className="block text-xs text-slate-600 mb-2">Aging Bucket</label>
                    <div className="space-y-2">
                      {['1-30 days', '31-60 days', '61-90 days', '90+ days'].map((aging) => (
                        <label key={aging} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={filters.aging.includes(aging)}
                            onChange={() => toggleFilter('aging', aging)}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-slate-700">{aging}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Risk Level Filter */}
                  <div>
                    <label className="block text-xs text-slate-600 mb-2">Risk Level</label>
                    <div className="space-y-2">
                      {['high', 'medium', 'low'].map((risk) => (
                        <label key={risk} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={filters.risk.includes(risk)}
                            onChange={() => toggleFilter('risk', risk)}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-slate-700 capitalize">{risk}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Customer Filter */}
                  <div>
                    <label className="block text-xs text-slate-600 mb-2">Customer</label>
                    <div className="space-y-2">
                      {uniqueCustomers.map((customer) => (
                        <label key={customer} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={filters.customer.includes(customer)}
                            onChange={() => toggleFilter('customer', customer)}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-slate-700">{customer}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Collector Filter */}
                  <div>
                    <label className="block text-xs text-slate-600 mb-2">Collector</label>
                    <div className="space-y-2">
                      {uniqueCollectors.map((collector) => (
                        <label key={collector} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={filters.collector.includes(collector)}
                            onChange={() => toggleFilter('collector', collector)}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-slate-700">{collector}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Amount Range Filter */}
                  <div>
                    <label className="block text-xs text-slate-600 mb-2">Amount Range</label>
                    <div className="space-y-2">
                      <input
                        type="number"
                        placeholder="Min amount"
                        value={filters.amountMin}
                        onChange={(e) => setFilters(prev => ({ ...prev, amountMin: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="number"
                        placeholder="Max amount"
                        value={filters.amountMax}
                        onChange={(e) => setFilters(prev => ({ ...prev, amountMax: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left py-3 px-4 text-slate-600 cursor-pointer" onClick={() => sortInvoices('id')}>
                      Invoice #
                      {sortField === 'id' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 inline-block" /> : <ChevronDown className="w-4 h-4 inline-block" />
                      )}
                    </th>
                    <th className="text-left py-3 px-4 text-slate-600 cursor-pointer" onClick={() => sortInvoices('customer')}>
                      Customer
                      {sortField === 'customer' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 inline-block" /> : <ChevronDown className="w-4 h-4 inline-block" />
                      )}
                    </th>
                    <th className="text-right py-3 px-4 text-slate-600 cursor-pointer" onClick={() => sortInvoices('amount')}>
                      Amount
                      {sortField === 'amount' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 inline-block" /> : <ChevronDown className="w-4 h-4 inline-block" />
                      )}
                    </th>
                    <th className="text-left py-3 px-4 text-slate-600 cursor-pointer" onClick={() => sortInvoices('daysOverdue')}>
                      Days Overdue
                      {sortField === 'daysOverdue' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 inline-block" /> : <ChevronDown className="w-4 h-4 inline-block" />
                      )}
                    </th>
                    <th className="text-left py-3 px-4 text-slate-600 cursor-pointer" onClick={() => sortInvoices('risk')}>
                      Risk
                      {sortField === 'risk' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 inline-block" /> : <ChevronDown className="w-4 h-4 inline-block" />
                      )}
                    </th>
                    <th className="text-left py-3 px-4 text-slate-600 cursor-pointer" onClick={() => sortInvoices('collector')}>
                      Collector
                      {sortField === 'collector' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 inline-block" /> : <ChevronDown className="w-4 h-4 inline-block" />
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedInvoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-4 text-blue-600">{invoice.id}</td>
                      <td className="py-3 px-4">
                        <div className="text-slate-900">{invoice.customer}</div>
                        <div className="text-xs text-slate-500">Last contact: {invoice.lastContact}</div>
                      </td>
                      <td className="py-3 px-4 text-right text-slate-900">${invoice.amount.toLocaleString()}</td>
                      <td className="py-3 px-4">
                        <span className="text-red-600">{invoice.daysOverdue} days</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded text-xs ${
                          invoice.risk === 'high' ? 'bg-red-100 text-red-700' :
                          invoice.risk === 'medium' ? 'bg-amber-100 text-amber-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {invoice.risk}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{invoice.collector}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action Recommendations */}
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg p-4 border border-amber-200">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-slate-900 mb-2">Recommended Actions</p>
                <ul className="text-sm text-slate-700 space-y-1">
                  <li>• <span className="text-amber-700">Immediate escalation</span> required for 3 invoices over 90 days</li>
                  <li>• <span className="text-amber-700">Follow-up calls</span> recommended for 4 high-risk accounts</li>
                  <li>• <span className="text-amber-700">Payment plans</span> should be offered to customers with multiple overdue invoices</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
      {selectedInvoiceForComm && (
        <CommunicationHistoryModal
          invoice={selectedInvoiceForComm}
          onClose={() => setSelectedInvoiceForComm(null)}
        />
      )}
    </div>
  );
}