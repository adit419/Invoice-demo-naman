import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  TextField,
  InputAdornment,
  CircularProgress,
  Alert,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Radio,
  Divider,
  Snackbar,
  Tooltip,
  Grid,
  Collapse,
} from '@mui/material';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Link as LinkIcon,
  Add as AddIcon,
  ContentCopy as DuplicateIcon,
  Flag as FlagIcon,
  Close as RejectIcon,
  Delete as WriteOffIcon,
  CheckCircle as CheckIcon,
  Warning as WarningIcon,
  AutoAwesome as AIIcon,
  Psychology as BrainIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
  Payment as GatewayIcon,
  AccountBalance as BankIcon,
  ShoppingCart as OrderIcon,
  LinkOff as MissingIcon,
} from '@mui/icons-material';
import { DataGrid } from '@mui/x-data-grid';
import { cashApi } from '@/services/cashApi';

interface Props {
  selectedClient: { id: string; name: string } | null;
}

function CashExceptions({ selectedClient }: Props) {
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRow, setSelectedRow] = useState<any>(null);
  const [actionDialog, setActionDialog] = useState<{ open: boolean; type: string | null }>({
    open: false,
    type: null,
  });
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<any>(null);
  const [actionNote, setActionNote] = useState('');
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info' | 'warning';
  }>({ open: false, message: '', severity: 'success' });
  const [processing, setProcessing] = useState(false);

  const [aiSuggestions, setAiSuggestions] = useState<any>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [aiExpanded, setAiExpanded] = useState(true);

  useEffect(() => {
    if (selectedClient) {
      fetchExceptions();
    }
  }, [selectedClient]);

  const fetchExceptions = async () => {
    if (!selectedClient) return;
    setLoading(true);
    setError(null);
    try {
      const response = await cashApi.get(`/cash-api/exceptions/${selectedClient.id}`);
      setExceptions(response.data);
    } catch (err) {
      console.error('Error fetching exceptions:', err);
      setError('Failed to load exceptions');
    } finally {
      setLoading(false);
    }
  };

  const fetchSuggestions = async (transactionId: string) => {
    if (!selectedClient) return;
    setLoadingSuggestions(true);
    try {
      const response = await cashApi.get(
        `/cash-api/exceptions/${selectedClient.id}/${transactionId}/suggestions`
      );
      setSuggestions(response.data);
    } catch (err) {
      console.error('Error fetching suggestions:', err);
      setSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const fetchAISuggestions = async (transactionId: string) => {
    if (!selectedClient) return;
    setLoadingAI(true);
    setAiSuggestions(null);
    try {
      const response = await cashApi.get(
        `/cash-api/ai/suggestions/${selectedClient.id}/${transactionId}`
      );
      setAiSuggestions(response.data);
    } catch (err) {
      console.error('Error fetching AI suggestions:', err);
      setAiSuggestions({
        success: false,
        error: 'Could not reach the AI suggestions endpoint. Check that the backend is running.',
      });
    } finally {
      setLoadingAI(false);
    }
  };

  const handleAction = async () => {
    if (!selectedClient || !selectedRow) return;
    setProcessing(true);

    const actionMapping: Record<string, string> = {
      manual_match: 'manual_match',
      ai_match: 'manual_match',
      link_gateway: 'link_gateway',
      create_order: 'create_order',
      duplicate: 'mark_duplicate',
      flag: 'flag_review',
      reject: 'reject',
      write_off: 'write_off',
    };

    try {
      const response = await cashApi.post(
        `/cash-api/exceptions/${selectedClient.id}/${selectedRow.transaction_id}/action`,
        {
          action: actionMapping[actionDialog.type!],
          order_id: selectedSuggestion?.order_id || null,
          note: actionNote,
        }
      );

      setSnackbar({
        open: true,
        message: response.data.message,
        severity: 'success',
      });

      setExceptions(exceptions.filter(e => e.transaction_id !== selectedRow.transaction_id));
      handleCloseDialog();
    } catch (err) {
      console.error('Error taking action:', err);
      setSnackbar({
        open: true,
        message: 'Failed to process action',
        severity: 'error',
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleOpenAction = (type: string, row: any) => {
    setSelectedRow(row);
    setActionDialog({ open: true, type });
    setSelectedSuggestion(null);
    setActionNote('');
    setAiSuggestions(null);

    if (type === 'manual_match') {
      fetchSuggestions(row.transaction_id);
    } else if (type === 'ai_match') {
      fetchSuggestions(row.transaction_id);
      fetchAISuggestions(row.transaction_id);
    }
  };

  const handleCloseDialog = () => {
    setActionDialog({ open: false, type: null });
    setSelectedRow(null);
    setSuggestions([]);
    setSelectedSuggestion(null);
    setActionNote('');
    setAiSuggestions(null);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getReconStatusInfo = (status: string) => {
    const statusConfig: Record<string, any> = {
      bank_pg_only: {
        label: 'Missing Order',
        color: 'warning',
        icon: <OrderIcon fontSize="small" />,
        missing: 'Order',
        has: ['Bank', 'Gateway'],
      },
      pg_order_only: {
        label: 'Missing Bank',
        color: 'info',
        icon: <BankIcon fontSize="small" />,
        missing: 'Bank',
        has: ['Gateway', 'Order'],
      },
      bank_order_only: {
        label: 'Missing Gateway',
        color: 'primary',
        icon: <GatewayIcon fontSize="small" />,
        missing: 'Gateway',
        has: ['Bank', 'Order'],
      },
      unmatched: {
        label: 'Unmatched',
        color: 'error',
        icon: <MissingIcon fontSize="small" />,
        missing: 'All',
        has: ['Bank'],
      },
    };
    return statusConfig[status] || statusConfig.unmatched;
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
      field: 'description',
      headerName: 'Description',
      width: 200,
      renderCell: (params: any) => (
        <Tooltip title={params.value || ''}>
          <Typography variant="body2" noWrap sx={{ color: 'text.secondary' }}>
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
      field: 'payment_channel',
      headerName: 'Channel',
      width: 100,
      renderCell: (params: any) => (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {params.value || '-'}
        </Typography>
      ),
    },
    {
      field: 'reconciliation_status',
      headerName: 'Status',
      width: 150,
      renderCell: (params: any) => {
        const info = getReconStatusInfo(params.value);
        return (
          <Chip
            label={info.label}
            color={info.color}
            size="small"
            variant="outlined"
            sx={{ fontSize: '0.7rem' }}
          />
        );
      },
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 320,
      sortable: false,
      renderCell: (params: any) => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title="AI Match">
            <IconButton
              size="small"
              sx={{ color: '#7C4DFF', '&:hover': { backgroundColor: '#EDE7F6' } }}
              onClick={() => handleOpenAction('ai_match', params.row)}
            >
              <AIIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Manual Match">
            <IconButton
              size="small"
              color="primary"
              onClick={() => handleOpenAction('manual_match', params.row)}
            >
              <LinkIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Link Gateway">
            <IconButton
              size="small"
              color="info"
              onClick={() => handleOpenAction('link_gateway', params.row)}
            >
              <GatewayIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Create Order">
            <IconButton
              size="small"
              color="success"
              onClick={() => handleOpenAction('create_order', params.row)}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Mark Duplicate">
            <IconButton size="small" onClick={() => handleOpenAction('duplicate', params.row)}>
              <DuplicateIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Flag for Review">
            <IconButton
              size="small"
              color="warning"
              onClick={() => handleOpenAction('flag', params.row)}
            >
              <FlagIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Reject">
            <IconButton
              size="small"
              color="error"
              onClick={() => handleOpenAction('reject', params.row)}
            >
              <RejectIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Write Off">
            <IconButton size="small" onClick={() => handleOpenAction('write_off', params.row)}>
              <WriteOffIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ];

  const filteredExceptions = exceptions.filter(
    exc =>
      !searchTerm ||
      exc.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      exc.transaction_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      exc.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderDialogContent = () => {
    if (!selectedRow) return null;

    const reconInfo = getReconStatusInfo(selectedRow.reconciliation_status);

    const transactionInfo = (
      <Box sx={{ mb: 3 }}>
        <Box sx={{ p: 2, backgroundColor: '#F8FAFC', borderRadius: 2, mb: 2 }}>
          <Typography variant="subtitle2" sx={{ color: 'text.secondary', mb: 1 }}>
            Transaction Details
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 6 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                ID
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                {selectedRow.transaction_id?.substring(0, 20)}...
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Amount
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {formatCurrency(selectedRow.amount)}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Payer
              </Typography>
              <Typography variant="body2">{selectedRow.name || '-'}</Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Date
              </Typography>
              <Typography variant="body2">
                {selectedRow.transaction_date
                  ? new Date(selectedRow.transaction_date).toLocaleDateString('id-ID')
                  : '-'}
              </Typography>
            </Grid>
          </Grid>
        </Box>

        {/* 3-Way Reconciliation Status */}
        <Box
          sx={{
            p: 2,
            backgroundColor: reconInfo.color === 'error' ? '#FFEBEE' : '#FFF3E0',
            borderRadius: 2,
            border: '1px solid',
            borderColor: `${reconInfo.color}.light`,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <MissingIcon sx={{ color: `${reconInfo.color}.main`, fontSize: 20 }} />
            <Typography
              variant="subtitle2"
              sx={{ color: `${reconInfo.color}.dark`, fontWeight: 600 }}
            >
              3-Way Reconciliation Gap
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <BankIcon
                sx={{
                  fontSize: 16,
                  color: reconInfo.has.includes('Bank') ? 'success.main' : 'grey.400',
                }}
              />
              <Typography
                variant="caption"
                sx={{
                  color: reconInfo.has.includes('Bank') ? 'success.main' : 'grey.500',
                }}
              >
                Bank {reconInfo.has.includes('Bank') ? '✓' : '✗'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <GatewayIcon
                sx={{
                  fontSize: 16,
                  color: reconInfo.has.includes('Gateway') ? 'success.main' : 'grey.400',
                }}
              />
              <Typography
                variant="caption"
                sx={{
                  color: reconInfo.has.includes('Gateway') ? 'success.main' : 'grey.500',
                }}
              >
                Gateway {reconInfo.has.includes('Gateway') ? '✓' : '✗'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <OrderIcon
                sx={{
                  fontSize: 16,
                  color: reconInfo.has.includes('Order') ? 'success.main' : 'grey.400',
                }}
              />
              <Typography
                variant="caption"
                sx={{
                  color: reconInfo.has.includes('Order') ? 'success.main' : 'grey.500',
                }}
              >
                Order {reconInfo.has.includes('Order') ? '✓' : '✗'}
              </Typography>
            </Box>
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Missing: <strong>{reconInfo.missing}</strong> - Resolve by linking the missing source
            or taking an appropriate action.
          </Typography>
        </Box>
      </Box>
    );

    switch (actionDialog.type) {
      case 'ai_match':
        return (
          <>
            {transactionInfo}

            {/* AI Analysis Section */}
            <Box sx={{ mb: 3 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mb: 1,
                  cursor: 'pointer',
                }}
                onClick={() => setAiExpanded(!aiExpanded)}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <BrainIcon sx={{ color: '#7C4DFF' }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#7C4DFF' }}>
                    AI Analysis
                  </Typography>
                </Box>
                <IconButton size="small">
                  {aiExpanded ? <CollapseIcon /> : <ExpandIcon />}
                </IconButton>
              </Box>

              <Collapse in={aiExpanded}>
                {loadingAI ? (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                      py: 3,
                      justifyContent: 'center',
                    }}
                  >
                    <CircularProgress size={24} sx={{ color: '#7C4DFF' }} />
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      Finding the best match...
                    </Typography>
                  </Box>
                ) : aiSuggestions ? (
                  aiSuggestions.success === false ? (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                      {aiSuggestions.error || 'AI analysis unavailable'}
                    </Alert>
                  ) : (
                    <Box sx={{ backgroundColor: aiSuggestions.demo_mode ? '#FFF8E1' : '#F3E5F5', borderRadius: 2, p: 2, mb: 2, border: aiSuggestions.demo_mode ? '1px solid #FFE082' : 'none' }}>
                      {aiSuggestions.demo_mode && (
                        <Alert severity="info" sx={{ mb: 1.5, fontSize: 12 }}>
                          Demo mode — set <strong>ANTHROPIC_API_KEY</strong> to enable full Claude analysis.
                        </Alert>
                      )}
                      {aiSuggestions.analysis && (
                        <Box sx={{ mb: 2 }}>
                          <Typography
                            variant="caption"
                            sx={{ color: aiSuggestions.demo_mode ? '#F57F17' : '#7C4DFF', fontWeight: 600 }}
                          >
                            Analysis
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}
                          >
                            {aiSuggestions.analysis}
                          </Typography>
                        </Box>
                      )}

                      {aiSuggestions.recommendation && (
                        <Box sx={{ mb: 2 }}>
                          <Typography
                            variant="caption"
                            sx={{ color: '#7C4DFF', fontWeight: 600 }}
                          >
                            Recommendation
                          </Typography>
                          <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 500 }}>
                            {aiSuggestions.recommendation}
                          </Typography>
                        </Box>
                      )}

                      {aiSuggestions.suggestions && aiSuggestions.suggestions.length > 0 && (
                        <Box>
                          <Typography
                            variant="caption"
                            sx={{ color: '#7C4DFF', fontWeight: 600 }}
                          >
                            AI Suggested Matches
                          </Typography>
                          {aiSuggestions.suggestions.map((sug: any, idx: number) => (
                            <Box
                              key={idx}
                              sx={{
                                mt: 1,
                                p: 1.5,
                                backgroundColor: 'white',
                                borderRadius: 1,
                                border: '1px solid',
                                borderColor:
                                  selectedSuggestion?.order_id === sug.order_id
                                    ? '#7C4DFF'
                                    : '#E0E0E0',
                                cursor: 'pointer',
                                '&:hover': { borderColor: '#7C4DFF' },
                              }}
                              onClick={() => setSelectedSuggestion({ order_id: sug.order_id })}
                            >
                              <Box
                                sx={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                }}
                              >
                                <Typography
                                  variant="body2"
                                  sx={{ fontFamily: 'monospace', fontWeight: 600 }}
                                >
                                  {sug.order_id}
                                </Typography>
                                <Chip
                                  label={`${Math.round(sug.confidence * 100)}%`}
                                  size="small"
                                  sx={{
                                    backgroundColor:
                                      sug.confidence > 0.7 ? '#E8F5E9' : '#FFF3E0',
                                    color: sug.confidence > 0.7 ? '#2E7D32' : '#E65100',
                                  }}
                                />
                              </Box>
                              <Typography
                                variant="caption"
                                sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}
                              >
                                {sug.reasoning}
                              </Typography>
                              {sug.match_factors && (
                                <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                  {sug.match_factors.map((factor: string, i: number) => (
                                    <Chip
                                      key={i}
                                      label={factor}
                                      size="small"
                                      variant="outlined"
                                      sx={{ fontSize: '0.7rem' }}
                                    />
                                  ))}
                                </Box>
                              )}
                              {sug.reconciliation_path && (
                                <Box sx={{ mt: 1 }}>
                                  <Chip
                                    size="small"
                                    label={`Path: ${sug.reconciliation_path.replace(/_/g, ' ')}`}
                                    sx={{
                                      fontSize: '0.65rem',
                                      backgroundColor:
                                        sug.reconciliation_path === 'full_match'
                                          ? '#E8F5E9'
                                          : '#FFF8E1',
                                      color:
                                        sug.reconciliation_path === 'full_match'
                                          ? '#2E7D32'
                                          : '#F57C00',
                                    }}
                                  />
                                </Box>
                              )}
                            </Box>
                          ))}
                        </Box>
                      )}
                    </Box>
                  )
                ) : null}
              </Collapse>
            </Box>

            <Divider sx={{ mb: 2 }} />

            <Typography variant="subtitle2" sx={{ mb: 2 }}>
              Or select from rule-based matches:
            </Typography>
            {loadingSuggestions ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                <CircularProgress size={24} />
              </Box>
            ) : suggestions.length === 0 ? (
              <Alert severity="info">No rule-based matches found</Alert>
            ) : (
              <List sx={{ maxHeight: 200, overflow: 'auto' }}>
                {suggestions.map(suggestion => (
                  <ListItem
                    key={suggestion.order_id}
                    sx={{
                      border: '1px solid',
                      borderColor:
                        selectedSuggestion?.order_id === suggestion.order_id
                          ? 'primary.main'
                          : 'divider',
                      borderRadius: 1,
                      mb: 1,
                      cursor: 'pointer',
                      '&:hover': { backgroundColor: 'action.hover' },
                    }}
                    onClick={() => setSelectedSuggestion(suggestion)}
                  >
                    <Radio
                      checked={selectedSuggestion?.order_id === suggestion.order_id}
                      size="small"
                    />
                    <ListItemText
                      primary={suggestion.order_id}
                      secondary={
                        <Box>
                          <Typography variant="caption" sx={{ display: 'block' }}>
                            {suggestion.store_name}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            {formatCurrency(suggestion.amount)} | Similarity:{' '}
                            {Math.round(suggestion.name_similarity * 100)}%
                          </Typography>
                        </Box>
                      }
                      slotProps={{ primary: { sx: { fontFamily: 'monospace', fontSize: '0.8rem' } } }}
                    />
                    <ListItemSecondaryAction>
                      {suggestion.amount_match && (
                        <Chip label="Amount Match" size="small" color="success" />
                      )}
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
            )}
          </>
        );

      case 'manual_match':
        return (
          <>
            {transactionInfo}
            <Typography variant="subtitle2" sx={{ mb: 2 }}>
              Select Order to Match
            </Typography>
            {loadingSuggestions ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                <CircularProgress size={24} />
              </Box>
            ) : suggestions.length === 0 ? (
              <Alert severity="info">No suggested matches found</Alert>
            ) : (
              <List sx={{ maxHeight: 300, overflow: 'auto' }}>
                {suggestions.map(suggestion => (
                  <ListItem
                    key={suggestion.order_id}
                    sx={{
                      border: '1px solid',
                      borderColor:
                        selectedSuggestion?.order_id === suggestion.order_id
                          ? 'primary.main'
                          : 'divider',
                      borderRadius: 1,
                      mb: 1,
                      cursor: 'pointer',
                      '&:hover': { backgroundColor: 'action.hover' },
                    }}
                    onClick={() => setSelectedSuggestion(suggestion)}
                  >
                    <Radio
                      checked={selectedSuggestion?.order_id === suggestion.order_id}
                      size="small"
                    />
                    <ListItemText
                      primary={suggestion.order_id}
                      secondary={
                        <Box>
                          <Typography variant="caption" sx={{ display: 'block' }}>
                            {suggestion.store_name}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            {formatCurrency(suggestion.amount)} | Similarity:{' '}
                            {Math.round(suggestion.name_similarity * 100)}%
                          </Typography>
                        </Box>
                      }
                      slotProps={{ primary: { sx: { fontFamily: 'monospace', fontSize: '0.8rem' } } }}
                    />
                    <ListItemSecondaryAction>
                      {suggestion.amount_match && (
                        <Chip label="Amount Match" size="small" color="success" />
                      )}
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
            )}
          </>
        );

      case 'link_gateway':
        return (
          <>
            {transactionInfo}
            <Alert severity="info" sx={{ mb: 2 }}>
              Link this transaction to a payment gateway record to complete the 3-way
              reconciliation.
            </Alert>
            <TextField
              fullWidth
              label="Gateway Transaction ID"
              placeholder="e.g., PG1697851575001"
              value={actionNote}
              onChange={e => setActionNote(e.target.value)}
              sx={{ mb: 2 }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <GatewayIcon sx={{ color: 'info.main' }} />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Enter the payment gateway transaction ID to link. This will help complete the 3-way
              match between Bank, Gateway, and Order.
            </Typography>
          </>
        );

      case 'create_order':
        return (
          <>
            {transactionInfo}
            <Alert severity="info" sx={{ mb: 2 }}>
              This will create a new order from the transaction details and mark it as matched.
            </Alert>
            <TextField
              fullWidth
              multiline
              rows={3}
              label="Notes (optional)"
              value={actionNote}
              onChange={e => setActionNote(e.target.value)}
              placeholder="Add any notes about this order..."
            />
          </>
        );

      case 'duplicate':
        return (
          <>
            {transactionInfo}
            <Alert severity="warning" sx={{ mb: 2 }}>
              Mark this transaction as a duplicate. It will be removed from the exceptions queue.
            </Alert>
            <TextField
              fullWidth
              multiline
              rows={2}
              label="Reason"
              value={actionNote}
              onChange={e => setActionNote(e.target.value)}
              placeholder="Why is this a duplicate?"
            />
          </>
        );

      case 'flag':
        return (
          <>
            {transactionInfo}
            <Alert severity="warning" sx={{ mb: 2 }}>
              Flag this transaction for manual review by the finance team.
            </Alert>
            <TextField
              fullWidth
              multiline
              rows={2}
              label="Review Notes"
              value={actionNote}
              onChange={e => setActionNote(e.target.value)}
              placeholder="What should the reviewer look for?"
            />
          </>
        );

      case 'reject':
        return (
          <>
            {transactionInfo}
            <Alert severity="error" sx={{ mb: 2 }}>
              Reject this transaction. It will be marked as rejected and removed from the queue.
            </Alert>
            <TextField
              fullWidth
              multiline
              rows={2}
              label="Rejection Reason"
              value={actionNote}
              onChange={e => setActionNote(e.target.value)}
              placeholder="Why is this transaction being rejected?"
              required
            />
          </>
        );

      case 'write_off':
        return (
          <>
            {transactionInfo}
            <Alert severity="error" sx={{ mb: 2 }}>
              Write off this transaction. It will be recorded as a loss and removed from the
              queue.
            </Alert>
            <TextField
              fullWidth
              multiline
              rows={2}
              label="Write-off Reason"
              value={actionNote}
              onChange={e => setActionNote(e.target.value)}
              placeholder="Reason for writing off this amount..."
              required
            />
          </>
        );

      default:
        return null;
    }
  };

  const getDialogTitle = () => {
    const titles: Record<string, string> = {
      manual_match: 'Manual Match',
      ai_match: 'AI-Assisted Match',
      link_gateway: 'Link Payment Gateway',
      create_order: 'Create New Order',
      duplicate: 'Mark as Duplicate',
      flag: 'Flag for Review',
      reject: 'Reject Transaction',
      write_off: 'Write Off Transaction',
    };
    return titles[actionDialog.type!] || 'Action';
  };

  const getDialogIcon = () => {
    const icons: Record<string, React.ReactNode> = {
      manual_match: <LinkIcon color="primary" />,
      ai_match: <AIIcon sx={{ color: '#7C4DFF' }} />,
      link_gateway: <GatewayIcon color="info" />,
      create_order: <AddIcon color="success" />,
      duplicate: <DuplicateIcon />,
      flag: <FlagIcon color="warning" />,
      reject: <RejectIcon color="error" />,
      write_off: <WriteOffIcon />,
    };
    return icons[actionDialog.type!];
  };

  const isActionDisabled = () => {
    if (
      ['manual_match', 'ai_match'].includes(actionDialog.type!) &&
      !selectedSuggestion
    )
      return true;
    if (
      ['reject', 'write_off', 'link_gateway'].includes(actionDialog.type!) &&
      !actionNote
    )
      return true;
    return false;
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Chip
            icon={<WarningIcon />}
            label={`${filteredExceptions.length} Exceptions`}
            color="error"
            variant="outlined"
          />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Transactions requiring manual review or action
          </Typography>
        </Box>
        <IconButton onClick={fetchExceptions} size="small">
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* Search */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ py: 2 }}>
          <TextField
            size="small"
            placeholder="Search exceptions..."
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
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardContent sx={{ p: 0 }}>
          {filteredExceptions.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <CheckIcon sx={{ fontSize: 48, color: 'success.main', mb: 2 }} />
              <Typography variant="h6" sx={{ mb: 1 }}>
                No Exceptions
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                All transactions have been matched or resolved
              </Typography>
            </Box>
          ) : (
            <DataGrid
              rows={filteredExceptions}
              columns={columns}
              getRowId={row => row.transaction_id}
              rowHeight={52}
              initialState={{
                pagination: {
                  paginationModel: { pageSize: 25 },
                },
              }}
              pageSizeOptions={[10, 25, 50]}
              disableRowSelectionOnClick
              autoHeight
              sx={{
                border: 'none',
                '& .MuiDataGrid-columnHeaders': {
                  backgroundColor: '#FEF2F2',
                  borderBottom: '1px solid',
                  borderColor: 'error.light',
                },
                '& .MuiDataGrid-cell': {
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  alignItems: 'center',
                  display: 'flex',
                },
                '& .MuiDataGrid-row:hover': {
                  backgroundColor: '#FEF2F2',
                },
              }}
            />
          )}
        </CardContent>
      </Card>

      {/* Action Dialog */}
      <Dialog open={actionDialog.open} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {getDialogIcon()}
          {getDialogTitle()}
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 3 }}>{renderDialogContent()}</DialogContent>
        <Divider />
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleCloseDialog} disabled={processing}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleAction}
            disabled={isActionDisabled() || processing}
            startIcon={processing ? <CircularProgress size={16} /> : null}
            sx={
              actionDialog.type === 'ai_match'
                ? { backgroundColor: '#7C4DFF', '&:hover': { backgroundColor: '#651FFF' } }
                : {}
            }
          >
            {processing ? 'Processing...' : 'Confirm Match'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default CashExceptions;
