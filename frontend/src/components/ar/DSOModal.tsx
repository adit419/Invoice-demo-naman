import { X, Clock, TrendingDown, Award, AlertCircle, Mail, Filter, Search } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useState, useMemo } from 'react';
import { CustomerDSODetailModal } from './CustomerDSODetailModal';
import { CustomerCommunicationHistoryModal } from './CustomerCommunicationHistoryModal';

interface DSOModalProps {
  onClose: () => void;
}

export function DSOModal({ onClose }: DSOModalProps) {
  const [selectedCustomer, setSelectedCustomer] = useState<typeof topCustomersByDSO[0] | null>(null);
  const [commHistoryCustomer, setCommHistoryCustomer] = useState<typeof topCustomersByDSO[0] | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    customer: [] as string[],
    impactLevel: [] as string[],
    dsoRange: [] as string[],
    amountRange: [] as string[],
    commHistory: [] as string[],
  });

  const dsoTrendData = [
    { month: 'Jun', dso: 48, target: 45 },
    { month: 'Jul', dso: 47, target: 45 },
    { month: 'Aug', dso: 45, target: 45 },
    { month: 'Sep', dso: 44, target: 45 },
    { month: 'Oct', dso: 43, target: 45 },
    { month: 'Nov', dso: 42, target: 45 },
  ];

  const dsoBySegment = [
    { segment: 'Enterprise', dso: 35, color: '#10b981' },
    { segment: 'Mid-Market', dso: 42, color: '#3b82f6' },
    { segment: 'SMB', dso: 48, color: '#f59e0b' },
    { segment: 'Retail', dso: 52, color: '#ef4444' },
  ];

  const topCustomersByDSO = [
    { customer: 'ABC Manufacturing Ltd', dso: 89, amount: 145000, impact: 'high' },
    { customer: 'Premium Distributors', dso: 76, amount: 76000, impact: 'high' },
    { customer: 'Global Retail Corp', dso: 68, amount: 98000, impact: 'medium' },
    { customer: 'Tech Solutions Inc', dso: 65, amount: 87000, impact: 'medium' },
    { customer: 'Smart Systems Co', dso: 52, amount: 65000, impact: 'medium' },
    { customer: 'Quality Partners LLC', dso: 48, amount: 52000, impact: 'low' },
    { customer: 'Metro Supplies Ltd', dso: 45, amount: 48000, impact: 'low' },
    { customer: 'Coastal Distributors', dso: 42, amount: 43000, impact: 'low' },
  ];

  const industryBenchmark = {
    yourDSO: 42,
    industryAverage: 45,
    topPerformers: 35,
    yourImprovement: -6,
  };

  const filteredTopCustomers = useMemo(() => {
    return topCustomersByDSO.filter((customer) => {
      if (filters.customer.length > 0 && !filters.customer.includes(customer.customer)) {
        return false;
      }
      if (filters.impactLevel.length > 0 && !filters.impactLevel.includes(customer.impact)) {
        return false;
      }
      if (filters.dsoRange.length > 0) {
        const dsoRange = filters.dsoRange.map(range => range.split('-').map(Number));
        const isInRange = dsoRange.some(([min, max]) => customer.dso >= min && customer.dso <= max);
        if (!isInRange) {
          return false;
        }
      }
      if (filters.amountRange.length > 0) {
        const amountRange = filters.amountRange.map(range => range.split('-').map(Number));
        const isInRange = amountRange.some(([min, max]) => customer.amount >= min && customer.amount <= max);
        if (!isInRange) {
          return false;
        }
      }
      if (filters.commHistory.length > 0) {
        const hasCommHistory = filters.commHistory.includes('hasCommHistory');
        if (hasCommHistory) {
          return false;
        }
      }
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!customer.customer.toLowerCase().includes(query)) {
          return false;
        }
      }
      return true;
    });
  }, [filters, topCustomersByDSO, searchQuery]);

  const toggleFilter = (category: keyof typeof filters, value: string) => {
    setFilters(prev => ({
      ...prev,
      [category]: prev[category].includes(value)
        ? prev[category].filter(v => v !== value)
        : [...prev[category], value]
    }));
  };

  const clearFilters = () => {
    setFilters({
      customer: [],
      impactLevel: [],
      dsoRange: [],
      amountRange: [],
      commHistory: [],
    });
  };

  const activeFiltersCount = filters.customer.length + filters.impactLevel.length + filters.dsoRange.length + filters.amountRange.length + filters.commHistory.length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-green-600 to-emerald-600 rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-slate-900">Days Sales Outstanding (DSO)</h2>
              <p className="text-sm text-slate-500">Track and optimize collection efficiency</p>
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
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200">
              <p className="text-sm text-green-700">Current DSO</p>
              <p className="text-slate-900 mt-1 text-2xl">{industryBenchmark.yourDSO} days</p>
              <div className="flex items-center gap-1 mt-1 text-green-600">
                <TrendingDown className="w-4 h-4" />
                <span className="text-xs">{Math.abs(industryBenchmark.yourImprovement)} days improvement</span>
              </div>
            </div>
            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-4 border border-blue-200">
              <p className="text-sm text-blue-700">Industry Average</p>
              <p className="text-slate-900 mt-1 text-2xl">{industryBenchmark.industryAverage} days</p>
              <p className="text-xs text-blue-600 mt-1">You're performing better</p>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-4 border border-purple-200">
              <p className="text-sm text-purple-700">Top Performers</p>
              <p className="text-slate-900 mt-1 text-2xl">{industryBenchmark.topPerformers} days</p>
              <p className="text-xs text-purple-600 mt-1">Target benchmark</p>
            </div>
            <div className="bg-gradient-to-br from-amber-50 to-yellow-50 rounded-lg p-4 border border-amber-200">
              <p className="text-sm text-amber-700">Gap to Excellence</p>
              <p className="text-slate-900 mt-1 text-2xl">{industryBenchmark.yourDSO - industryBenchmark.topPerformers} days</p>
              <p className="text-xs text-amber-600 mt-1">Improvement opportunity</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* DSO Trend */}
            <div className="bg-white rounded-lg p-6 border border-slate-200">
              <h3 className="text-slate-900 mb-4">DSO Trend (Last 6 Months)</h3>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={dsoTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip 
                    contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="dso" 
                    stroke="#10b981" 
                    strokeWidth={2} 
                    dot={{ fill: '#10b981', r: 4 }}
                    name="Your DSO"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="target" 
                    stroke="#94a3b8" 
                    strokeWidth={2} 
                    strokeDasharray="5 5"
                    name="Target"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* DSO by Segment */}
            <div className="bg-white rounded-lg p-6 border border-slate-200">
              <h3 className="text-slate-900 mb-4">DSO by Customer Segment</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={dsoBySegment}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="segment" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip 
                    formatter={(value: unknown) => `${value} days`}
                    contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                  />
                  <Bar dataKey="dso" radius={[8, 8, 0, 0]}>
                    {dsoBySegment.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top Customers by DSO Impact */}
          <div className="bg-white rounded-lg border border-slate-200">
            <div className="p-4 border-b border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-slate-900">Customers with Highest DSO Impact ({filteredTopCustomers.length})</h3>
                  <p className="text-sm text-slate-500 mt-1">Focus on these accounts to improve overall DSO</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search customer..."
                      className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <button 
                    onClick={() => setShowFilters(!showFilters)}
                    className={`flex items-center gap-2 px-3 py-2 border rounded-lg transition-colors text-sm ${
                      showFilters || activeFiltersCount > 0
                        ? 'bg-blue-50 border-blue-500 text-blue-700'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Filter className="w-4 h-4" />
                    Filters
                    {activeFiltersCount > 0 && (
                      <span className="bg-blue-600 text-white rounded-full px-2 py-0.5 text-xs">
                        {activeFiltersCount}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Filter Panel */}
              {showFilters && (
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-slate-600">Filter by:</p>
                    {activeFiltersCount > 0 && (
                      <button
                        onClick={clearFilters}
                        className="text-sm text-blue-600 hover:text-blue-700"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    {/* Customer Filter */}
                    <div>
                      <label className="text-xs text-slate-600 mb-2 block">Customer</label>
                      <div className="space-y-2">
                        {topCustomersByDSO.map((customer) => (
                          <label key={customer.customer} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={filters.customer.includes(customer.customer)}
                              onChange={() => toggleFilter('customer', customer.customer)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-slate-700">{customer.customer}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Impact Level Filter */}
                    <div>
                      <label className="text-xs text-slate-600 mb-2 block">Impact Level</label>
                      <div className="space-y-2">
                        {['high', 'medium', 'low'].map((impact) => (
                          <label key={impact} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={filters.impactLevel.includes(impact)}
                              onChange={() => toggleFilter('impactLevel', impact)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              impact === 'high' ? 'bg-red-100 text-red-700' :
                              impact === 'medium' ? 'bg-amber-100 text-amber-700' :
                              'bg-green-100 text-green-700'
                            }`}>
                              {impact}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* DSO Range Filter */}
                    <div>
                      <label className="text-xs text-slate-600 mb-2 block">DSO Range (days)</label>
                      <div className="space-y-2">
                        {[
                          { label: '0-45 days', value: '0-45' },
                          { label: '46-60 days', value: '46-60' },
                          { label: '61-75 days', value: '61-75' },
                          { label: '76+ days', value: '76-999' },
                        ].map((range) => (
                          <label key={range.value} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={filters.dsoRange.includes(range.value)}
                              onChange={() => toggleFilter('dsoRange', range.value)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-slate-700">{range.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Amount Range Filter */}
                    <div>
                      <label className="text-xs text-slate-600 mb-2 block">Outstanding Amount Range ($)</label>
                      <div className="space-y-2">
                        {[
                          { label: '0-50,000', value: '0-50000' },
                          { label: '50,001-100,000', value: '50001-100000' },
                          { label: '100,001-200,000', value: '100001-200000' },
                          { label: '200,001+', value: '200001-999999' },
                        ].map((range) => (
                          <label key={range.value} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={filters.amountRange.includes(range.value)}
                              onChange={() => toggleFilter('amountRange', range.value)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-slate-700">{range.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Communication History Filter */}
                    <div>
                      <label className="text-xs text-slate-600 mb-2 block">Communication History</label>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={filters.commHistory.includes('hasCommHistory')}
                            onChange={() => toggleFilter('commHistory', 'hasCommHistory')}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-slate-700">Has Communication History</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left py-3 px-4 text-slate-600">Customer</th>
                    <th className="text-right py-3 px-4 text-slate-600">DSO (days)</th>
                    <th className="text-right py-3 px-4 text-slate-600">Outstanding Amount</th>
                    <th className="text-left py-3 px-4 text-slate-600">Impact Level</th>
                    <th className="text-center py-3 px-4 text-slate-600">Communication History</th>
                    <th className="text-left py-3 px-4 text-slate-600">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTopCustomers.map((customer) => (
                    <tr key={customer.customer} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-4 text-slate-900">{customer.customer}</td>
                      <td className="py-3 px-4 text-right">
                        <span className={`${
                          customer.dso > 75 ? 'text-red-600' : 
                          customer.dso > 60 ? 'text-amber-600' : 
                          'text-slate-900'
                        }`}>
                          {customer.dso} days
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-slate-900">${customer.amount.toLocaleString()}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded text-xs ${
                          customer.impact === 'high' ? 'bg-red-100 text-red-700' :
                          customer.impact === 'medium' ? 'bg-amber-100 text-amber-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {customer.impact}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button 
                          onClick={() => setCommHistoryCustomer(customer)}
                          className="w-8 h-8 rounded-lg hover:bg-blue-50 flex items-center justify-center transition-colors mx-auto"
                          title="View communication history"
                        >
                          <Mail className="w-4 h-4 text-blue-600" />
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        <button 
                          className="text-blue-600 hover:text-blue-700 text-sm"
                          onClick={() => setSelectedCustomer(customer)}
                        >
                          View Details →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Performance Insights */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200">
              <div className="flex items-start gap-3">
                <Award className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-slate-900 mb-2">Performance Highlights</p>
                  <ul className="text-sm text-slate-700 space-y-1">
                    <li>• DSO improved by <span className="text-green-700">6 days</span> in the last 6 months</li>
                    <li>• Currently <span className="text-green-700">3 days better</span> than industry average</li>
                    <li>• <span className="text-green-700">Enterprise segment</span> performing exceptionally well (35 days)</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg p-4 border border-amber-200">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-slate-900 mb-2">Improvement Opportunities</p>
                  <ul className="text-sm text-slate-700 space-y-1">
                    <li>• Focus on <span className="text-amber-700">Retail segment</span> (52 days DSO)</li>
                    <li>• 5 high-impact customers need <span className="text-amber-700">immediate attention</span></li>
                    <li>• Reducing top 5 customer DSO could save <span className="text-amber-700">7 days</span> overall</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Action Recommendations */}
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <h4 className="text-slate-900 mb-3">Recommended Actions to Reach 35-Day Target</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-white rounded-lg p-3">
                <p className="text-sm text-slate-900">1. Automate Reminders</p>
                <p className="text-xs text-slate-600 mt-1">Send automated payment reminders 3 days before due date</p>
                <p className="text-xs text-blue-600 mt-2">Impact: -2 days DSO</p>
              </div>
              <div className="bg-white rounded-lg p-3">
                <p className="text-sm text-slate-900">2. Early Payment Discounts</p>
                <p className="text-xs text-slate-600 mt-1">Offer 2% discount for payments within 10 days</p>
                <p className="text-xs text-blue-600 mt-2">Impact: -3 days DSO</p>
              </div>
              <div className="bg-white rounded-lg p-3">
                <p className="text-sm text-slate-900">3. Credit Terms Review</p>
                <p className="text-xs text-slate-600 mt-1">Tighten terms for slow-paying customers</p>
                <p className="text-xs text-blue-600 mt-2">Impact: -2 days DSO</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      {selectedCustomer && (
        <CustomerDSODetailModal 
          customer={selectedCustomer} 
          onClose={() => setSelectedCustomer(null)}
        />
      )}
      {commHistoryCustomer && (
        <CustomerCommunicationHistoryModal 
          customer={commHistoryCustomer} 
          onClose={() => setCommHistoryCustomer(null)}
        />
      )}
    </div>
  );
}