import { X } from 'lucide-react';

interface CustomerDSODetailModalProps {
  customer: { customer: string; dso: number; amount: number; impact: string };
  onClose: () => void;
}

export function CustomerDSODetailModal({ customer, onClose }: CustomerDSODetailModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-slate-900 font-semibold">DSO Detail — {customer.customer}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-3">
          <div className="flex justify-between"><span className="text-slate-500">DSO</span><span className="font-semibold text-slate-900">{customer.dso} days</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Outstanding</span><span className="font-semibold text-slate-900">${customer.amount.toLocaleString()}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Impact</span><span className="font-semibold text-slate-900 capitalize">{customer.impact}</span></div>
        </div>
      </div>
    </div>
  );
}
