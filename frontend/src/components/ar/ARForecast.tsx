import { useState, useEffect } from 'react';
import { TrendingUp, DollarSign, Settings, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { allInvoices, calculateTotalAR } from '@/data/arInvoiceData';

export function ARForecast() {
  const [scenario, setScenario] = useState('base');
  const [globalAdjustment, setGlobalAdjustment] = useState(0);

  const [probabilitySettings, setProbabilitySettings] = useState([
    { bucket: '1-30 days', probability: 95 },
    { bucket: '31-60 days', probability: 85 },
    { bucket: '61-90 days', probability: 70 },
    { bucket: '90+ days', probability: 30 },
  ]);

  const updateProbability = (bucket: string, newProbability: number) => {
    setProbabilitySettings(prev =>
      prev.map(setting =>
        setting.bucket === bucket
          ? { ...setting, probability: newProbability }
          : setting
      )
    );
  };

  const getProbabilityForAging = (aging: string) => {
    const setting = probabilitySettings.find(s => s.bucket === aging);
    return setting ? setting.probability : 95;
  };

  const openInvoices = allInvoices
    .filter(inv => inv.status === 'Overdue')
    .map(inv => {
      const aging = inv.aging;
      const probability = getProbabilityForAging(aging);

      let collectionStatus: 'promised' | 'disputed' | null = null;
      let included = true;

      if (['Mega Corp Industries', 'Premium Distributors', 'Global Retail Corp', 'Summit Corporation'].includes(inv.customer)) {
        collectionStatus = 'promised';
        included = true;
      } else if (['Legacy Systems Inc', 'Vintage Industries', 'Tech Solutions Inc', 'ABC Manufacturing Ltd'].includes(inv.customer)) {
        collectionStatus = 'disputed';
        included = false;
      }

      return {
        id: inv.id,
        customer: inv.customer,
        invoice: inv.id,
        amount: inv.amount,
        aging: aging,
        probability: probability,
        included: included,
        collectionStatus: collectionStatus,
      };
    });

  const getInitialIncludedInvoices = () => {
    return openInvoices.filter(inv => inv.included).map(inv => inv.id);
  };

  const [includedInvoices, setIncludedInvoices] = useState<string[]>([]);

  useEffect(() => {
    if (includedInvoices.length === 0 && openInvoices.length > 0) {
      setIncludedInvoices(getInitialIncludedInvoices());
    }
  }, [openInvoices, includedInvoices]);

  const toggleInvoiceInclusion = (invoiceId: string, collectionStatus: 'promised' | 'disputed' | null) => {
    if (collectionStatus === 'promised') return;

    setIncludedInvoices(prev => {
      if (prev.includes(invoiceId)) {
        return prev.filter(id => id !== invoiceId);
      } else {
        return [...prev, invoiceId];
      }
    });
  };

  const totalProjected = openInvoices
    .filter(inv => includedInvoices.includes(inv.id))
    .reduce((sum, inv) => sum + (inv.amount * inv.probability / 100), 0);

  const totalAR = calculateTotalAR();

  const mostLikely = totalProjected;
  const bestScenario = totalProjected * 1.25;
  const worstScenario = totalProjected * 0.75;

  const baseCollectionRate = (mostLikely / totalAR) * 100;
  const optimisticCollectionRate = (bestScenario / totalAR) * 100;
  const conservativeCollectionRate = (worstScenario / totalAR) * 100;

  const week1Base = mostLikely * 0.30;
  const week2Base = mostLikely * 0.28;
  const week3Base = mostLikely * 0.24;
  const week4Base = mostLikely * 0.18;

  const forecastData = [
    { period: 'Week 1', projected: week1Base, pastDue: week1Base * 0.45, current: week1Base * 0.55 },
    { period: 'Week 2', projected: week2Base, pastDue: week2Base * 0.42, current: week2Base * 0.58 },
    { period: 'Week 3', projected: week3Base, pastDue: week3Base * 0.40, current: week3Base * 0.60 },
    { period: 'Week 4', projected: week4Base, pastDue: week4Base * 0.38, current: week4Base * 0.62 },
  ];

  const scenarioComparison = [
    { period: 'Week 1', base: week1Base, optimistic: bestScenario * 0.30, conservative: worstScenario * 0.30 },
    { period: 'Week 2', base: week2Base, optimistic: bestScenario * 0.28, conservative: worstScenario * 0.28 },
    { period: 'Week 3', base: week3Base, optimistic: bestScenario * 0.24, conservative: worstScenario * 0.24 },
    { period: 'Week 4', base: week4Base, optimistic: bestScenario * 0.18, conservative: worstScenario * 0.18 },
  ];

  void globalAdjustment;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-slate-900">AR Cash Collection Forecast</h2>
          <p className="text-sm text-slate-500 mt-1">AI-powered collection probability modeling</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm text-slate-500">Last Updated</p>
            <p className="text-slate-900">Nov 25, 2024 • 9:30 AM</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              <Settings className="w-4 h-4" />
              <span>Configure</span>
            </button>
          </div>
        </div>
      </div>

      {/* Summary Card */}
      <div className="grid grid-cols-1 md:grid-cols-1 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-blue-600" />
            <p className="text-sm text-slate-600">Total AR</p>
          </div>
          <p className="text-slate-900">${(totalAR / 1000000).toFixed(2)}M</p>
        </div>
      </div>

      {/* Scenario Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 shadow-sm border-2 border-green-200">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
            <p className="text-sm text-green-700">Best Scenario ({optimisticCollectionRate.toFixed(0)}%)</p>
          </div>
          <p className="text-green-900">${(bestScenario / 1000000).toFixed(2)}M</p>
          <p className="text-xs text-green-600 mt-1">Optimistic collection rate</p>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 shadow-sm border-2 border-blue-300">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            <p className="text-sm text-blue-700">Most Likely ({baseCollectionRate.toFixed(0)}%)</p>
          </div>
          <p className="text-blue-900">${(mostLikely / 1000000).toFixed(2)}M</p>
          <p className="text-xs text-blue-600 mt-1">Base case projection</p>
        </div>
        <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-6 shadow-sm border-2 border-orange-200">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-orange-600" />
            <p className="text-sm text-orange-700">Worst Scenario ({conservativeCollectionRate.toFixed(0)}%)</p>
          </div>
          <p className="text-orange-900">${(worstScenario / 1000000).toFixed(2)}M</p>
          <p className="text-xs text-orange-600 mt-1">Conservative estimate</p>
        </div>
      </div>

      {/* Scenario Selection */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-slate-900">Forecast Scenarios</h3>
          <div className="flex items-center gap-2">
            {['base', 'optimistic', 'conservative'].map((s) => (
              <button
                key={s}
                onClick={() => setScenario(s)}
                className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                  scenario === s
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={scenarioComparison}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="period" stroke="#64748b" />
            <YAxis stroke="#64748b" />
            <Tooltip
              formatter={(value: unknown) => `$${((value as number) / 1000).toFixed(0)}K`}
              contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
            />
            <Legend />
            <Line type="monotone" dataKey="optimistic" stroke="#10b981" strokeWidth={2} name="Optimistic" />
            <Line type="monotone" dataKey="base" stroke="#3b82f6" strokeWidth={3} name="Base" />
            <Line type="monotone" dataKey="conservative" stroke="#f59e0b" strokeWidth={2} name="Conservative" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Collection Probability by Aging */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <h3 className="text-slate-900 mb-4">Collection Probability by Aging Bucket</h3>
          <div className="space-y-4">
            {probabilitySettings.map((setting) => (
              <div key={setting.bucket} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-900">{setting.bucket}</span>
                  <span className="text-slate-900">{setting.probability}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={setting.probability}
                  onChange={(e) => updateProbability(setting.bucket, parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${setting.probability}%, #e2e8f0 ${setting.probability}%, #e2e8f0 100%)`
                  }}
                />
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-xs text-blue-700">
              Drag the sliders to adjust collection probabilities. Changes will update all projections in real-time.
            </p>
          </div>
        </div>

        {/* Weekly Forecast Breakdown */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <h3 className="text-slate-900 mb-4">Weekly Forecast Breakdown</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={forecastData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="period" stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip
                formatter={(value: unknown) => `$${((value as number) / 1000).toFixed(0)}K`}
                contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
              />
              <Legend />
              <Bar dataKey="current" stackId="a" fill="#10b981" name="Current" radius={[0, 0, 0, 0]} />
              <Bar dataKey="pastDue" stackId="a" fill="#f59e0b" name="Past Due" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Invoice-Level Grid */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-slate-900">Invoice-Level Forecast</h3>
              <p className="text-xs text-slate-500 mt-1">Configure per-invoice probabilities and inclusion</p>
            </div>
            <div className="text-sm text-slate-600">
              <span className="text-slate-900">{includedInvoices.length}</span> of {openInvoices.length} invoices included
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left py-3 px-4 text-slate-600">Include</th>
                <th className="text-left py-3 px-4 text-slate-600">Customer</th>
                <th className="text-left py-3 px-4 text-slate-600">Invoice</th>
                <th className="text-right py-3 px-4 text-slate-600">Amount</th>
                <th className="text-left py-3 px-4 text-slate-600">Aging</th>
                <th className="text-left py-3 px-4 text-slate-600">Status</th>
                <th className="text-right py-3 px-4 text-slate-600">Expected</th>
              </tr>
            </thead>
            <tbody>
              {openInvoices.map((invoice) => (
                <tr key={invoice.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4">
                    <input
                      type="checkbox"
                      checked={includedInvoices.includes(invoice.id)}
                      className={`w-4 h-4 text-blue-600 rounded ${invoice.collectionStatus === 'promised' ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                      onChange={() => toggleInvoiceInclusion(invoice.id, invoice.collectionStatus)}
                      disabled={invoice.collectionStatus === 'promised'}
                    />
                  </td>
                  <td className="py-3 px-4 text-slate-900">{invoice.customer}</td>
                  <td className="py-3 px-4 text-slate-900">{invoice.invoice}</td>
                  <td className="py-3 px-4 text-right text-slate-900">${invoice.amount.toLocaleString()}</td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs">
                      {invoice.aging}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {invoice.collectionStatus === 'promised' && (
                      <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">
                        Promised to Pay
                      </span>
                    )}
                    {invoice.collectionStatus === 'disputed' && (
                      <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">
                        Disputed
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-900">
                    ${(invoice.amount * invoice.probability / 100).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50">
                <td colSpan={3} className="py-3 px-4 text-slate-900">Total Projected Collections</td>
                <td className="py-3 px-4 text-right text-slate-900">
                  ${openInvoices.reduce((sum, inv) => sum + inv.amount, 0).toLocaleString()}
                </td>
                <td colSpan={2}></td>
                <td className="py-3 px-4 text-right text-slate-900">
                  ${Math.round(totalProjected).toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Audit Trail Notice */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl p-4 border border-purple-200">
        <p className="text-sm text-slate-700">
          Audit Trail: All forecast adjustments are logged with user, timestamp, and reason. View history to track forecast changes over time.
        </p>
      </div>
    </div>
  );
}
