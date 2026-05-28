import { useState, useMemo } from 'react';
import { Search, Filter, Mail, Phone, FileText, Clock, AlertTriangle, Sparkles, X } from 'lucide-react';
import { allInvoices } from '@/data/arInvoiceData';

interface CustomerSummary {
  customerName: string;
  geography: string;
  totalAmount: number;
  overdueAmount: number;
  invoiceCount: number;
  maxDaysOverdue: number;
  status: 'current' | 'overdue' | 'critical';
  priority: number;
  lastContact: string;
  riskScore: number;
  promiseToPay?: { date: string; amount: number };
  invoices: Array<{
    id: string;
    amount: number;
    dueDate: string;
    daysOverdue: number;
    aging: string;
  }>;
  communicationHistory: Array<{
    date: string;
    type: 'email' | 'call' | 'note';
    subject: string;
    notes: string;
    agent: string;
    outcome?: string;
  }>;
}

function generateCommunicationHistory(customerName: string, lastContact?: string): CustomerSummary['communicationHistory'] {
  const histories: Record<string, CustomerSummary['communicationHistory']> = {
    'Mega Corp Industries': [
      {
        date: '2024-11-20', type: 'email',
        subject: 'Payment Reminder - Outstanding Invoices',
        notes: 'Dear Mega Corp Industries Team,\n\nI hope this message finds you well. I\'m writing to follow up on the outstanding invoices totaling $350,000 that are currently past due.\n\nInvoices:\n• INV-2024-001: $150,000 (75 days overdue)\n• INV-2024-045: $120,000 (68 days overdue)\n• INV-2024-089: $80,000 (62 days overdue)\n\nWe understand that payment processing can take time, but we would appreciate an update on when we can expect payment for these invoices.\n\nPlease let me know if you need any additional documentation or if there are any issues we need to address.\n\nBest regards,\nJohn Doe\nCollections Team',
        agent: 'John Doe', outcome: 'Customer promised payment by Nov 30',
      },
      {
        date: '2024-11-15', type: 'call',
        subject: 'Phone Call - Outstanding Balance Discussion',
        notes: 'Spoke with Sarah Johnson, AP Manager at Mega Corp Industries.\n\nKey Discussion Points:\n• Acknowledged receipt of all invoices\n• Explained they are experiencing temporary cash flow constraints due to delayed customer payments\n• Committed to processing payment within 2 weeks\n• Requested patience and understanding\n\nAction Items:\n• Customer will send payment confirmation by Nov 30\n• Agreed to provide weekly updates on payment status\n• Will prioritize our invoices in next payment batch',
        agent: 'Jane Smith', outcome: 'Processing payment this week',
      },
      {
        date: '2024-11-10', type: 'note',
        subject: 'Internal Note - Account Status',
        notes: 'Customer has been a reliable payer historically with 95% on-time payment rate over past 2 years. Current delays appear to be temporary based on discussion with their finance team.\n\nRecommendation: Continue standard collection process but maintain positive relationship. No need for aggressive escalation at this time.\n\nCredit limit review scheduled for Q1 2025.',
        agent: 'Alice Johnson',
      },
    ],
    'Premium Distributors': [
      {
        date: '2024-11-22', type: 'email',
        subject: 'Re: Payment Plan Request',
        notes: 'Hi Premium Distributors Team,\n\nThank you for your response regarding the outstanding balance of $180,000.\n\nI\'m pleased to confirm that we can accommodate your request for a payment plan:\n\n• Upfront Payment (Nov 28): $162,000 (90%)\n• Final Payment (Dec 15): $18,000 (10%)\n\nThis arrangement will help you manage cash flow while ensuring we receive payment for the outstanding invoices.\n\nPlease confirm your acceptance of these terms, and I\'ll prepare the necessary documentation.\n\nBest regards,\nBob Brown\nCollections Team',
        agent: 'Bob Brown', outcome: 'Payment scheduled for Nov 28',
      },
      {
        date: '2024-11-18', type: 'call',
        subject: 'Phone Call - Payment Plan Discussion',
        notes: 'Productive call with Michael Chen, CFO of Premium Distributors.\n\nDiscussion Summary:\n• Customer requested payment plan due to seasonal cash flow variation\n• Proposed paying 90% upfront, balance in 30 days\n• Strong payment history with company (98% on-time rate)\n• No disputes on invoice amounts or quality\n\nAgreement Reached:\n• Will pay $162,000 by Nov 28, 2024\n• Remaining $18,000 by Dec 15, 2024\n• Will provide payment confirmation 24 hours before each payment',
        agent: 'Charlie Davis', outcome: 'Agreed to pay 90% upfront',
      },
    ],
    'Tech Solutions Inc': [
      {
        date: '2024-11-15', type: 'email',
        subject: 'URGENT: Escalation Notice - Past Due Balance',
        notes: 'Dear Tech Solutions Inc,\n\nThis is a formal escalation notice regarding your past due balance of $95,000, which is now 82 days overdue.\n\nDespite multiple attempts to contact you via email and phone, we have not received any response or payment.\n\nImmediate Actions Required:\n1. Contact our collections team within 48 hours\n2. Provide explanation for payment delay\n3. Submit payment or propose payment plan\n\nConsequences of Non-Response:\n• Account will be placed on credit hold\n• Future orders will require prepayment\n• Matter may be referred to collections agency\n\nUrgently,\nDavid Wilson\nSenior Collections Manager',
        agent: 'David Wilson', outcome: 'No response received',
      },
      {
        date: '2024-11-01', type: 'call',
        subject: 'Phone Call - Voicemail Left',
        notes: 'Attempted to reach AP department at Tech Solutions Inc.\n\nCall Details:\n• Called main number: (555) 123-4567\n• Transferred to AP department\n• No answer, went to voicemail\n• Left detailed message with callback request\n\nFollow-up:\n• Will attempt another call in 3 business days\n• Will send escalation email if no response',
        agent: 'Eve White', outcome: 'No callback received',
      },
      {
        date: '2024-10-20', type: 'note',
        subject: 'Internal Note - Dispute Filed',
        notes: 'Customer has filed a formal dispute on invoice INV-2024-056 for $45,000.\n\nDispute Details:\n• Claims products did not meet specifications\n• Quality issues reported with batch #4527\n• Requesting credit or replacement\n\nCurrent Status:\n• Dispute forwarded to Product Quality team\n• Quality Manager reviewing claim\n• Investigation in progress\n\nNext Steps:\n• Quality team to respond within 10 business days\n• Schedule call with customer after review complete',
        agent: 'Frank Green',
      },
    ],
    'Global Retail Corp': [
      {
        date: '2024-11-20', type: 'call',
        subject: 'Phone Call - Payment Confirmation',
        notes: 'Follow-up call with Jennifer Martinez, AP Supervisor at Global Retail Corp.\n\nCall Summary:\n• Confirmed receipt of all invoices\n• All invoices approved and in payment queue\n• Payment processing scheduled for next batch run (Nov 28)\n• No issues or disputes with any invoices\n\nPayment Schedule:\n• Batch payment date: November 28, 2024\n• Expected wire transfer amount: $165,000\n• Will send remittance advice same day',
        agent: 'Grace Blue', outcome: 'Payment processing in next batch',
      },
      {
        date: '2024-11-18', type: 'email',
        subject: 'Invoice Copies and Payment Request',
        notes: 'Dear Global Retail Corp Team,\n\nAs requested during our recent conversation, please find attached copies of all outstanding invoices.\n\nTotal Outstanding: $165,000\n\nAll invoices are now past their payment terms, and we would appreciate your prompt attention to process payment.\n\nPlease send remittance advice to ar@company.com when payment is processed.\n\nThank you for your continued partnership.\n\nBest regards,\nHannah Yellow\nAccounts Receivable Team',
        agent: 'Hannah Yellow', outcome: 'Acknowledged by customer',
      },
    ],
    'ABC Manufacturing Ltd': [
      {
        date: '2024-11-18', type: 'email',
        subject: 'Re: Dispute Resolution - Documentation Request',
        notes: 'Dear ABC Manufacturing Team,\n\nThank you for your email regarding the dispute on invoice INV-2024-067.\n\nTo proceed with the resolution, we require the following documentation:\n\n1. Detailed description of quality issues\n2. Photos of defective products\n3. Quality inspection report\n4. Proposed resolution (credit, replacement, or partial payment)\n\nOnce we receive this information, our Quality Assurance team will review and respond within 5 business days.\n\nRegarding the undisputed balance of $38,000, we request immediate payment as these invoices are unrelated to the disputed items.\n\nBest regards,\nIan Black\nDispute Resolution Team',
        agent: 'Ian Black', outcome: 'Awaiting documentation',
      },
      {
        date: '2024-11-10', type: 'call',
        subject: 'Phone Call - Quality Dispute Discussion',
        notes: 'Lengthy call with Robert Taylor, Operations Manager at ABC Manufacturing.\n\nDispute Details:\n• Customer claims batch of products failed quality inspection\n• Issues identified: dimensional tolerances out of spec\n• Requesting full credit of $82,000 or replacement\n\nOur Position:\n• Products met specifications per original order\n• Need to review technical specifications\n• Open to partial resolution\n\nNext Steps:\n• Customer to send quality reports by Nov 15\n• Schedule follow-up call after review',
        agent: 'Jack Red', outcome: 'Customer raising formal dispute',
      },
      {
        date: '2024-11-05', type: 'note',
        subject: 'Internal Note - Credit Hold Applied',
        notes: 'Account Status Update: CREDIT HOLD APPLIED\n\nReason for Hold:\n• Outstanding balance: $120,000\n• Multiple invoices 45+ days overdue\n• Unresolved quality dispute\n\nImpact:\n• No new orders will be processed\n• All future orders require prepayment\n• Hold will remain until undisputed invoices paid and dispute resolved\n\nRisk Assessment: MEDIUM',
        agent: 'Kara Orange',
      },
    ],
  };

  return histories[customerName] || [
    {
      date: lastContact || '2024-11-20',
      type: 'email' as const,
      subject: 'Initial Payment Reminder',
      notes: 'Dear Valued Customer,\n\nThis is a friendly reminder that we have outstanding invoices that are now past their due date.\n\nPlease review your records and arrange for payment at your earliest convenience.\n\nIf you have any questions or concerns, please don\'t hesitate to contact us.\n\nBest regards,\nCollections Team',
      agent: 'Liam Purple',
      outcome: 'Pending response',
    },
  ];
}

export function CollectionsWorkbench() {
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSummary | null>(null);
  const [showAIAssist, setShowAIAssist] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGeography, setSelectedGeography] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'priority' | 'amount' | 'daysOverdue' | 'invoiceCount'>('priority');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showFilters, setShowFilters] = useState(false);

  const customerSummaries = useMemo(() => {
    const customerMap = new Map<string, CustomerSummary>();

    allInvoices
      .filter(inv => inv.status === 'Overdue')
      .forEach(inv => {
        const existing = customerMap.get(inv.customer);

        if (existing) {
          existing.totalAmount += inv.amount;
          existing.overdueAmount += inv.amount;
          existing.invoiceCount += 1;
          existing.maxDaysOverdue = Math.max(existing.maxDaysOverdue, inv.daysOverdue || 0);
          existing.invoices.push({
            id: inv.id,
            amount: inv.amount,
            dueDate: inv.dueDate,
            daysOverdue: inv.daysOverdue || 0,
            aging: inv.aging,
          });
        } else {
          const history = generateCommunicationHistory(inv.customer, inv.lastContact);

          let promiseToPay: { date: string; amount: number } | undefined = undefined;
          if (['Mega Corp Industries', 'Premium Distributors', 'Global Retail Corp', 'Summit Corporation'].includes(inv.customer)) {
            promiseToPay = { date: '2024-11-30', amount: inv.amount * 0.9 };
          }

          customerMap.set(inv.customer, {
            customerName: inv.customer,
            geography: inv.geography,
            totalAmount: inv.amount,
            overdueAmount: inv.amount,
            invoiceCount: 1,
            maxDaysOverdue: inv.daysOverdue || 0,
            status: (inv.daysOverdue || 0) > 60 ? 'critical' : (inv.daysOverdue || 0) > 0 ? 'overdue' : 'current',
            priority: 0,
            lastContact: inv.lastContact || 'No contact',
            riskScore: 50,
            promiseToPay,
            invoices: [{
              id: inv.id,
              amount: inv.amount,
              dueDate: inv.dueDate,
              daysOverdue: inv.daysOverdue || 0,
              aging: inv.aging,
            }],
            communicationHistory: history,
          });
        }
      });

    const summaries = Array.from(customerMap.values());
    summaries.forEach(s => {
      s.priority = Math.round((s.overdueAmount / 1000) * Math.sqrt(s.maxDaysOverdue));
    });
    summaries.sort((a, b) => b.priority - a.priority);
    summaries.forEach((s, i) => { s.priority = i + 1; });

    return summaries;
  }, []);

  const filteredCustomers = useMemo(() => {
    return customerSummaries.filter(c => {
      const matchesSearch = c.customerName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesGeo = selectedGeography === 'all' || c.geography === selectedGeography;
      const matchesStatus = selectedStatus === 'all' || c.status === selectedStatus;
      return matchesSearch && matchesGeo && matchesStatus;
    }).sort((a, b) => {
      if (sortBy === 'priority') return sortOrder === 'asc' ? a.priority - b.priority : b.priority - a.priority;
      if (sortBy === 'amount') return sortOrder === 'asc' ? a.overdueAmount - b.overdueAmount : b.overdueAmount - a.overdueAmount;
      if (sortBy === 'daysOverdue') return sortOrder === 'asc' ? a.maxDaysOverdue - b.maxDaysOverdue : b.maxDaysOverdue - a.maxDaysOverdue;
      if (sortBy === 'invoiceCount') return sortOrder === 'asc' ? a.invoiceCount - b.invoiceCount : b.invoiceCount - a.invoiceCount;
      return 0;
    });
  }, [customerSummaries, searchTerm, selectedGeography, selectedStatus, sortBy, sortOrder]);

  const geographies = useMemo(() => {
    const geos = new Set(customerSummaries.map(c => c.geography));
    return ['all', ...Array.from(geos).sort()];
  }, [customerSummaries]);

  const totalOverdue = customerSummaries.reduce((sum, c) => sum + c.overdueAmount, 0);
  const promisesDueThisWeek = customerSummaries
    .filter(c => c.promiseToPay && new Date(c.promiseToPay.date) <= new Date('2024-11-30'))
    .reduce((sum, c) => sum + (c.promiseToPay?.amount || 0), 0);
  const myTotalAR = allInvoices
    .filter(inv => inv.status === 'Overdue' || inv.status === 'Paid')
    .reduce((sum, inv) => sum + inv.amount, 0);

  const aiSuggestion = selectedCustomer ? {
    action: 'Send Firm Reminder',
    reasoning: `Customer ${selectedCustomer.customerName} has ${selectedCustomer.invoiceCount} overdue invoices with a total of $${selectedCustomer.overdueAmount.toLocaleString()}. High priority based on amount and age.`,
    emailDraft: `Subject: Payment Reminder - ${selectedCustomer.customerName} - ${selectedCustomer.invoiceCount} Invoices Overdue

Dear ${selectedCustomer.customerName} Team,

I hope this message finds you well. I'm reaching out regarding the outstanding payments for the following invoices:

${selectedCustomer.invoices.map(inv => `- Invoice Number: ${inv.id}, Amount Due: $${inv.amount.toLocaleString()}, Due Date: ${inv.dueDate}, Days Overdue: ${inv.daysOverdue}`).join('\n')}

We would appreciate your prompt attention to this matter. Please let us know if there are any issues preventing payment, or provide an expected payment date.

You can reply to this email or contact me directly to discuss.

Best regards,
Collections Team`,
    confidence: 95,
  } : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-slate-900">Collections Workbench</h2>
          <p className="text-sm text-slate-500 mt-1">AI-prioritized worklist for maximum efficiency</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-4 border border-slate-200">
          <p className="text-sm text-slate-600">My Total AR</p>
          <p className="text-slate-900 mt-1">${(myTotalAR / 1000).toFixed(0)}K</p>
        </div>
        <div className="bg-white rounded-lg p-4 border border-slate-200">
          <p className="text-sm text-slate-600">Past Due</p>
          <p className="text-red-600 mt-1">${(totalOverdue / 1000).toFixed(0)}K</p>
        </div>
        <div className="bg-white rounded-lg p-4 border border-slate-200">
          <p className="text-sm text-slate-600">Promises Due This Week</p>
          <p className="text-amber-600 mt-1">${(promisesDueThisWeek / 1000).toFixed(0)}K</p>
        </div>
        <div className="bg-white rounded-lg p-4 border border-slate-200">
          <p className="text-sm text-slate-600">Actions Today</p>
          <p className="text-blue-600 mt-1">{filteredCustomers.length} pending</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Worklist */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="p-4 border-b border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-slate-900">Prioritized Worklist</h3>
                <p className="text-xs text-slate-500 mt-1">Sorted by AI priority score</p>
              </div>
              <button
                className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-sm"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="w-4 h-4" />
                <span>Filters</span>
              </button>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search customers..."
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="divide-y divide-slate-200 max-h-[600px] overflow-y-auto">
            {filteredCustomers.map((customer) => (
              <div
                key={customer.customerName}
                onClick={() => setSelectedCustomer(customer)}
                className={`p-4 cursor-pointer hover:bg-slate-50 transition-colors ${
                  selectedCustomer?.customerName === customer.customerName ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-slate-900">{customer.customerName}</p>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        customer.status === 'critical' ? 'bg-red-100 text-red-700' :
                        customer.status === 'overdue' ? 'bg-amber-100 text-amber-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {customer.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm text-slate-600">
                      <span>{customer.invoiceCount} invoices</span>
                      <span>${customer.overdueAmount.toLocaleString()}</span>
                      <span className="text-red-600">{customer.maxDaysOverdue}d overdue</span>
                    </div>
                    {customer.promiseToPay && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-blue-600">
                        <Clock className="w-3 h-3" />
                        <span>Promise: ${customer.promiseToPay.amount.toLocaleString()} by {customer.promiseToPay.date}</span>
                      </div>
                    )}
                    {customer.communicationHistory.length > 0 && (
                      <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                        <div className="flex items-center gap-1">
                          <Mail className="w-3 h-3 text-blue-600" />
                          <span>{customer.communicationHistory.filter(c => c.type === 'email').length}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-green-600" />
                          <span>{customer.communicationHistory.filter(c => c.type === 'call').length}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <FileText className="w-3 h-3 text-slate-600" />
                          <span>{customer.communicationHistory.filter(c => c.type === 'note').length}</span>
                        </div>
                        <span className="text-slate-400">•</span>
                        <span>Last: {customer.communicationHistory[0]?.date}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs text-blue-700">
                      #{customer.priority}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Detail Panel */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-fit max-h-[calc(100vh-250px)] overflow-y-auto">
          {selectedCustomer ? (
            <div className="flex flex-col h-full">
              <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-purple-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-slate-900 mb-1">{selectedCustomer.customerName}</h3>
                    <div className="flex items-center gap-3 text-sm text-slate-600">
                      <span className="flex items-center gap-1">
                        <div className={`w-2 h-2 rounded-full ${
                          selectedCustomer.status === 'critical' ? 'bg-red-500' :
                          selectedCustomer.status === 'overdue' ? 'bg-amber-500' :
                          'bg-green-500'
                        }`} />
                        {selectedCustomer.status.charAt(0).toUpperCase() + selectedCustomer.status.slice(1)}
                      </span>
                      <span>•</span>
                      <span>Priority #{selectedCustomer.priority}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 grid grid-cols-2 gap-4 border-b border-slate-200">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Total Amount Due</p>
                  <p className="text-slate-900">${selectedCustomer.overdueAmount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Invoice Count</p>
                  <p className="text-slate-900">{selectedCustomer.invoiceCount} invoices</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Days Overdue</p>
                  <p className="text-red-600">{selectedCustomer.maxDaysOverdue} days</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Risk Score</p>
                  <p className={`${selectedCustomer.riskScore > 70 ? 'text-red-600' : selectedCustomer.riskScore > 40 ? 'text-amber-600' : 'text-green-600'}`}>
                    {selectedCustomer.riskScore}/100
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Geography</p>
                  <p className="text-slate-900">{selectedCustomer.geography}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Payment Terms</p>
                  <p className="text-slate-900">Net 30</p>
                </div>
              </div>

              {selectedCustomer.promiseToPay && (
                <div className="mx-6 mt-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                  <div className="flex items-start gap-3">
                    <Clock className="w-5 h-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="text-sm text-blue-900">Active Promise to Pay</p>
                      <p className="text-slate-700 mt-1">
                        ${selectedCustomer.promiseToPay.amount.toLocaleString()} by {selectedCustomer.promiseToPay.date}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="p-6 border-b border-slate-200">
                <p className="text-xs text-slate-500 mb-3">Quick Actions</p>
                <div className="grid grid-cols-2 gap-2">
                  <button className="flex items-center justify-center gap-2 px-3 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                    <Mail className="w-4 h-4 text-blue-600" />
                    <span className="text-sm">Email</span>
                  </button>
                  <button className="flex items-center justify-center gap-2 px-3 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                    <Phone className="w-4 h-4 text-green-600" />
                    <span className="text-sm">Call</span>
                  </button>
                </div>
                <button
                  onClick={() => setShowAIAssist(true)}
                  className="w-full mt-2 flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all"
                >
                  <Sparkles className="w-4 h-4" />
                  <span className="text-sm">AI Assist</span>
                </button>
              </div>

              <div className="p-6 flex-1 overflow-y-auto">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="w-4 h-4 text-slate-600" />
                  <h4 className="text-slate-900">Communication History</h4>
                  <span className="text-xs text-slate-500">({selectedCustomer.communicationHistory.length})</span>
                </div>
                <div className="space-y-3">
                  {selectedCustomer.communicationHistory.length > 0 ? (
                    selectedCustomer.communicationHistory.map((comm, idx) => {
                      const Icon = comm.type === 'email' ? Mail : comm.type === 'call' ? Phone : FileText;
                      const iconColor = comm.type === 'email' ? 'text-blue-600 bg-blue-100' : comm.type === 'call' ? 'text-green-600 bg-green-100' : 'text-slate-600 bg-slate-100';
                      const borderColor = comm.type === 'email' ? 'border-blue-200' : comm.type === 'call' ? 'border-green-200' : 'border-slate-200';
                      return (
                        <div key={idx} className={`p-4 rounded-lg border ${borderColor} bg-white hover:shadow-sm transition-shadow`}>
                          <div className="flex items-start gap-3">
                            <div className={`w-8 h-8 rounded-full ${iconColor} flex items-center justify-center flex-shrink-0`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <p className="text-sm text-slate-900 line-clamp-1">{comm.subject}</p>
                                <span className="text-xs text-slate-500 flex-shrink-0">{comm.date}</span>
                              </div>
                              <p className="text-xs text-slate-600 whitespace-pre-wrap mb-3 leading-relaxed">{comm.notes}</p>
                              <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs">
                                <span className="text-slate-500"><span className="text-slate-400">By:</span> {comm.agent}</span>
                                {comm.outcome && (
                                  <>
                                    <span className="text-slate-300">•</span>
                                    <span className={`px-2 py-0.5 rounded ${
                                      comm.outcome.includes('promised') || comm.outcome.includes('scheduled') || comm.outcome.includes('Agreed') || comm.outcome.includes('processing') || comm.outcome.includes('Acknowledged')
                                        ? 'bg-green-100 text-green-700'
                                        : comm.outcome.includes('No response') || comm.outcome.includes('No callback')
                                        ? 'bg-red-100 text-red-700'
                                        : 'bg-amber-100 text-amber-700'
                                    }`}>
                                      {comm.outcome}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-8">
                      <FileText className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm text-slate-500">No communication history</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-slate-900 mb-1">No Customer Selected</p>
              <p className="text-sm text-slate-500">Select a customer from the worklist to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* AI Assistant Modal */}
      {showAIAssist && aiSuggestion && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-slate-900">AI Assistant</h3>
                    <p className="text-xs text-slate-500">Powered by intelligent collections engine</p>
                  </div>
                </div>
                <button onClick={() => setShowAIAssist(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-slate-600">Recommended Action</p>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-xs text-slate-500">{aiSuggestion.confidence}% confidence</span>
                  </div>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-blue-900">{aiSuggestion.action}</p>
                  <p className="text-sm text-blue-700 mt-2">{aiSuggestion.reasoning}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-slate-600 mb-2">AI-Generated Email Draft</p>
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <pre className="text-sm text-slate-700 whitespace-pre-wrap">{aiSuggestion.emailDraft}</pre>
                </div>
              </div>
              <div className="flex items-center gap-3 pt-4">
                <button className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Accept & Send</button>
                <button className="flex-1 px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">Edit Draft</button>
                <button onClick={() => setShowAIAssist(false)} className="px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">Dismiss</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters Modal */}
      {showFilters && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center">
                    <Filter className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-slate-900">Filters</h3>
                    <p className="text-xs text-slate-500">Refine your worklist</p>
                  </div>
                </div>
                <button onClick={() => setShowFilters(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <p className="text-sm text-slate-600 mb-2">Geography</p>
                <select
                  value={selectedGeography}
                  onChange={(e) => setSelectedGeography(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {geographies.map(geo => (
                    <option key={geo} value={geo}>{geo === 'all' ? 'All Geographies' : geo}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-sm text-slate-600 mb-2">Status</p>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="current">Current</option>
                  <option value="overdue">Overdue</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <p className="text-sm text-slate-600 mb-2">Sort By</p>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'priority' | 'amount' | 'daysOverdue' | 'invoiceCount')}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="priority">Priority</option>
                  <option value="amount">Amount Due</option>
                  <option value="daysOverdue">Days Overdue</option>
                  <option value="invoiceCount">Invoice Count</option>
                </select>
              </div>
              <div>
                <p className="text-sm text-slate-600 mb-2">Sort Order</p>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </div>
              <div className="flex items-center gap-3 pt-4">
                <button onClick={() => setShowFilters(false)} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Apply Filters</button>
                <button onClick={() => setShowFilters(false)} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
