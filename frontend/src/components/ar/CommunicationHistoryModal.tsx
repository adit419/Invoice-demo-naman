import { X } from 'lucide-react';

interface CommunicationHistoryModalProps {
  invoice: { id: string; customer: string; [key: string]: unknown };
  onClose: () => void;
}

export function CommunicationHistoryModal({ invoice, onClose }: CommunicationHistoryModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-slate-900 font-semibold">Communication History — {invoice.customer}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">
          <p className="text-slate-500 text-sm">No communication history available for {invoice.id}.</p>
        </div>
      </div>
    </div>
  );
}
