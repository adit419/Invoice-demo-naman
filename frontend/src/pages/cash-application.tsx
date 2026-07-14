import { useState, useEffect } from 'react';
import { withAuthGuard } from '@/components/AuthGuard';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { cashApi } from '@/services/cashApi';
import dynamic from 'next/dynamic';

const CashDashboard = dynamic(() => import('@/components/cash/CashDashboard'), { ssr: false });
const CashMatchingResults = dynamic(() => import('@/components/cash/CashMatchingResults'), {
  ssr: false,
});
const CashExceptions = dynamic(() => import('@/components/cash/CashExceptions'), { ssr: false });

interface Client {
  id: string;
  name: string;
}

const muiTheme = createTheme();

type TabId = 'dashboard' | 'matching' | 'exceptions';

const TABS: { id: TabId; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'matching', label: 'Matching Results' },
  { id: 'exceptions', label: 'Exceptions' },
];

function CashApplicationPage() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [loadingClients, setLoadingClients] = useState(true);

  useEffect(() => {
    cashApi
      .get('/cash-api/clients')
      .then(r => {
        setClients(r.data);
        if (r.data.length > 0) setSelectedClient(r.data[0]);
      })
      .catch(() => {})
      .finally(() => setLoadingClients(false));
  }, []);

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <div style={{ minHeight: '100vh', background: '#F5F7FA', fontFamily: 'Inter, sans-serif' }}>
        {/* Header */}
        <div
          style={{
            padding: '12px 32px',
            borderBottom: '1px solid #E6E6E6',
            background: '#ffffff',
          }}
        >
          <p style={{ margin: 0, fontSize: 14, color: '#414651', fontWeight: 500 }}>
            Cash Application
          </p>
        </div>

        {/* Title + client selector + tabs */}
        <div style={{ padding: '20px 32px 0', background: '#ffffff' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              marginBottom: 16,
            }}
          >
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: 20,
                  fontWeight: 600,
                  color: '#101828',
                  letterSpacing: '-0.5px',
                }}
              >
                3-Way Reconciliation
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: 14, color: '#717680' }}>
                Bank Statement ↔ Payment Gateway ↔ Revenue Orders
              </p>
            </div>
            {/* Client selector */}
            {!loadingClients && clients.length > 0 && (
              <select
                value={selectedClient?.id ?? ''}
                onChange={e =>
                  setSelectedClient(clients.find(c => c.id === e.target.value) ?? null)
                }
                style={{
                  padding: '7px 12px',
                  border: '1px solid #D5D5D5',
                  borderRadius: 6,
                  fontSize: 13,
                  color: '#101828',
                  background: '#ffffff',
                  cursor: 'pointer',
                }}
              >
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid #E6E6E6' }}>
            {TABS.map(tab => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: '9px 16px',
                    fontSize: 14,
                    fontWeight: active ? 600 : 400,
                    color: active ? '#1876FF' : '#717680',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    borderBottom: active ? '2px solid #1876FF' : '2px solid transparent',
                    marginBottom: -1,
                    fontFamily: 'Inter, sans-serif',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '24px 32px' }}>
          {loadingClients ? (
            <div style={{ textAlign: 'center', padding: '80px 0', color: '#717680' }}>
              Loading…
            </div>
          ) : !selectedClient ? (
            <div style={{ textAlign: 'center', padding: '80px 0', color: '#717680' }}>
              <p style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>No clients available</p>
              <p style={{ fontSize: 14 }}>Make sure the Cash Application backend is running on port 8000.</p>
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <CashDashboard selectedClient={selectedClient} onNavigate={setActiveTab} />
              )}
              {activeTab === 'matching' && (
                <CashMatchingResults selectedClient={selectedClient} />
              )}
              {activeTab === 'exceptions' && (
                <CashExceptions selectedClient={selectedClient} />
              )}
            </>
          )}
        </div>
      </div>
    </ThemeProvider>
  );
}

export default withAuthGuard(CashApplicationPage);
