import React from 'react';
import { Box, Paper, Typography, Chip, Divider } from '@mui/material';
import {
  AccountBalance as BankIcon,
  Payment as GatewayIcon,
  ShoppingCart as OrderIcon,
  CheckCircle as MatchedIcon,
  Cancel as MissingIcon,
} from '@mui/icons-material';

const RECON_STATUS_LABELS: Record<string, string> = {
  full_match: 'Full 3-Way Match',
  bank_pg_only: 'Bank + Gateway Only',
  pg_order_only: 'Gateway + Order Only',
  bank_order_only: 'Bank + Order Only',
  unmatched: 'Unmatched',
};

const RECON_STATUS_COLORS: Record<string, 'success' | 'warning' | 'info' | 'primary' | 'error' | 'default'> = {
  full_match: 'success',
  bank_pg_only: 'warning',
  pg_order_only: 'info',
  bank_order_only: 'primary',
  unmatched: 'error',
};

function formatCurrency(amount: number | null | undefined) {
  if (!amount && amount !== 0) return '-';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

function DataRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>{label}</Typography>
      <Typography variant="caption" sx={{ fontWeight: highlight ? 600 : 400, color: highlight ? 'primary.main' : 'inherit' }}>
        {value || '-'}
      </Typography>
    </Box>
  );
}

function SourcePanel({ title, icon, data, isMatched, color }: {
  title: string; icon: React.ReactNode; data: Record<string, string> | null;
  isMatched: boolean; color: string;
}) {
  return (
    <Paper elevation={0} sx={{
      p: 2, flex: 1,
      backgroundColor: isMatched ? `${color}.50` : 'grey.100',
      border: '1px solid',
      borderColor: isMatched ? `${color}.200` : 'grey.300',
      borderRadius: 2,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        {icon}
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{title}</Typography>
        {isMatched
          ? <MatchedIcon sx={{ fontSize: 16, color: `${color}.main`, ml: 'auto' }} />
          : <MissingIcon sx={{ fontSize: 16, color: 'grey.400', ml: 'auto' }} />}
      </Box>
      <Divider sx={{ mb: 1.5 }} />
      {data
        ? <Box>{Object.entries(data).map(([k, v]) => <DataRow key={k} label={k} value={v} />)}</Box>
        : <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>No data available</Typography>
      }
    </Paper>
  );
}

interface ThreeWayProps {
  transaction: Record<string, unknown>;
  bankData?: Record<string, unknown> | null;
  gatewayData?: Record<string, unknown> | null;
  orderData?: Record<string, unknown> | null;
  reconciliationStatus?: string;
}

function ThreeWayComparison({ transaction, bankData, gatewayData, orderData, reconciliationStatus }: ThreeWayProps) {
  const status = reconciliationStatus || (transaction?.reconciliation_status as string) || 'unmatched';
  const hasBankMatch    = ['full_match', 'bank_pg_only', 'bank_order_only'].includes(status);
  const hasGatewayMatch = ['full_match', 'bank_pg_only', 'pg_order_only'].includes(status);
  const hasOrderMatch   = ['full_match', 'pg_order_only', 'bank_order_only'].includes(status);

  const bankDisplay = bankData || transaction ? {
    'Transaction ID': (bankData?.['Transaction ID'] as string) || (transaction?.transaction_id as string) || '-',
    'Amount': formatCurrency((bankData?.Amount as number) || (transaction?.bank_amount as number) || (transaction?.amount as number)),
    'Payer': (bankData?.Name as string) || (transaction?.bank_name as string) || (transaction?.name as string) || '-',
    'Date': (bankData?.date as string) || (transaction?.bank_date as string) || (transaction?.transaction_date as string) || '-',
    'Reference': (bankData?.Reference as string) || (transaction?.bank_reference as string) || '-',
    'Channel': (bankData?.['Payment Channel'] as string) || (transaction?.payment_channel as string) || '-',
  } : null;

  const gatewayDisplay = gatewayData || transaction?.gateway_txn_id ? {
    'Gateway TXN ID': (gatewayData?.gateway_txn_id as string) || (transaction?.gateway_txn_id as string) || '-',
    'Gateway': (gatewayData?.gateway_name as string) || (transaction?.gateway_name as string) || '-',
    'Gross Amount': formatCurrency((gatewayData?.gross_amount as number) || (transaction?.gateway_amount as number)),
    'Fee': formatCurrency((gatewayData?.fee_amount as number) || (transaction?.gateway_fee as number)),
    'Net Amount': formatCurrency((gatewayData?.net_amount as number) || ((transaction?.gateway_amount as number) - ((transaction?.gateway_fee as number) || 0))),
    'Status': (gatewayData?.status as string) || '-',
  } : null;

  const orderDisplay = orderData || transaction?.order_id ? {
    'Order ID': (orderData?.order_id as string) || (transaction?.order_id as string) || '-',
    'Store': (orderData?.store_name as string) || (transaction?.order_store_name as string) || (transaction?.matched_store_name as string) || '-',
    'Amount': formatCurrency((orderData?.total_amount as number) || (transaction?.order_amount as number) || (transaction?.matched_amount as number)),
    'Date': (orderData?.order_date as string) || (transaction?.order_date as string) || '-',
    'City': (orderData?.city as string) || '-',
    'Status': (orderData?.order_status as string) || '-',
  } : null;

  const bankAmount  = (bankData?.Amount as number) || (transaction?.bank_amount as number) || (transaction?.amount as number) || 0;
  const orderAmount = (orderData?.total_amount as number) || (transaction?.order_amount as number) || (transaction?.matched_amount as number) || 0;
  const variance    = (transaction?.amount_variance as number) || Math.abs(bankAmount - orderAmount);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Chip label={RECON_STATUS_LABELS[status] || status} color={RECON_STATUS_COLORS[status] || 'default'} size="small" />
        {variance > 0 && (
          <Typography variant="caption" sx={{ color: 'warning.main' }}>Variance: {formatCurrency(variance)}</Typography>
        )}
      </Box>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: { xs: 'wrap', md: 'nowrap' } }}>
        <SourcePanel title="Bank Statement"  icon={<BankIcon    sx={{ fontSize: 20, color: hasBankMatch    ? 'success.main' : 'grey.400' }} />} data={bankDisplay}    isMatched={hasBankMatch}    color="success" />
        <SourcePanel title="Payment Gateway" icon={<GatewayIcon sx={{ fontSize: 20, color: hasGatewayMatch ? 'info.main'    : 'grey.400' }} />} data={gatewayDisplay} isMatched={hasGatewayMatch} color="info"    />
        <SourcePanel title="Revenue Order"   icon={<OrderIcon   sx={{ fontSize: 20, color: hasOrderMatch   ? 'primary.main' : 'grey.400' }} />} data={orderDisplay}   isMatched={hasOrderMatch}   color="primary" />
      </Box>
    </Box>
  );
}

export default ThreeWayComparison;
