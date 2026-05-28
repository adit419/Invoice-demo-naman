import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  Drawer,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Tabs,
  Tab,
} from '@mui/material';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Close as CloseIcon,
  CheckCircle as MatchedIcon,
  CompareArrows as CompareIcon,
  Receipt as BankIcon,
  ShoppingCart as OrderIcon,
  Lightbulb as ExplainIcon,
  Payment as GatewayIcon,
} from '@mui/icons-material';
import { DataGrid } from '@mui/x-data-grid';
import axios from 'axios';
import ThreeWayComparison from './ThreeWayComparison';

interface Props {
  selectedClient: { id: string; name: string } | null;
}

function CashMatchingResults({ selectedClient }: Props) {
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [matchTypeFilter, setMatchTypeFilter] = useState('all');
  const [reconStatusFilter, setReconStatusFilter] = useState('all');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [transactionDetails, setTransactionDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailTab, setDetailTab] = useState(0);

  useEffect(() => {
    if (selectedClient) {
      fetchMatches();
    }
  }, [selectedClient]);

  const fetchMatches = async () => {
    if (!selectedClient) return;
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`/cash-api/matches/${selectedClient.id}`);
      setMatches(response.data);
    } catch (err) {
      console.error('Error fetching matches:', err);
      setError('Failed to load matching results');
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactionDetails = async (transactionId: string) => {
    if (!selectedClient) return;
    setLoadingDetails(true);
    try {
      const response = await axios.get(
        `/cash-api/transaction/${selectedClient.id}/${transactionId}/details`
      );
      setTransactionDetails(response.data);
    } catch (err) {
      console.error('Error fetching details:', err);
      setTransactionDetails(null);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleRowClick = (params: any) => {
    setSelectedTransaction(params.row);
    setDrawerOpen(true);
    setDetailTab(0);
    fetchTransactionDetails(params.row.transaction_id);
  };

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    setSelectedTransaction(null);
    setTransactionDetails(null);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getMatchTypeChip = (type: string) => {
    const configs: Record<string, { label: string; color: any }> = {
      order_id: { label: 'Order ID', color: 'success' },
      fuzzy: { label: 'Fuzzy', color: 'primary' },
      manual: { label: 'Manual', color: 'secondary' },
      gateway: { label: 'Gateway', color: 'info' },
    };
    const config = configs[type] || { label: type, color: 'default' };
    return <Chip label={config.label} color={config.color} size="small" />;
  };

  const getReconStatusChip = (status: string) => {
    const configs: Record<string, { label: string; color: any }> = {
      full_match: { label: 'Full 3-Way', color: 'success' },
      bank_pg_only: { label: 'Bank+Gateway', color: 'warning' },
      pg_order_only: { label: 'Gateway+Order', color: 'info' },
      bank_order_only: { label: 'Bank+Order', color: 'primary' },
      unmatched: { label: 'Unmatched', color: 'error' },
    };
    const config = configs[status] || { label: status || '-', color: 'default' };
    return <Chip label={config.label} color={config.color} size="small" variant="outlined" />;
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'success.main';
    if (confidence >= 0.7) return 'warning.main';
    return 'error.main';
  };

  const columns = [
    {
      field: 'transaction_id',
      headerName: 'Transaction ID',
      width: 180,
      renderCell: (params: any) => (
        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
          {params.value?.substring(0, 16)}...
        </Typography>
      ),
    },
    {
      field: 'transaction_date',
      headerName: 'Date',
      width: 110,
      renderCell: (params: any) => (
        <Typography variant="body2">
          {params.value ? new Date(params.value).toLocaleDateString('id-ID') : '-'}
        </Typography>
      ),
    },
    {
      field: 'name',
      headerName: 'Payer Name',
      width: 180,
      renderCell: (params: any) => (
        <Tooltip title={params.value || ''}>
          <Typography variant="body2" noWrap>
            {params.value || '-'}
          </Typography>
        </Tooltip>
      ),
    },
    {
      field: 'amount',
      headerName: 'Amount',
      width: 140,
      renderCell: (params: any) => (
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {formatCurrency(params.value || 0)}
        </Typography>
      ),
    },
    {
      field: 'reconciliation_status',
      headerName: 'Recon Status',
      width: 130,
      renderCell: (params: any) => getReconStatusChip(params.value),
    },
    {
      field: 'gateway_txn_id',
      headerName: 'Gateway ID',
      width: 150,
      renderCell: (params: any) => (
        <Typography
          variant="body2"
          sx={{ fontFamily: 'monospace', fontSize: '0.7rem', color: 'info.main' }}
        >
          {params.value ? params.value.substring(0, 14) + '...' : '-'}
        </Typography>
      ),
    },
    {
      field: 'matched_order_id',
      headerName: 'Order ID',
      width: 160,
      renderCell: (params: any) => (
        <Typography
          variant="body2"
          sx={{ fontFamily: 'monospace', fontSize: '0.7rem', color: 'primary.main' }}
        >
          {params.value || '-'}
        </Typography>
      ),
    },
    {
      field: 'matched_store_name',
      headerName: 'Store',
      width: 150,
      renderCell: (params: any) => (
        <Tooltip title={params.value || ''}>
          <Typography variant="body2" noWrap>
            {params.value || '-'}
          </Typography>
        </Tooltip>
      ),
    },
    {
      field: 'confidence',
      headerName: 'Conf.',
      width: 80,
      renderCell: (params: any) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: getConfidenceColor(params.value),
            }}
          />
          <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
            {Math.round((params.value || 0) * 100)}%
          </Typography>
        </Box>
      ),
    },
    {
      field: 'amount_variance',
      headerName: 'Variance',
      width: 100,
      renderCell: (params: any) => (
        <Typography
          variant="body2"
          sx={{
            fontSize: '0.75rem',
            color: params.value > 0 ? 'warning.main' : 'text.secondary',
          }}
        >
          {params.value > 0 ? formatCurrency(params.value) : '-'}
        </Typography>
      ),
    },
  ];

  const filteredMatches = matches.filter(match => {
    const matchesSearch =
      !searchTerm ||
      match.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      match.transaction_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      match.matched_order_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      match.matched_store_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      match.gateway_txn_id?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = matchTypeFilter === 'all' || match.match_type === matchTypeFilter;

    const matchesReconStatus =
      reconStatusFilter === 'all' || match.reconciliation_status === reconStatusFilter;

    return matchesSearch && matchesType && matchesReconStatus;
  });

  const renderRawDataTable = (data: any) => {
    if (!data) return <Typography color="text.secondary">No data available</Typography>;

    const entries = Object.entries(data).filter(
      ([key, value]) => value && value !== '' && !key.startsWith('_')
    );

    return (
      <Table size="small">
        <TableBody>
          {entries.map(([key, value]) => (
            <TableRow key={key} sx={{ '&:last-child td': { borderBottom: 0 } }}>
              <TableCell
                sx={{
                  fontWeight: 500,
                  color: 'text.secondary',
                  width: '40%',
                  fontSize: '0.8rem',
                  py: 1,
                }}
              >
                {key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim()}
              </TableCell>
              <TableCell sx={{ fontSize: '0.8rem', py: 1, wordBreak: 'break-word' }}>
                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {filteredMatches.length.toLocaleString()} matched transactions - Click a row to see
          details
        </Typography>
        <IconButton onClick={fetchMatches} size="small">
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ py: 2 }}>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              placeholder="Search transactions..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              sx={{ minWidth: 300 }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Match Type</InputLabel>
              <Select
                value={matchTypeFilter}
                label="Match Type"
                onChange={e => setMatchTypeFilter(e.target.value)}
              >
                <MenuItem value="all">All Types</MenuItem>
                <MenuItem value="order_id">Order ID</MenuItem>
                <MenuItem value="gateway">Gateway</MenuItem>
                <MenuItem value="fuzzy">Fuzzy</MenuItem>
                <MenuItem value="manual">Manual</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Recon Status</InputLabel>
              <Select
                value={reconStatusFilter}
                label="Recon Status"
                onChange={e => setReconStatusFilter(e.target.value)}
              >
                <MenuItem value="all">All Statuses</MenuItem>
                <MenuItem value="full_match">Full 3-Way</MenuItem>
                <MenuItem value="bank_pg_only">Bank + Gateway</MenuItem>
                <MenuItem value="pg_order_only">Gateway + Order</MenuItem>
                <MenuItem value="bank_order_only">Bank + Order</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardContent sx={{ p: 0 }}>
          <DataGrid
            rows={filteredMatches}
            columns={columns}
            getRowId={row => row.transaction_id}
            onRowClick={handleRowClick}
            rowHeight={52}
            initialState={{
              pagination: {
                paginationModel: { pageSize: 25 },
              },
            }}
            pageSizeOptions={[10, 25, 50, 100]}
            disableRowSelectionOnClick
            autoHeight
            sx={{
              border: 'none',
              cursor: 'pointer',
              '& .MuiDataGrid-columnHeaders': {
                backgroundColor: '#F8FAFC',
                borderBottom: '1px solid',
                borderColor: 'divider',
              },
              '& .MuiDataGrid-cell': {
                borderBottom: '1px solid',
                alignItems: 'center',
                display: 'flex',
                borderColor: 'divider',
              },
              '& .MuiDataGrid-row:hover': {
                backgroundColor: '#E3F2FD',
              },
            }}
          />
        </CardContent>
      </Card>

      {/* Detail Drawer */}
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={handleCloseDrawer}
        slotProps={{
          paper: { sx: { width: { xs: '100%', sm: 700, md: 800 }, p: 0 } },
        }}
      >
        {/* Drawer Header */}
        <Box
          sx={{
            p: 2,
            backgroundColor: 'primary.main',
            color: 'white',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <MatchedIcon />
            <Typography variant="h6">Match Details</Typography>
          </Box>
          <IconButton onClick={handleCloseDrawer} sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </Box>

        {loadingDetails ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : transactionDetails ? (
          <Box sx={{ height: 'calc(100vh - 64px)', overflow: 'auto' }}>
            {/* Match Explanation */}
            <Box
              sx={{
                p: 2,
                backgroundColor: '#E8F5E9',
                borderBottom: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                <ExplainIcon sx={{ color: 'success.main', mt: 0.5 }} />
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'success.dark' }}>
                    Why did this match?
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'success.dark', mt: 0.5 }}>
                    {transactionDetails.match_explanation}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                    {getMatchTypeChip(transactionDetails.match_type)}
                    <Chip
                      label={`${Math.round(transactionDetails.confidence * 100)}% confidence`}
                      size="small"
                      variant="outlined"
                      color="success"
                    />
                  </Box>
                </Box>
              </Box>
            </Box>

            {/* Tabs */}
            <Tabs
              value={detailTab}
              onChange={(_e, v) => setDetailTab(v)}
              sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
            >
              <Tab icon={<CompareIcon />} label="3-Way View" iconPosition="start" />
              <Tab icon={<BankIcon />} label="Bank" iconPosition="start" />
              <Tab icon={<GatewayIcon />} label="Gateway" iconPosition="start" />
              <Tab icon={<OrderIcon />} label="Order" iconPosition="start" />
            </Tabs>

            {/* Tab Content */}
            <Box sx={{ p: 2 }}>
              {/* 3-Way Comparison View */}
              {detailTab === 0 && (
                <ThreeWayComparison
                  transaction={selectedTransaction}
                  bankData={transactionDetails.bank_statement_raw}
                  gatewayData={transactionDetails.gateway_raw}
                  orderData={transactionDetails.order_raw}
                  reconciliationStatus={
                    transactionDetails.reconciliation_status ||
                    selectedTransaction?.reconciliation_status
                  }
                />
              )}

              {/* Bank Raw Data */}
              {detailTab === 1 && (
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                      Raw Bank Statement Data
                    </Typography>
                    {renderRawDataTable(transactionDetails.bank_statement_raw)}
                  </CardContent>
                </Card>
              )}

              {/* Gateway Raw Data */}
              {detailTab === 2 && (
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                      Raw Payment Gateway Data
                    </Typography>
                    {transactionDetails.gateway_raw ? (
                      renderRawDataTable(transactionDetails.gateway_raw)
                    ) : (
                      <Typography color="text.secondary">No gateway data available</Typography>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Order Raw Data */}
              {detailTab === 3 && (
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                      Raw Order Data
                    </Typography>
                    {transactionDetails.order_raw?.raw_fields ? (
                      renderRawDataTable(transactionDetails.order_raw.raw_fields)
                    ) : (
                      <Typography color="text.secondary">No order data available</Typography>
                    )}
                  </CardContent>
                </Card>
              )}
            </Box>
          </Box>
        ) : (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">Failed to load details</Typography>
          </Box>
        )}
      </Drawer>
    </Box>
  );
}

export default CashMatchingResults;
