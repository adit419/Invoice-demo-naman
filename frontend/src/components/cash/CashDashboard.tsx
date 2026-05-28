import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
} from '@mui/material';
import {
  Receipt as ReceiptIcon,
  CheckCircle as MatchedIcon,
  Warning as ExceptionIcon,
  TrendingUp as RateIcon,
  PlayArrow as RunIcon,
  Visibility as ViewIcon,
  AccountBalance as BankIcon,
  Payment as GatewayIcon,
  ShoppingCart as OrderIcon,
  SwapHoriz as LinkIcon,
  CloudUpload as UploadIcon,
  Description as FileIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import axios from 'axios';
import StatsCard from './StatsCard';

interface Props {
  selectedClient: { id: string; name: string } | null;
  onNavigate: (tab: 'dashboard' | 'matching' | 'exceptions') => void;
}

const COLORS = {
  fullMatch: '#4CAF50',
  bankPgOnly: '#8BC34A',
  pgOrderOnly: '#03A9F4',
  bankOrderOnly: '#2196F3',
  unmatched: '#F44336',
};

function CashDashboard({ selectedClient, onNavigate }: Props) {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [runningMatch, setRunningMatch] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<{
    bankStatement: File | null;
    revenueOrders: File | null;
    paymentGateway: File | null;
  }>({
    bankStatement: null,
    revenueOrders: null,
    paymentGateway: null,
  });
  const bankStatementRef = useRef<HTMLInputElement>(null);
  const revenueOrdersRef = useRef<HTMLInputElement>(null);
  const paymentGatewayRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectedClient) {
      fetchDashboard();
    }
  }, [selectedClient]);

  const fetchDashboard = async () => {
    if (!selectedClient) return;
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`/cash-api/dashboard/${selectedClient.id}`);
      setStats(response.data);
    } catch (err) {
      console.error('Error fetching dashboard:', err);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const runMatching = async () => {
    if (!selectedClient) return;
    setRunningMatch(true);
    try {
      const response = await axios.post(`/cash-api/run-matching/${selectedClient.id}`);
      setStats({
        ...response.data.stats,
        total_amount: stats?.total_amount || 0,
        matched_amount: stats?.matched_amount || 0,
        unmatched_amount: stats?.unmatched_amount || 0,
      });
    } catch (err) {
      console.error('Error running matching:', err);
      setError('Failed to run matching');
    } finally {
      setRunningMatch(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handleFileChange = (type: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedFiles(prev => ({
        ...prev,
        [type]: file,
      }));
    }
  };

  const handleRemoveFile = (type: string) => () => {
    setUploadedFiles(prev => ({
      ...prev,
      [type]: null,
    }));
    const refs: Record<string, React.RefObject<HTMLInputElement | null>> = {
      bankStatement: bankStatementRef,
      revenueOrders: revenueOrdersRef,
      paymentGateway: paymentGatewayRef,
    };
    if (refs[type].current) {
      refs[type].current.value = '';
    }
  };

  const handleUploadSubmit = () => {
    console.log('Files ready for upload:', uploadedFiles);
    setUploadModalOpen(false);
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

  const pieData = stats
    ? [
        { name: 'Full 3-Way Match', value: stats.full_matches || 0, color: COLORS.fullMatch },
        { name: 'Bank + Gateway', value: stats.bank_pg_only || 0, color: COLORS.bankPgOnly },
        { name: 'Gateway + Order', value: stats.pg_order_only || 0, color: COLORS.pgOrderOnly },
        { name: 'Bank + Order', value: stats.bank_order_only || 0, color: COLORS.bankOrderOnly },
        { name: 'Unmatched', value: stats.unmatched || 0, color: COLORS.unmatched },
      ].filter(item => item.value > 0)
    : [];

  return (
    <Box>
      {/* Header Actions */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            3-Way Reconciliation: Bank Statement ↔ Payment Gateway ↔ Revenue Orders
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<UploadIcon />}
            onClick={() => setUploadModalOpen(true)}
          >
            Upload Documents
          </Button>
          <Button
            variant="outlined"
            startIcon={<ViewIcon />}
            onClick={() => onNavigate('exceptions')}
          >
            View Exceptions
          </Button>
          <Button
            variant="contained"
            startIcon={runningMatch ? <CircularProgress size={16} color="inherit" /> : <RunIcon />}
            onClick={runMatching}
            disabled={runningMatch}
          >
            {runningMatch ? 'Running...' : 'Run Matching'}
          </Button>
        </Box>
      </Box>

      {/* Stats Cards - Row 1 */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatsCard
            title="Total Transactions"
            value={stats?.total_transactions?.toLocaleString() || 0}
            subtitle={formatCurrency(stats?.total_amount || 0)}
            icon={<BankIcon />}
            color="primary"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatsCard
            title="Full 3-Way Match"
            value={stats?.full_matches?.toLocaleString() || 0}
            subtitle="Bank + Gateway + Order"
            icon={<MatchedIcon />}
            color="success"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatsCard
            title="Partial Matches"
            value={(
              (stats?.bank_pg_only || 0) +
              (stats?.pg_order_only || 0) +
              (stats?.bank_order_only || 0)
            ).toLocaleString()}
            subtitle="2-of-3 matched"
            icon={<LinkIcon />}
            color="warning"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatsCard
            title="Exceptions"
            value={stats?.unmatched?.toLocaleString() || 0}
            subtitle={formatCurrency(stats?.unmatched_amount || 0)}
            icon={<ExceptionIcon />}
            color="error"
          />
        </Grid>
      </Grid>

      {/* Stats Cards - Row 2 */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatsCard
            title="Gateway Transactions"
            value={stats?.total_gateway_transactions?.toLocaleString() || 0}
            subtitle="Payment gateway records"
            icon={<GatewayIcon />}
            color="info"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatsCard
            title="Total Matched"
            value={stats?.total_matched?.toLocaleString() || 0}
            subtitle={formatCurrency(stats?.matched_amount || 0)}
            icon={<MatchedIcon />}
            color="success"
            progress={stats?.match_rate || 0}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatsCard
            title="Amount Variance"
            value={formatCurrency(stats?.total_variance || 0)}
            subtitle="Total discrepancy"
            icon={<OrderIcon />}
            color="warning"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatsCard
            title="Match Rate"
            value={`${stats?.match_rate || 0}%`}
            subtitle="Overall accuracy"
            icon={<RateIcon />}
            color="primary"
          />
        </Grid>
      </Grid>

      {/* Charts and Details */}
      <Grid container spacing={3}>
        {/* Match Distribution Chart */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                3-Way Match Distribution
              </Typography>
              <Box sx={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: any, name: any) => [
                        typeof value === 'number' ? value.toLocaleString() : value,
                        name,
                      ]}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* 3-Way Reconciliation Breakdown */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
                3-Way Reconciliation Breakdown
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                {/* Full 3-Way Match */}
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          backgroundColor: COLORS.fullMatch,
                        }}
                      />
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        Full 3-Way Match (Bank → Gateway → Order)
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'success.main' }}>
                      {stats?.full_matches?.toLocaleString() || 0}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      height: 8,
                      backgroundColor: '#E8F5E9',
                      borderRadius: 4,
                      overflow: 'hidden',
                    }}
                  >
                    <Box
                      sx={{
                        height: '100%',
                        width: `${
                          stats?.total_transactions
                            ? ((stats?.full_matches || 0) / stats.total_transactions) * 100
                            : 0
                        }%`,
                        backgroundColor: COLORS.fullMatch,
                        borderRadius: 4,
                      }}
                    />
                  </Box>
                </Box>

                {/* Bank + Gateway Only */}
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          backgroundColor: COLORS.bankPgOnly,
                        }}
                      />
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        Bank + Gateway (Missing Order)
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {stats?.bank_pg_only?.toLocaleString() || 0}
                    </Typography>
                  </Box>
                </Box>

                {/* Gateway + Order Only */}
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          backgroundColor: COLORS.pgOrderOnly,
                        }}
                      />
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        Gateway + Order (Missing Bank)
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {stats?.pg_order_only?.toLocaleString() || 0}
                    </Typography>
                  </Box>
                </Box>

                {/* Bank + Order Only */}
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          backgroundColor: COLORS.bankOrderOnly,
                        }}
                      />
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        Bank + Order Direct (No Gateway)
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {stats?.bank_order_only?.toLocaleString() || 0}
                    </Typography>
                  </Box>
                </Box>

                {/* Unmatched */}
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          backgroundColor: COLORS.unmatched,
                        }}
                      />
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        Unmatched (Exceptions)
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'error.main' }}>
                      {stats?.unmatched?.toLocaleString() || 0}
                    </Typography>
                  </Box>
                </Box>
              </Box>

              <Box sx={{ mt: 4, pt: 3, borderTop: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    Overall Match Rate
                  </Typography>
                  <Chip
                    label={`${stats?.match_rate || 0}%`}
                    color={
                      stats?.match_rate >= 90
                        ? 'success'
                        : stats?.match_rate >= 70
                        ? 'warning'
                        : 'error'
                    }
                    size="small"
                  />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Quick Actions */}
        <Grid size={{ xs: 12 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                Quick Actions
              </Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Button
                    fullWidth
                    variant="outlined"
                    sx={{ py: 2, justifyContent: 'flex-start', gap: 1.5 }}
                    onClick={() => onNavigate('matching')}
                  >
                    <MatchedIcon color="success" />
                    <Box sx={{ textAlign: 'left' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        View All Matches
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        Review matched transactions
                      </Typography>
                    </Box>
                  </Button>
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Button
                    fullWidth
                    variant="outlined"
                    color="error"
                    sx={{ py: 2, justifyContent: 'flex-start', gap: 1.5 }}
                    onClick={() => onNavigate('exceptions')}
                  >
                    <ExceptionIcon />
                    <Box sx={{ textAlign: 'left' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        Resolve Exceptions
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {stats?.unmatched || 0} items need attention
                      </Typography>
                    </Box>
                  </Button>
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Button
                    fullWidth
                    variant="outlined"
                    sx={{ py: 2, justifyContent: 'flex-start', gap: 1.5 }}
                    onClick={runMatching}
                    disabled={runningMatch}
                  >
                    <RunIcon color="primary" />
                    <Box sx={{ textAlign: 'left' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        Re-run Matching
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        Process new transactions
                      </Typography>
                    </Box>
                  </Button>
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Button
                    fullWidth
                    variant="outlined"
                    sx={{ py: 2, justifyContent: 'flex-start', gap: 1.5 }}
                  >
                    <ReceiptIcon color="primary" />
                    <Box sx={{ textAlign: 'left' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        Export Report
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        Download reconciliation
                      </Typography>
                    </Box>
                  </Button>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Upload Documents Modal */}
      <Dialog
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <UploadIcon color="primary" />
          Upload Documents
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Bank Statement Section */}
            <Box>
              <Typography
                variant="subtitle2"
                sx={{
                  mb: 1,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <BankIcon fontSize="small" color="primary" />
                Bank Statement
              </Typography>
              <Box
                sx={{
                  border: '2px dashed',
                  borderColor: uploadedFiles.bankStatement ? 'success.main' : 'divider',
                  borderRadius: 2,
                  p: 2,
                  backgroundColor: uploadedFiles.bankStatement ? 'success.50' : 'grey.50',
                  transition: 'all 0.2s',
                }}
              >
                {uploadedFiles.bankStatement ? (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <FileIcon color="success" />
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {uploadedFiles.bankStatement.name}
                      </Typography>
                      <Chip
                        label={`${(uploadedFiles.bankStatement.size / 1024).toFixed(1)} KB`}
                        size="small"
                        variant="outlined"
                      />
                    </Box>
                    <IconButton
                      size="small"
                      onClick={handleRemoveFile('bankStatement')}
                      color="error"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ) : (
                  <Box sx={{ textAlign: 'center' }}>
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      ref={bankStatementRef}
                      onChange={handleFileChange('bankStatement')}
                      style={{ display: 'none' }}
                      id="bank-statement-upload"
                    />
                    <label htmlFor="bank-statement-upload">
                      <Button variant="outlined" component="span" startIcon={<UploadIcon />}>
                        Choose File
                      </Button>
                    </label>
                    <Typography
                      variant="caption"
                      sx={{ mt: 1, color: 'text.secondary', display: 'block' }}
                    >
                      CSV, XLSX, or XLS files
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>

            {/* Revenue Orders Section */}
            <Box>
              <Typography
                variant="subtitle2"
                sx={{
                  mb: 1,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <OrderIcon fontSize="small" color="primary" />
                Revenue Orders
              </Typography>
              <Box
                sx={{
                  border: '2px dashed',
                  borderColor: uploadedFiles.revenueOrders ? 'success.main' : 'divider',
                  borderRadius: 2,
                  p: 2,
                  backgroundColor: uploadedFiles.revenueOrders ? 'success.50' : 'grey.50',
                  transition: 'all 0.2s',
                }}
              >
                {uploadedFiles.revenueOrders ? (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <FileIcon color="success" />
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {uploadedFiles.revenueOrders.name}
                      </Typography>
                      <Chip
                        label={`${(uploadedFiles.revenueOrders.size / 1024).toFixed(1)} KB`}
                        size="small"
                        variant="outlined"
                      />
                    </Box>
                    <IconButton
                      size="small"
                      onClick={handleRemoveFile('revenueOrders')}
                      color="error"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ) : (
                  <Box sx={{ textAlign: 'center' }}>
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      ref={revenueOrdersRef}
                      onChange={handleFileChange('revenueOrders')}
                      style={{ display: 'none' }}
                      id="revenue-orders-upload"
                    />
                    <label htmlFor="revenue-orders-upload">
                      <Button variant="outlined" component="span" startIcon={<UploadIcon />}>
                        Choose File
                      </Button>
                    </label>
                    <Typography
                      variant="caption"
                      sx={{ mt: 1, color: 'text.secondary', display: 'block' }}
                    >
                      CSV, XLSX, or XLS files
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>

            {/* Payment Gateway Section */}
            <Box>
              <Typography
                variant="subtitle2"
                sx={{
                  mb: 1,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <GatewayIcon fontSize="small" color="primary" />
                Payment Gateway Data
              </Typography>
              <Box
                sx={{
                  border: '2px dashed',
                  borderColor: uploadedFiles.paymentGateway ? 'success.main' : 'divider',
                  borderRadius: 2,
                  p: 2,
                  backgroundColor: uploadedFiles.paymentGateway ? 'success.50' : 'grey.50',
                  transition: 'all 0.2s',
                }}
              >
                {uploadedFiles.paymentGateway ? (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <FileIcon color="success" />
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {uploadedFiles.paymentGateway.name}
                      </Typography>
                      <Chip
                        label={`${(uploadedFiles.paymentGateway.size / 1024).toFixed(1)} KB`}
                        size="small"
                        variant="outlined"
                      />
                    </Box>
                    <IconButton
                      size="small"
                      onClick={handleRemoveFile('paymentGateway')}
                      color="error"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ) : (
                  <Box sx={{ textAlign: 'center' }}>
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      ref={paymentGatewayRef}
                      onChange={handleFileChange('paymentGateway')}
                      style={{ display: 'none' }}
                      id="payment-gateway-upload"
                    />
                    <label htmlFor="payment-gateway-upload">
                      <Button variant="outlined" component="span" startIcon={<UploadIcon />}>
                        Choose File
                      </Button>
                    </label>
                    <Typography
                      variant="caption"
                      sx={{ mt: 1, color: 'text.secondary', display: 'block' }}
                    >
                      CSV, XLSX, or XLS files
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setUploadModalOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleUploadSubmit}
            disabled={
              !uploadedFiles.bankStatement &&
              !uploadedFiles.revenueOrders &&
              !uploadedFiles.paymentGateway
            }
            startIcon={<UploadIcon />}
          >
            Upload
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default CashDashboard;
