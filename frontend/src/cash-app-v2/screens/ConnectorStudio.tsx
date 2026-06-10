/**
 * Connector Studio - Main Screen
 * Centralized integration hub for managing connectors
 */

import React, { useState, useEffect } from 'react'
import { connectorsService } from '../services/index'
import type { ConnectorConfig, ConnectorType, ConnectorStatus, ExecutionRun, ExecutionStatus } from '../types/domain'

type TabType = 'connectors' | 'history' | 'formats'

// Bank Statement Format Types
interface BankStatementFormat {
  id: string
  bankName: string
  bankCode: string
  country: string
  format: 'MT940' | 'CAMT.053' | 'CAMT.052' | 'BAI2' | 'CSV' | 'PDF'
  version?: string
  status: 'active' | 'testing' | 'pending'
  lastParsed?: string
  parseSuccessRate: number
  fieldsMapping: {
    transactionRef: boolean
    valueDate: boolean
    bookingDate: boolean
    amount: boolean
    currency: boolean
    description: boolean
    bankRef: boolean
    customerRef: boolean
  }
}

// PSP Report Format Types
interface PSPReportFormat {
  id: string
  pspName: string
  reportType: string
  inputFormat: 'CSV' | 'XLSX' | 'JSON' | 'XML' | 'API'
  canonicalMapping: 'complete' | 'partial' | 'pending'
  status: 'active' | 'testing' | 'pending'
  lastProcessed?: string
  recordsProcessed: number
  mappedFields: number
  totalFields: number
  fieldMappings: {
    field: string
    sourceField: string
    transform?: string
    status: 'mapped' | 'derived' | 'unmapped'
  }[]
}

// Manually Added Bank Account
interface ManualBankAccount {
  id: string
  bankName: string
  bankCode: string
  country: string
  currency: string
  accountNumber: string
  accountName: string
  statementFormat: 'MT940' | 'CAMT.053' | 'CAMT.052' | 'BAI2' | 'CSV' | 'PDF'
  addedAt: string
  addedBy: string
}

// In-memory store for manually added banks
let manualBanksStore: ManualBankAccount[] = [
  {
    id: 'MB-001',
    bankName: 'DBS Bank',
    bankCode: 'DBSSSGSG',
    country: 'Singapore',
    currency: 'SGD',
    accountNumber: '****4521',
    accountName: 'Grab Singapore Pte Ltd - Settlement',
    statementFormat: 'MT940',
    addedAt: '2026-05-15T10:00:00Z',
    addedBy: 'Sarah Chen',
  },
  {
    id: 'MB-002',
    bankName: 'OCBC Bank',
    bankCode: 'OCBCSGSG',
    country: 'Singapore',
    currency: 'SGD',
    accountNumber: '****7832',
    accountName: 'Grab Singapore Pte Ltd - Operating',
    statementFormat: 'MT940',
    addedAt: '2026-05-15T10:05:00Z',
    addedBy: 'Sarah Chen',
  },
  {
    id: 'MB-003',
    bankName: 'Bank Mandiri',
    bankCode: 'BMRIIDJA',
    country: 'Indonesia',
    currency: 'IDR',
    accountNumber: '****6190',
    accountName: 'PT Grab Indonesia - Settlement',
    statementFormat: 'CSV',
    addedAt: '2026-05-16T08:00:00Z',
    addedBy: 'Sarah Chen',
  },
]
let manualBankCounter = 3

// Mock Data for Bank Statement Formats
const bankStatementFormats: BankStatementFormat[] = [
  {
    id: 'BSF-001',
    bankName: 'DBS Bank',
    bankCode: 'DBSSSGSG',
    country: 'Singapore',
    format: 'MT940',
    version: 'SRG 2020',
    status: 'active',
    lastParsed: '2026-06-09T08:30:00Z',
    parseSuccessRate: 99.8,
    fieldsMapping: { transactionRef: true, valueDate: true, bookingDate: true, amount: true, currency: true, description: true, bankRef: true, customerRef: true }
  },
  {
    id: 'BSF-002',
    bankName: 'OCBC Bank',
    bankCode: 'OCBCSGSG',
    country: 'Singapore',
    format: 'MT940',
    version: 'SRG 2020',
    status: 'active',
    lastParsed: '2026-06-09T07:45:00Z',
    parseSuccessRate: 99.5,
    fieldsMapping: { transactionRef: true, valueDate: true, bookingDate: true, amount: true, currency: true, description: true, bankRef: true, customerRef: false }
  },
  {
    id: 'BSF-003',
    bankName: 'UOB Bank',
    bankCode: 'UOVBSGSG',
    country: 'Singapore',
    format: 'CAMT.053',
    version: 'ISO 20022',
    status: 'active',
    lastParsed: '2026-06-09T06:00:00Z',
    parseSuccessRate: 99.9,
    fieldsMapping: { transactionRef: true, valueDate: true, bookingDate: true, amount: true, currency: true, description: true, bankRef: true, customerRef: true }
  },
  {
    id: 'BSF-004',
    bankName: 'Bank Mandiri',
    bankCode: 'BMRIIDJA',
    country: 'Indonesia',
    format: 'CSV',
    status: 'active',
    lastParsed: '2026-06-09T05:30:00Z',
    parseSuccessRate: 98.2,
    fieldsMapping: { transactionRef: true, valueDate: true, bookingDate: false, amount: true, currency: true, description: true, bankRef: false, customerRef: false }
  },
  {
    id: 'BSF-005',
    bankName: 'BCA',
    bankCode: 'CENAIDJA',
    country: 'Indonesia',
    format: 'MT940',
    version: 'Local',
    status: 'active',
    lastParsed: '2026-06-09T04:00:00Z',
    parseSuccessRate: 97.5,
    fieldsMapping: { transactionRef: true, valueDate: true, bookingDate: true, amount: true, currency: true, description: true, bankRef: true, customerRef: false }
  },
  {
    id: 'BSF-006',
    bankName: 'Maybank',
    bankCode: 'MABORJH',
    country: 'Malaysia',
    format: 'CAMT.053',
    version: 'ISO 20022',
    status: 'testing',
    lastParsed: '2026-06-08T12:00:00Z',
    parseSuccessRate: 95.0,
    fieldsMapping: { transactionRef: true, valueDate: true, bookingDate: true, amount: true, currency: true, description: true, bankRef: false, customerRef: false }
  },
  {
    id: 'BSF-007',
    bankName: 'CIMB Bank',
    bankCode: 'CIABORJ',
    country: 'Malaysia',
    format: 'CSV',
    status: 'pending',
    parseSuccessRate: 0,
    fieldsMapping: { transactionRef: false, valueDate: false, bookingDate: false, amount: false, currency: false, description: false, bankRef: false, customerRef: false }
  },
]

// Mock Data for PSP Report Formats
const pspReportFormats: PSPReportFormat[] = [
  {
    id: 'PSP-001',
    pspName: 'GrabPay',
    reportType: 'Settlement Report',
    inputFormat: 'CSV',
    canonicalMapping: 'complete',
    status: 'active',
    lastProcessed: '2026-06-09T09:00:00Z',
    recordsProcessed: 125840,
    mappedFields: 18,
    totalFields: 18,
    fieldMappings: [
      { field: 'transaction_id', sourceField: 'grab_txn_id', status: 'mapped' },
      { field: 'order_id', sourceField: 'merchant_ref', status: 'mapped' },
      { field: 'gross_amount', sourceField: 'txn_amount', status: 'mapped' },
      { field: 'mdr_fee', sourceField: 'commission', status: 'mapped' },
      { field: 'net_amount', sourceField: 'settlement_amount', status: 'derived' },
    ]
  },
  {
    id: 'PSP-002',
    pspName: 'Stripe',
    reportType: 'Payout Reconciliation',
    inputFormat: 'CSV',
    canonicalMapping: 'complete',
    status: 'active',
    lastProcessed: '2026-06-09T08:30:00Z',
    recordsProcessed: 89230,
    mappedFields: 22,
    totalFields: 22,
    fieldMappings: [
      { field: 'transaction_id', sourceField: 'balance_transaction', status: 'mapped' },
      { field: 'order_id', sourceField: 'metadata.order_id', status: 'mapped' },
      { field: 'gross_amount', sourceField: 'amount', transform: 'divide by 100', status: 'mapped' },
      { field: 'mdr_fee', sourceField: 'fee', transform: 'divide by 100', status: 'mapped' },
      { field: 'net_amount', sourceField: 'net', transform: 'divide by 100', status: 'mapped' },
    ]
  },
  {
    id: 'PSP-003',
    pspName: 'OVO',
    reportType: 'Daily Settlement',
    inputFormat: 'XLSX',
    canonicalMapping: 'complete',
    status: 'active',
    lastProcessed: '2026-06-09T07:00:00Z',
    recordsProcessed: 234560,
    mappedFields: 15,
    totalFields: 15,
    fieldMappings: [
      { field: 'transaction_id', sourceField: 'ovo_ref_no', status: 'mapped' },
      { field: 'order_id', sourceField: 'merchant_order_id', status: 'mapped' },
      { field: 'gross_amount', sourceField: 'transaction_amount', status: 'mapped' },
      { field: 'mdr_fee', sourceField: 'mdr', status: 'mapped' },
      { field: 'net_amount', sourceField: 'net_settlement', status: 'mapped' },
    ]
  },
  {
    id: 'PSP-004',
    pspName: 'GoPay',
    reportType: 'Merchant Settlement',
    inputFormat: 'JSON',
    canonicalMapping: 'complete',
    status: 'active',
    lastProcessed: '2026-06-09T06:30:00Z',
    recordsProcessed: 198340,
    mappedFields: 16,
    totalFields: 16,
    fieldMappings: [
      { field: 'transaction_id', sourceField: 'gopay_transaction_id', status: 'mapped' },
      { field: 'order_id', sourceField: 'merchant_order_id', status: 'mapped' },
      { field: 'gross_amount', sourceField: 'payment_amount', status: 'mapped' },
      { field: 'mdr_fee', sourceField: 'fee_amount', status: 'mapped' },
      { field: 'net_amount', sourceField: 'settlement_amount', status: 'mapped' },
    ]
  },
  {
    id: 'PSP-005',
    pspName: 'DOKU',
    reportType: 'Transaction Report',
    inputFormat: 'CSV',
    canonicalMapping: 'partial',
    status: 'active',
    lastProcessed: '2026-06-09T05:00:00Z',
    recordsProcessed: 45670,
    mappedFields: 12,
    totalFields: 14,
    fieldMappings: [
      { field: 'transaction_id', sourceField: 'doku_txn_id', status: 'mapped' },
      { field: 'order_id', sourceField: 'invoice_number', status: 'mapped' },
      { field: 'gross_amount', sourceField: 'amount', status: 'mapped' },
      { field: 'mdr_fee', sourceField: 'mdr_fee', status: 'mapped' },
      { field: 'fx_rate', sourceField: '', status: 'unmapped' },
      { field: 'settlement_currency', sourceField: '', status: 'unmapped' },
    ]
  },
  {
    id: 'PSP-006',
    pspName: 'PayPal',
    reportType: 'Settlement Batch',
    inputFormat: 'CSV',
    canonicalMapping: 'complete',
    status: 'active',
    lastProcessed: '2026-06-09T04:00:00Z',
    recordsProcessed: 34280,
    mappedFields: 20,
    totalFields: 20,
    fieldMappings: [
      { field: 'transaction_id', sourceField: 'Transaction ID', status: 'mapped' },
      { field: 'order_id', sourceField: 'Invoice ID', status: 'mapped' },
      { field: 'gross_amount', sourceField: 'Gross', status: 'mapped' },
      { field: 'mdr_fee', sourceField: 'Fee', status: 'mapped' },
      { field: 'net_amount', sourceField: 'Net', status: 'mapped' },
    ]
  },
  {
    id: 'PSP-007',
    pspName: 'Adyen',
    reportType: 'Settlement Detail Report',
    inputFormat: 'CSV',
    canonicalMapping: 'partial',
    status: 'testing',
    lastProcessed: '2026-06-08T10:00:00Z',
    recordsProcessed: 5420,
    mappedFields: 18,
    totalFields: 24,
    fieldMappings: [
      { field: 'transaction_id', sourceField: 'Psp Reference', status: 'mapped' },
      { field: 'order_id', sourceField: 'Merchant Reference', status: 'mapped' },
      { field: 'gross_amount', sourceField: 'Gross Credit (GC)', status: 'mapped' },
      { field: 'mdr_fee', sourceField: 'Commission (DC)', status: 'mapped' },
      { field: 'net_amount', sourceField: 'Net Credit (NC)', status: 'derived' },
      { field: 'interchange_fee', sourceField: '', status: 'unmapped' },
    ]
  },
  {
    id: 'PSP-008',
    pspName: 'Touch n Go',
    reportType: 'Daily Report',
    inputFormat: 'XLSX',
    canonicalMapping: 'pending',
    status: 'pending',
    recordsProcessed: 0,
    mappedFields: 0,
    totalFields: 12,
    fieldMappings: []
  },
]

const ConnectorStudio: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('connectors')
  const [connectors, setConnectors] = useState<ConnectorConfig[]>([])
  const [executionRuns, setExecutionRuns] = useState<ExecutionRun[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedType, setSelectedType] = useState<ConnectorType | 'all'>('all')
  const [selectedStatus, setSelectedStatus] = useState<ConnectorStatus | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedConnector, setSelectedConnector] = useState<string | null>(null)

  // History tab filters
  const [historyConnectorFilter, setHistoryConnectorFilter] = useState<string>('all')
  const [historyStatusFilter, setHistoryStatusFilter] = useState<ExecutionStatus | 'all'>('all')
  const [historyDateRange, setHistoryDateRange] = useState<string>('7d')

  // Format mapping modals
  const [showAddBankModal, setShowAddBankModal] = useState(false)
  const [showAddPSPModal, setShowAddPSPModal] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadConnector, setUploadConnector] = useState<ConnectorConfig | null>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadStep, setUploadStep] = useState<'select' | 'preview' | 'processing' | 'success' | 'error'>('select')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [parsedRecords, setParsedRecords] = useState<{ date: string; ref: string; amount: string; type: string; desc: string }[]>([])
  const [selectedBankFormatId, setSelectedBankFormatId] = useState<string | null>(null)
  const [uploadParseError, setUploadParseError] = useState<string | null>(null)
  const [isParsing, setIsParsing] = useState(false)

  // New Connector modal
  const [showNewConnectorModal, setShowNewConnectorModal] = useState(false)
  const [newConnectorStep, setNewConnectorStep] = useState<'select-type' | 'configure'>('select-type')
  const [selectedConnectorType, setSelectedConnectorType] = useState<ConnectorType | null>(null)

  // Manually added bank accounts
  const [manualBanks, setManualBanks] = useState<ManualBankAccount[]>([...manualBanksStore])
  const [showAddBankAccountModal, setShowAddBankAccountModal] = useState(false)
  const [newBankForm, setNewBankForm] = useState({
    bankName: '',
    bankCode: '',
    country: 'Singapore',
    currency: 'SGD',
    accountNumber: '',
    accountName: '',
    statementFormat: 'MT940' as 'MT940' | 'CAMT.053' | 'CAMT.052' | 'BAI2' | 'CSV' | 'PDF',
  })
  const [addBankError, setAddBankError] = useState<string | null>(null)

  // Bank format form state
  const [bankForm, setBankForm] = useState({
    bankName: '',
    bankCode: '',
    country: 'Singapore',
    format: 'MT940' as 'MT940' | 'CAMT.053' | 'CAMT.052' | 'BAI2' | 'CSV' | 'PDF',
    version: '',
    sampleFile: null as File | null,
  })

  // PSP format form state
  const [pspForm, setPspForm] = useState({
    pspName: '',
    reportType: '',
    inputFormat: 'CSV' as 'CSV' | 'XLSX' | 'JSON' | 'XML' | 'API',
    sampleFile: null as File | null,
    fieldMappings: [] as { sourceField: string; canonicalField: string; transform: string }[],
  })

  // Handler: add a new bank account
  const handleAddBankAccount = () => {
    setAddBankError(null)
    if (!newBankForm.bankName.trim()) { setAddBankError('Bank name is required'); return }
    if (!newBankForm.accountName.trim()) { setAddBankError('Account name is required'); return }
    if (!newBankForm.accountNumber.trim()) { setAddBankError('Account number is required'); return }

    manualBankCounter++
    const newBank: ManualBankAccount = {
      id: `MB-${String(manualBankCounter).padStart(3, '0')}`,
      bankName: newBankForm.bankName.trim(),
      bankCode: newBankForm.bankCode.trim().toUpperCase() || 'N/A',
      country: newBankForm.country,
      currency: newBankForm.currency,
      accountNumber: newBankForm.accountNumber.trim(),
      accountName: newBankForm.accountName.trim(),
      statementFormat: newBankForm.statementFormat,
      addedAt: new Date().toISOString(),
      addedBy: 'Sarah Chen',
    }

    manualBanksStore.push(newBank)
    setManualBanks([...manualBanksStore])
    setShowAddBankAccountModal(false)
    setNewBankForm({
      bankName: '', bankCode: '', country: 'Singapore', currency: 'SGD',
      accountNumber: '', accountName: '', statementFormat: 'MT940',
    })
  }

  // Derived: selected bank format object
  const selectedBankFormat = bankStatementFormats.find(f => f.id === selectedBankFormatId) || null

  // ============================================================================
  // BANK STATEMENT PARSERS
  // ============================================================================

  /** Read file content as text */
  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsText(file)
    })
  }

  /** Read file content as ArrayBuffer (for PDF) */
  const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsArrayBuffer(file)
    })
  }

  /** Extract text from PDF using pdfjs-dist and parse into records */
  const parsePDFStatement = async (file: File): Promise<{ date: string; ref: string; amount: string; type: string; desc: string }[]> => {
    const pdfjsLib = await import('pdfjs-dist')

    // Set worker source
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString()

    const arrayBuffer = await readFileAsArrayBuffer(file)
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

    // ---- STEP 1: Extract structured rows (preserving column positions) ----
    type TextItem = { x: number; y: number; text: string; width: number }
    const allItems: TextItem[] = []

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()
      const pageItems = textContent.items as Array<{ str: string; transform: number[]; width: number }>

      // Page offset to keep Y values unique across pages (higher page = lower Y)
      const yOffset = (i - 1) * -10000

      for (const item of pageItems) {
        if (!item.str.trim()) continue
        allItems.push({
          x: Math.round(item.transform[4] * 10) / 10,
          y: Math.round((item.transform[5] + yOffset) * 10) / 10,
          text: item.str,
          width: item.width || item.str.length * 5
        })
      }
    }

    if (allItems.length === 0) throw new Error('No text could be extracted from PDF. The file may be scanned/image-based (OCR not supported).')

    // ---- STEP 2: Group items into rows by Y position (tolerance ±3px) ----
    const Y_TOLERANCE = 3
    allItems.sort((a, b) => b.y - a.y) // Sort top to bottom

    const rows: TextItem[][] = []
    let currentRow: TextItem[] = [allItems[0]]
    let currentY = allItems[0].y

    for (let i = 1; i < allItems.length; i++) {
      if (Math.abs(allItems[i].y - currentY) <= Y_TOLERANCE) {
        currentRow.push(allItems[i])
      } else {
        currentRow.sort((a, b) => a.x - b.x)
        rows.push(currentRow)
        currentRow = [allItems[i]]
        currentY = allItems[i].y
      }
    }
    if (currentRow.length) {
      currentRow.sort((a, b) => a.x - b.x)
      rows.push(currentRow)
    }

    // ---- STEP 3: Detect column layout from all rows ----
    // Collect all unique X positions across rows to find column boundaries
    const xPositions: number[] = []
    for (const row of rows) {
      for (const item of row) {
        xPositions.push(Math.round(item.x / 5) * 5) // Round to 5px grid
      }
    }

    // Build a full text line for each row for fallback parsing
    const buildLineText = (row: TextItem[]): string => {
      let text = ''
      let lastEnd = 0
      for (const item of row) {
        const gap = item.x - lastEnd
        if (text && gap > 20) text += '\t'
        else if (text && gap > 3) text += ' '
        text += item.text
        lastEnd = item.x + item.width
      }
      return text.trim()
    }

    // ---- STEP 4: Detect currency ----
    const fullText = rows.map(r => buildLineText(r)).join(' ')
    let currency = 'SGD'
    if (/\bIDR\b|Rupiah/i.test(fullText)) currency = 'IDR'
    else if (/\bMYR\b|Ringgit/i.test(fullText)) currency = 'MYR'
    else if (/\bUSD\b/i.test(fullText)) currency = 'USD'
    else if (/\bINR\b|Rupee/i.test(fullText)) currency = 'INR'
    else if (/\bSGD\b|Singapore/i.test(fullText)) currency = 'SGD'
    else if (/\bEUR\b/i.test(fullText)) currency = 'EUR'

    // ---- STEP 5: Identify column boundaries using header detection ----
    const dateRegex = /^(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}[\/-]\d{1,2}[\/-]\d{1,2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{2,4})$/i
    const dateStartRegex = /^(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}[\/-]\d{1,2}[\/-]\d{1,2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{2,4})/i
    const amountRegex = /^-?[\d,]+\.\d{2}$/

    // Find columns by analyzing item positions in transaction rows
    // A transaction row has: date (leftmost), then description, then amount(s) on the right
    let dateColX = -1
    let descColX = -1
    let amountColsX: number[] = []

    // Scan rows to find typical patterns
    for (const row of rows) {
      if (row.length < 3) continue
      const firstItem = row[0]
      if (dateStartRegex.test(firstItem.text.trim())) {
        dateColX = Math.round(firstItem.x / 5) * 5
        // Find amount items (rightmost numeric items)
        const amtItems = row.filter(item => amountRegex.test(item.text.replace(/[,\s]/g, '').trim()) || /^[\d,]+\.\d{2}$/.test(item.text.trim()))
        if (amtItems.length > 0) {
          amountColsX = amtItems.map(item => Math.round(item.x / 5) * 5).sort((a, b) => a - b)
          // Description is everything between date and first amount
          const nonDateNonAmount = row.filter(item =>
            !dateStartRegex.test(item.text.trim()) &&
            !amountRegex.test(item.text.trim()) &&
            item.x > firstItem.x + firstItem.width
          )
          if (nonDateNonAmount.length > 0) {
            descColX = Math.round(nonDateNonAmount[0].x / 5) * 5
          }
          break // Found a good reference row
        }
      }
    }

    // ---- STEP 6: Parse transaction rows using detected layout ----
    const records: { date: string; ref: string; amount: string; type: string; desc: string }[] = []

    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx]
      const lineText = buildLineText(row)

      // Check if this row starts with a date
      const firstText = row[0].text.trim()
      const dateMatch = firstText.match(dateStartRegex) || lineText.match(dateStartRegex)
      if (!dateMatch) continue

      const dateStr = dateMatch[1]

      // Find amounts in this row
      const amountItems: { value: number; x: number; text: string }[] = []
      for (const item of row) {
        const cleaned = item.text.trim().replace(/,/g, '')
        if (/^-?\d+\.\d{2}$/.test(cleaned)) {
          amountItems.push({ value: parseFloat(cleaned), x: item.x, text: item.text.trim() })
        }
      }

      if (amountItems.length === 0) continue // Not a transaction row

      // Extract description: all text items that are not the date and not amounts
      const descParts: string[] = []
      for (const item of row) {
        const t = item.text.trim()
        if (!t) continue
        // Skip date item(s)
        if (dateRegex.test(t) || t === dateStr) continue
        if (dateStartRegex.test(t) && item.x < (descColX > 0 ? descColX : 999)) continue
        // Skip amount items
        if (/^-?[\d,]+\.\d{2}$/.test(t.replace(/,/g, ''))) continue
        descParts.push(t)
      }

      // Collect continuation lines (lines after this that don't start with a date and have no amounts)
      for (let j = rowIdx + 1; j < rows.length; j++) {
        const nextRow = rows[j]
        const nextLine = buildLineText(nextRow)
        const nextFirst = nextRow[0].text.trim()
        // Stop if the next row starts with a date or is a header/separator
        if (dateStartRegex.test(nextFirst)) break
        if (/^-{3,}|^={3,}|^\*{3,}|^page\s/i.test(nextLine)) break
        // Stop if the next row has amounts (it's a new transaction without a date prefix)
        const hasAmounts = nextRow.some(item => /^-?[\d,]+\.\d{2}$/.test(item.text.trim().replace(/,/g, '')))
        if (hasAmounts) break
        // This is a continuation line — append to description
        if (nextLine.trim()) descParts.push(nextLine.trim())
      }

      let description = descParts.join(' ').replace(/\s{2,}/g, ' ').trim()

      // Normalize date
      let normalizedDate = dateStr
      try {
        // Handle DD/MM/YYYY, DD-MM-YYYY, etc.
        const parts = dateStr.split(/[\/-]/)
        if (parts.length === 3) {
          let d: Date
          if (parseInt(parts[0]) > 31) {
            // YYYY-MM-DD
            d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
          } else if (parseInt(parts[2]) > 31) {
            // DD/MM/YYYY
            d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]))
          } else {
            // Ambiguous — try as DD/MM/YY
            const yr = parseInt(parts[2]) < 80 ? 2000 + parseInt(parts[2]) : 1900 + parseInt(parts[2])
            d = new Date(yr, parseInt(parts[1]) - 1, parseInt(parts[0]))
          }
          if (!isNaN(d.getTime())) normalizedDate = d.toISOString().split('T')[0]
        } else {
          // "01 Jun 2026" style
          const d = new Date(dateStr)
          if (!isNaN(d.getTime())) normalizedDate = d.toISOString().split('T')[0]
        }
      } catch { /* keep original */ }

      // Determine amount and type
      let amount = 0
      let type = 'CR'

      if (amountItems.length >= 3) {
        // Typically: Debit | Credit | Balance
        const sortedByX = [...amountItems].sort((a, b) => a.x - b.x)
        const debit = sortedByX[0].value
        const credit = sortedByX[1].value
        if (credit > 0 && debit === 0) {
          amount = credit; type = 'CR'
        } else if (debit > 0 && credit === 0) {
          amount = debit; type = 'DR'
        } else if (debit > 0) {
          amount = debit; type = 'DR'
        } else {
          amount = credit; type = 'CR'
        }
      } else if (amountItems.length === 2) {
        const sortedByX = [...amountItems].sort((a, b) => a.x - b.x)
        // Could be: Amount + Balance, or Debit + Credit
        // If one is much larger (likely balance), take the smaller as transaction
        const val0 = sortedByX[0].value
        const val1 = sortedByX[1].value
        if (Math.abs(val1) > Math.abs(val0) * 5) {
          // Second value is likely balance
          amount = Math.abs(val0)
          type = val0 < 0 ? 'DR' : (/\bDR\b|\bDebit\b|\bWithdrawal\b/i.test(lineText) ? 'DR' : 'CR')
        } else {
          // Could be debit/credit columns
          amount = val0 > 0 ? val0 : val1
          type = /\bDR\b|\bDebit\b/i.test(lineText) ? 'DR' : 'CR'
        }
      } else {
        // Single amount
        amount = Math.abs(amountItems[0].value)
        if (amountItems[0].value < 0 || /\bDR\b|\bDebit\b|\bWithdrawal\b/i.test(lineText)) type = 'DR'
        else type = 'CR'
      }

      if (amount <= 0) continue

      // Extract reference from description
      const refMatch = description.match(/(?:Ref|TRF|UTR|RRN|Txn|Cheque|CHQ|NEFT|IMPS|RTGS|UPI)[:\s#]*([A-Z0-9\-\/]{4,})/i)
      const ref = refMatch ? refMatch[1].substring(0, 40) : `PDF-${records.length + 1}`

      records.push({
        date: normalizedDate,
        ref,
        amount: `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        type,
        desc: (description || 'N/A').substring(0, 120)
      })
    }

    if (records.length === 0) {
      // Fallback: try treating extracted text as CSV-like (tab-separated)
      const csvLikeText = rows.map(r => buildLineText(r)).join('\n')
      try {
        return parseCSVStatement(csvLikeText)
      } catch {
        throw new Error(`Extracted ${rows.length} text rows from PDF but could not identify transaction rows. The PDF may have a non-standard layout.`)
      }
    }

    return records
  }

  /** Parse CSV bank statement */
  const parseCSVStatement = (text: string): { date: string; ref: string; amount: string; type: string; desc: string }[] => {
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    if (lines.length < 2) throw new Error('CSV file has no data rows (only header or empty)')

    // Detect delimiter
    const firstLine = lines[0]
    let delimiter = ','
    if (firstLine.split('\t').length > firstLine.split(',').length) delimiter = '\t'
    else if (firstLine.split(';').length > firstLine.split(',').length) delimiter = ';'

    // Parse CSV with quoted field support
    const parseRow = (line: string): string[] => {
      const fields: string[] = []
      let current = ''
      let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (inQuotes) {
          if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
          else if (ch === '"') { inQuotes = false }
          else { current += ch }
        } else {
          if (ch === '"') { inQuotes = true }
          else if (ch === delimiter) { fields.push(current.trim()); current = '' }
          else { current += ch }
        }
      }
      fields.push(current.trim())
      return fields
    }

    const rows = lines.map(parseRow)
    const header = rows[0].map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''))
    const dataRows = rows.slice(1).filter(r => r.some(cell => cell.trim()))

    if (dataRows.length === 0) throw new Error('CSV file has no data rows after header')

    // Auto-detect columns by header name patterns
    const findCol = (patterns: string[]): number => {
      return header.findIndex(h => patterns.some(p => h.includes(p)))
    }

    const dateCol = findCol(['date', 'valuedate', 'bookingdate', 'txndate', 'transactiondate', 'postdate', 'postingdate'])
    const refCol = findCol(['ref', 'reference', 'transactionid', 'txnid', 'id', 'cheque', 'chequeno', 'utr', 'rrn'])
    const descCol = findCol(['desc', 'description', 'narration', 'narrative', 'particular', 'remark', 'detail', 'memo'])
    const amountCol = findCol(['amount', 'txnamount', 'transactionamount'])
    const debitCol = findCol(['debit', 'withdrawal', 'dr'])
    const creditCol = findCol(['credit', 'deposit', 'cr'])
    const balanceCol = findCol(['balance', 'runningbalance', 'closingbalance'])

    const records: { date: string; ref: string; amount: string; type: string; desc: string }[] = []

    for (const row of dataRows) {
      // Skip rows that are clearly not transactions
      if (row.length < 3) continue

      // Extract date
      let dateStr = dateCol >= 0 ? row[dateCol] : ''
      if (!dateStr) {
        // Try first column as date
        const first = row[0]
        if (/\d{1,4}[\-\/\.]\d{1,2}[\-\/\.]\d{1,4}/.test(first)) dateStr = first
      }

      // Normalize date
      if (dateStr) {
        try {
          const d = new Date(dateStr)
          if (!isNaN(d.getTime())) dateStr = d.toISOString().split('T')[0]
        } catch {
          // Keep original
        }
      }

      // Extract reference
      let ref = refCol >= 0 ? row[refCol] : ''
      if (!ref) ref = `ROW-${records.length + 1}`

      // Extract description
      let desc = descCol >= 0 ? row[descCol] : ''
      if (!desc) {
        // Fallback: concatenate non-numeric columns
        desc = row.filter((_, i) => i !== dateCol && i !== amountCol && i !== debitCol && i !== creditCol && i !== balanceCol && i !== refCol).join(' ').trim()
      }

      // Extract amount and type
      let amount = ''
      let type = ''

      if (debitCol >= 0 && creditCol >= 0) {
        const debitVal = row[debitCol].replace(/[^0-9.\-,]/g, '').replace(/,/g, '')
        const creditVal = row[creditCol].replace(/[^0-9.\-,]/g, '').replace(/,/g, '')
        const debitNum = parseFloat(debitVal)
        const creditNum = parseFloat(creditVal)

        if (!isNaN(creditNum) && creditNum > 0) {
          amount = creditNum.toLocaleString('en-US', { minimumFractionDigits: 2 })
          type = 'CR'
        } else if (!isNaN(debitNum) && debitNum > 0) {
          amount = debitNum.toLocaleString('en-US', { minimumFractionDigits: 2 })
          type = 'DR'
        } else {
          continue // Skip rows with no amounts
        }
      } else if (amountCol >= 0) {
        const raw = row[amountCol].replace(/[^0-9.\-,]/g, '').replace(/,/g, '')
        const num = parseFloat(raw)
        if (isNaN(num)) continue
        type = num >= 0 ? 'CR' : 'DR'
        amount = Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2 })
      } else {
        // Try to find a numeric column
        for (let i = 0; i < row.length; i++) {
          if (i === dateCol || i === refCol || i === descCol) continue
          const val = row[i].replace(/[^0-9.\-,]/g, '').replace(/,/g, '')
          const num = parseFloat(val)
          if (!isNaN(num) && Math.abs(num) > 0.01) {
            type = num >= 0 ? 'CR' : 'DR'
            amount = Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2 })
            break
          }
        }
        if (!amount) continue
      }

      // Detect currency from description or header
      const currency = selectedBankFormat?.country === 'Indonesia' ? 'IDR' :
                       selectedBankFormat?.country === 'Malaysia' ? 'MYR' : 'SGD'

      records.push({
        date: dateStr || 'N/A',
        ref: ref.substring(0, 40),
        amount: `${currency} ${amount}`,
        type,
        desc: desc.substring(0, 100) || 'N/A'
      })
    }

    if (records.length === 0) throw new Error('No valid transactions found. Check CSV column headers (expected: Date, Description, Amount/Debit/Credit)')

    return records
  }

  /** Parse MT940 bank statement */
  const parseMT940Statement = (text: string): { date: string; ref: string; amount: string; type: string; desc: string }[] => {
    const records: { date: string; ref: string; amount: string; type: string; desc: string }[] = []

    // Split into statement messages (each starts with :20:)
    const content = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

    // Detect currency from :60F: or :60M: opening balance tag
    let currency = 'SGD'
    const balMatch = content.match(/:6[02][FM]:[CD]\d{6}([A-Z]{3})/)
    if (balMatch) currency = balMatch[1]

    // Extract :61: transaction lines and :86: descriptions
    // :61: format: YYMMDD[MMDD][C|D|RC|RD][letter]amount,decimals[S|N|F]reference//bankref\n
    const lines = content.split('\n')
    let currentTxn: { date: string; ref: string; amount: string; type: string } | null = null
    let currentDesc = ''
    let collectingDesc = false

    const flushTxn = () => {
      if (currentTxn) {
        records.push({
          ...currentTxn,
          desc: currentDesc.trim().substring(0, 100) || 'N/A'
        })
      }
      currentTxn = null
      currentDesc = ''
      collectingDesc = false
    }

    for (const line of lines) {
      const trimmed = line.trim()

      if (trimmed.startsWith(':61:')) {
        flushTxn()
        // Parse :61: line
        const txnData = trimmed.substring(4)
        // Date: YYMMDD
        const dateStr = txnData.substring(0, 6)
        const year = parseInt(dateStr.substring(0, 2))
        const month = dateStr.substring(2, 4)
        const day = dateStr.substring(4, 6)
        const fullYear = year >= 80 ? 1900 + year : 2000 + year
        const formattedDate = `${fullYear}-${month}-${day}`

        // Skip optional entry date (MMDD)
        let pos = 6
        if (/^\d{4}/.test(txnData.substring(pos))) pos += 4

        // Debit/Credit indicator: C, D, RC, RD
        let type = 'CR'
        if (txnData[pos] === 'R') pos++ // Reversal prefix
        if (txnData[pos] === 'D') { type = 'DR'; pos++ }
        else if (txnData[pos] === 'C') { type = 'CR'; pos++ }

        // Optional fund code (single letter)
        if (/^[A-Z]/.test(txnData.substring(pos)) && !/^\d/.test(txnData.substring(pos))) pos++

        // Amount: digits with comma as decimal
        const amountMatch = txnData.substring(pos).match(/^(\d+[,.]?\d*)/)
        let amount = '0.00'
        if (amountMatch) {
          const rawAmount = amountMatch[1].replace(',', '.')
          amount = parseFloat(rawAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })
          pos += amountMatch[0].length
        }

        // Transaction type (S/N/F + 3 chars)
        const remaining = txnData.substring(pos)
        // Reference: everything after type code up to // or end
        let ref = ''
        const refMatch = remaining.match(/[SNF]\w{0,3}([^/]*)(?:\/\/(.*))?/)
        if (refMatch) {
          ref = (refMatch[2] || refMatch[1] || '').trim()
        }
        if (!ref) ref = remaining.replace(/[SNF]\w{0,3}/, '').replace(/\/\//g, ' ').trim()
        if (!ref) ref = `TXN-${records.length + 1}`

        currentTxn = {
          date: formattedDate,
          ref: ref.substring(0, 40),
          amount: `${currency} ${amount}`,
          type
        }
        collectingDesc = false
      } else if (trimmed.startsWith(':86:')) {
        // Description line
        currentDesc = trimmed.substring(4)
        collectingDesc = true
      } else if (collectingDesc && !trimmed.startsWith(':') && trimmed) {
        // Continuation of :86: description
        currentDesc += ' ' + trimmed
      } else if (trimmed.startsWith(':')) {
        // Any other tag ends description collection
        if (collectingDesc) flushTxn()
        collectingDesc = false
      }
    }

    // Flush last transaction
    flushTxn()

    if (records.length === 0) throw new Error('No :61: transaction entries found. Verify this is a valid MT940/SWIFT file')

    return records
  }

  /** Parse CAMT.053 XML statement */
  const parseCAMT053Statement = (text: string): { date: string; ref: string; amount: string; type: string; desc: string }[] => {
    const records: { date: string; ref: string; amount: string; type: string; desc: string }[] = []
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'application/xml')

    // Check for parse errors
    const parseError = doc.querySelector('parsererror')
    if (parseError) throw new Error('Invalid XML file: ' + parseError.textContent?.substring(0, 100))

    // Find all entry elements (Ntry) - handle namespace
    const entries = doc.querySelectorAll('Ntry') || []
    if (entries.length === 0) throw new Error('No <Ntry> (transaction entry) elements found in CAMT.053 file')

    // Try to detect currency from statement level
    let currency = 'SGD'
    const currEl = doc.querySelector('Bal Amt')
    if (currEl) currency = currEl.getAttribute('Ccy') || 'SGD'

    entries.forEach((entry, idx) => {
      // Amount
      const amtEl = entry.querySelector('Amt')
      const rawAmt = amtEl?.textContent || '0'
      const ccy = amtEl?.getAttribute('Ccy') || currency
      const amount = parseFloat(rawAmt).toLocaleString('en-US', { minimumFractionDigits: 2 })

      // Credit/Debit
      const cdtDbtInd = entry.querySelector('CdtDbtInd')?.textContent || 'CRDT'
      const type = cdtDbtInd === 'DBIT' ? 'DR' : 'CR'

      // Dates
      const valDate = entry.querySelector('ValDt Dt')?.textContent ||
                      entry.querySelector('BookgDt Dt')?.textContent || ''

      // Reference
      const entryRef = entry.querySelector('NtryRef')?.textContent || ''
      const endToEnd = entry.querySelector('EndToEndId')?.textContent || ''
      const acctSvcrRef = entry.querySelector('AcctSvcrRef')?.textContent || ''
      const ref = entryRef || endToEnd || acctSvcrRef || `ENTRY-${idx + 1}`

      // Description
      const ustrd = entry.querySelector('RmtInf Ustrd')?.textContent || ''
      const addtlInfo = entry.querySelector('AddtlNtryInf')?.textContent || ''
      const desc = ustrd || addtlInfo || 'N/A'

      records.push({
        date: valDate,
        ref: ref.substring(0, 40),
        amount: `${ccy} ${amount}`,
        type,
        desc: desc.substring(0, 100)
      })
    })

    return records
  }

  /** Main parse handler - reads file and dispatches to correct parser */
  const handleParseFile = async () => {
    if (!uploadFile) return
    setIsParsing(true)
    setUploadParseError(null)

    try {
      const ext = uploadFile.name.split('.').pop()?.toLowerCase() || ''
      const formatType = selectedBankFormat?.format || 'CSV'

      let records: { date: string; ref: string; amount: string; type: string; desc: string }[]

      if (ext === 'pdf' || formatType === 'PDF') {
        // PDF requires special handling (ArrayBuffer + pdfjs-dist)
        records = await parsePDFStatement(uploadFile)
      } else {
        const text = await readFileAsText(uploadFile)

        if (ext === 'xml' || formatType === 'CAMT.053' || formatType === 'CAMT.052') {
          records = parseCAMT053Statement(text)
        } else if (ext === 'csv') {
          records = parseCSVStatement(text)
        } else if (ext === 'sta' || ext === '940' || formatType === 'MT940' || formatType === 'BAI2') {
          // Try MT940 first, fallback to CSV
          try {
            records = parseMT940Statement(text)
          } catch {
            records = parseCSVStatement(text)
          }
        } else if (ext === 'txt') {
          // Detect: if file contains :20: tag, it's MT940; otherwise try CSV
          if (text.includes(':20:') || text.includes(':61:')) {
            records = parseMT940Statement(text)
          } else {
            records = parseCSVStatement(text)
          }
        } else {
          // Default: try CSV
          records = parseCSVStatement(text)
        }
      }

      setParsedRecords(records)
      setUploadStep('preview')
    } catch (err: any) {
      setUploadParseError(err.message || 'Failed to parse file')
    } finally {
      setIsParsing(false)
    }
  }

  console.log('[ConnectorStudio] Component rendered, connectors:', connectors.length)

  // Add spinner and pulse animation styles
  React.useEffect(() => {
    const style = document.createElement('style')
    style.textContent = `
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }
    `
    document.head.appendChild(style)
    return () => {
      document.head.removeChild(style)
    }
  }, [])

  // Fetch all connectors for filter dropdown (always fetch regardless of tab)
  useEffect(() => {
    console.log('[ConnectorStudio] Fetching all connectors for filters')
    const fetchAllConnectors = async () => {
      try {
        const data = await connectorsService.getConnectors({})
        setConnectors(data)
      } catch (error) {
        console.error('[ConnectorStudio] Failed to fetch all connectors:', error)
      }
    }
    fetchAllConnectors()
  }, [])

  // Fetch filtered connectors for connectors tab
  useEffect(() => {
    console.log('[ConnectorStudio] useEffect triggered for connectors tab')
    const fetchConnectors = async () => {
      setLoading(true)
      try {
        console.log('[ConnectorStudio] Fetching connectors...')
        const filters: any = {}
        if (selectedType !== 'all') filters.type = selectedType
        if (selectedStatus !== 'all') filters.status = selectedStatus
        if (searchQuery) filters.search = searchQuery

        const data = await connectorsService.getConnectors(filters)
        console.log('[ConnectorStudio] Fetched data:', data.length, 'connectors')
        setConnectors(data)
      } catch (error) {
        console.error('[ConnectorStudio] Failed to fetch connectors:', error)
      } finally {
        setLoading(false)
      }
    }

    if (activeTab === 'connectors') {
      fetchConnectors()
    }
  }, [activeTab, selectedType, selectedStatus, searchQuery])

  // Fetch execution runs for history tab
  useEffect(() => {
    console.log('[ConnectorStudio] useEffect triggered for history tab')
    const fetchExecutionRuns = async () => {
      setLoading(true)
      try {
        console.log('[ConnectorStudio] Fetching execution runs...')
        const filters: any = {}
        if (historyConnectorFilter !== 'all') filters.connectorId = historyConnectorFilter
        if (historyStatusFilter !== 'all') filters.status = historyStatusFilter

        // Convert date range to actual dates
        const now = new Date()
        if (historyDateRange === '7d') {
          const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          filters.dateFrom = from.toISOString()
        } else if (historyDateRange === '30d') {
          const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          filters.dateFrom = from.toISOString()
        } else if (historyDateRange === '90d') {
          const from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
          filters.dateFrom = from.toISOString()
        }

        const data = await connectorsService.getExecutionRuns(filters)
        console.log('[ConnectorStudio] Fetched data:', data.length, 'execution runs')
        setExecutionRuns(data)
      } catch (error) {
        console.error('[ConnectorStudio] Failed to fetch execution runs:', error)
      } finally {
        setLoading(false)
      }
    }

    if (activeTab === 'history') {
      fetchExecutionRuns()
    }
  }, [activeTab, historyConnectorFilter, historyStatusFilter, historyDateRange])

  // Group connectors by type
  const groupedConnectors = connectors.reduce((acc, connector) => {
    if (!acc[connector.type]) {
      acc[connector.type] = []
    }
    acc[connector.type].push(connector)
    return acc
  }, {} as Record<string, ConnectorConfig[]>)

  const getStatusColor = (status: ConnectorStatus) => {
    switch (status) {
      case 'active':
        return '#10B981'
      case 'inactive':
        return '#94A3B8'
      case 'error':
        return '#EF4444'
      case 'draft':
        return '#F59E0B'
      default:
        return '#64748B'
    }
  }

  const getStatusLabel = (status: ConnectorStatus) => {
    switch (status) {
      case 'active':
        return 'Connected'
      case 'inactive':
        return 'Inactive'
      case 'error':
        return 'Error'
      case 'draft':
        return 'Draft'
      default:
        return status
    }
  }

  const getTypeLabel = (type: ConnectorType) => {
    switch (type) {
      case 'psp':
        return 'PSP Integrations'
      case 'internal':
        return 'Internal Systems'
      case 'erp':
        return 'ERP Systems'
      default:
        return type
    }
  }

  const getProtocolLabel = (protocol: string) => {
    return protocol.toUpperCase()
  }

  const formatLastRun = (lastRunAt?: string) => {
    if (!lastRunAt) return 'Never'

    const now = new Date()
    const lastRun = new Date(lastRunAt)
    const diffMs = now.getTime() - lastRun.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  console.log('[ConnectorStudio] Rendering with', connectors.length, 'connectors, loading:', loading)

  const getExecutionStatusColor = (status: ExecutionStatus) => {
    switch (status) {
      case 'success':
        return '#10B981'
      case 'running':
        return '#3B82F6'
      case 'partial':
        return '#F59E0B'
      case 'failed':
        return '#EF4444'
      case 'cancelled':
        return '#64748B'
      default:
        return '#64748B'
    }
  }

  const getExecutionStatusLabel = (status: ExecutionStatus) => {
    switch (status) {
      case 'success':
        return 'Success'
      case 'running':
        return 'Running'
      case 'partial':
        return 'Partial'
      case 'failed':
        return 'Failed'
      case 'cancelled':
        return 'Cancelled'
      default:
        return status
    }
  }

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '—'
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  }

  return (
    <div style={{ marginTop: -24 }}>
      {/* Tab Navigation and Action Button Row */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', marginBottom: 16 }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0 }}>
          <button
            onClick={() => setActiveTab('connectors')}
            style={{
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 600,
              color: activeTab === 'connectors' ? '#0066CC' : '#64748B',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'connectors' ? '2px solid #0066CC' : '2px solid transparent',
              marginBottom: -1,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Connectors ({connectors.length})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            style={{
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 600,
              color: activeTab === 'history' ? '#0066CC' : '#64748B',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'history' ? '2px solid #0066CC' : '2px solid transparent',
              marginBottom: -1,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Reconciliation Job History
          </button>
          <button
            onClick={() => setActiveTab('formats')}
            style={{
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 600,
              color: activeTab === 'formats' ? '#0066CC' : '#64748B',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'formats' ? '2px solid #0066CC' : '2px solid transparent',
              marginBottom: -1,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Data Formats
          </button>
        </div>

        {/* Action Buttons */}
        {activeTab === 'connectors' && (
          <div style={{ marginBottom: 6, display: 'flex', gap: 8 }}>
            <button
              onClick={() => {
                // Open upload modal with bank selection
                setUploadConnector(null)
                setUploadFile(null)
                setUploadStep('select')
                setParsedRecords([])
                setUploadProgress(0)
                setSelectedBankFormatId(null)
                setUploadParseError(null)
                setShowUploadModal(true)
              }}
              style={{
                padding: '6px 12px',
                backgroundColor: '#059669',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              ↑ Upload Statement
            </button>
            <button
              onClick={() => {
                setShowNewConnectorModal(true)
                setNewConnectorStep('select-type')
                setSelectedConnectorType(null)
              }}
              style={{
                padding: '6px 12px',
                backgroundColor: '#0066CC',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + New Connector
            </button>
          </div>
        )}
      </div>

      {/* Connectors Tab Content */}
      {activeTab === 'connectors' && (
        <>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {/* Type Filter */}
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as ConnectorType | 'all')}
              style={{
                padding: '5px 8px',
                borderRadius: 4,
                border: '1px solid #CBD5E1',
                fontSize: 11,
                color: '#334155',
                backgroundColor: 'white',
                cursor: 'pointer',
              }}
            >
              <option value="all">All Types</option>
              <option value="psp">PSPs</option>
              <option value="internal">Internal</option>
              <option value="erp">ERP</option>
            </select>

            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as ConnectorStatus | 'all')}
              style={{
                padding: '5px 8px',
                borderRadius: 4,
                border: '1px solid #CBD5E1',
                fontSize: 11,
                color: '#334155',
                backgroundColor: 'white',
                cursor: 'pointer',
              }}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="error">Error</option>
              <option value="draft">Draft</option>
            </select>

            {/* Search */}
            <input
              type="text"
              placeholder="Search connectors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                padding: '5px 8px',
                borderRadius: 4,
                border: '1px solid #CBD5E1',
                fontSize: 11,
                color: '#334155',
                backgroundColor: 'white',
                width: 180,
              }}
            />
          </div>

          {/* Connector Groups */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <p style={{ fontSize: 11, color: '#64748B' }}>Loading connectors...</p>
            </div>
          ) : Object.keys(groupedConnectors).length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <p style={{ fontSize: 11, color: '#64748B' }}>No connectors found</p>
            </div>
          ) : (
            Object.entries(groupedConnectors).map(([type, connectorList]) => (
          <div key={type} style={{ marginBottom: 20 }}>
            {/* Group Header */}
            <div
              style={{
                padding: '6px 10px',
                borderBottom: '1px solid #E2E8F0',
                marginBottom: 10,
              }}
            >
              <h3 style={{ fontSize: 10, fontWeight: 600, color: '#64748B', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {getTypeLabel(type as ConnectorType)} ({connectorList.length})
              </h3>
            </div>

            {/* Connector Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 10 }}>
              {connectorList.map((connector) => (
                <div
                  key={connector.id}
                  onClick={() => setSelectedConnector(connector.id)}
                  style={{
                    backgroundColor: 'white',
                    border: '1px solid #E2E8F0',
                    borderRadius: 6,
                    padding: '10px 12px',
                    cursor: 'pointer',
                    transition: 'box-shadow 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    {/* Left: Connector Info */}
                    <div style={{ flex: 1 }}>
                      {/* Name and Status */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <div
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            backgroundColor: getStatusColor(connector.status),
                          }}
                        />
                        <h4 style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', margin: 0 }}>
                          {connector.name}
                        </h4>
                      </div>

                      {/* Description */}
                      <p style={{ fontSize: 10, color: '#64748B', margin: '2px 0 0 12px' }}>
                        {connector.description}
                      </p>

                      {/* Meta Info */}
                      <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 10, color: '#64748B', marginLeft: 12 }}>
                        <span>
                          Protocol: <strong style={{ color: '#334155' }}>{getProtocolLabel(connector.protocol)}</strong>
                        </span>
                        {connector.schedule.mode === 'scheduled' && (
                          <span>
                            Schedule: <strong style={{ color: '#334155' }}>
                              {connector.schedule.frequency === 'daily' && connector.schedule.runTimes && connector.schedule.runTimes.length > 0
                                ? `Daily ${connector.schedule.runTimes.join(', ')}`
                                : connector.schedule.frequency}
                            </strong>
                          </span>
                        )}
                        {connector.schedule.mode === 'realtime' && (
                          <span>
                            Mode: <strong style={{ color: '#334155' }}>Real-time</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: Status and Last Run */}
                    <div style={{ textAlign: 'right', minWidth: 80 }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: getStatusColor(connector.status),
                        }}
                      >
                        {getStatusLabel(connector.status)}
                      </span>
                      <div style={{ fontSize: 10, color: '#64748B', marginTop: 4 }}>
                        Last: {formatLastRun(connector.lastRunAt)}
                      </div>
                      {connector.successRate !== undefined && (
                        <div style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>
                          {connector.successRate.toFixed(1)}% success
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 8, borderTop: '1px solid #F1F5F9' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        console.log('Test connection:', connector.id)
                      }}
                      style={{
                        padding: '4px 10px',
                        fontSize: 10,
                        fontWeight: 600,
                        color: '#334155',
                        backgroundColor: 'white',
                        border: '1px solid #CBD5E1',
                        borderRadius: 4,
                        cursor: 'pointer',
                      }}
                    >
                      Test
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        console.log('Edit connector:', connector.id)
                      }}
                      style={{
                        padding: '4px 10px',
                        fontSize: 10,
                        fontWeight: 600,
                        color: '#334155',
                        backgroundColor: 'white',
                        border: '1px solid #CBD5E1',
                        borderRadius: 4,
                        cursor: 'pointer',
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                      }}
                      style={{
                        padding: '4px 10px',
                        fontSize: 10,
                        fontWeight: 600,
                        color: '#0066CC',
                        backgroundColor: 'white',
                        border: '1px solid #CBD5E1',
                        borderRadius: 4,
                        cursor: 'pointer',
                      }}
                    >
                      History
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        console.log('More options:', connector.id)
                      }}
                      style={{
                        padding: '4px 8px',
                        fontSize: 10,
                        fontWeight: 600,
                        color: '#334155',
                        backgroundColor: 'white',
                        border: '1px solid #CBD5E1',
                        borderRadius: 4,
                        cursor: 'pointer',
                      }}
                    >
                      ...
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
            ))
          )}
        </>
      )}

      {/* History Tab Content */}
      {activeTab === 'history' && (
        <>
          {/* History Filters */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {/* Connector Filter */}
            <select
              value={historyConnectorFilter}
              onChange={(e) => setHistoryConnectorFilter(e.target.value)}
              style={{
                padding: '5px 8px',
                borderRadius: 4,
                border: '1px solid #CBD5E1',
                fontSize: 11,
                color: '#334155',
                backgroundColor: 'white',
                cursor: 'pointer',
              }}
            >
              <option value="all">All Connectors</option>
              {connectors.map((conn) => (
                <option key={conn.id} value={conn.id}>
                  {conn.name}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={historyStatusFilter}
              onChange={(e) => setHistoryStatusFilter(e.target.value as ExecutionStatus | 'all')}
              style={{
                padding: '5px 8px',
                borderRadius: 4,
                border: '1px solid #CBD5E1',
                fontSize: 11,
                color: '#334155',
                backgroundColor: 'white',
                cursor: 'pointer',
              }}
            >
              <option value="all">All Status</option>
              <option value="success">Success</option>
              <option value="running">Running</option>
              <option value="partial">Partial</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>

            {/* Date Range Filter */}
            <select
              value={historyDateRange}
              onChange={(e) => setHistoryDateRange(e.target.value)}
              style={{
                padding: '5px 8px',
                borderRadius: 4,
                border: '1px solid #CBD5E1',
                fontSize: 11,
                color: '#334155',
                backgroundColor: 'white',
                cursor: 'pointer',
              }}
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
          </div>

          {/* Execution Runs Table */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <p style={{ fontSize: 11, color: '#64748B' }}>Loading execution history...</p>
            </div>
          ) : executionRuns.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <p style={{ fontSize: 11, color: '#64748B' }}>No execution runs found</p>
            </div>
          ) : (
            <div style={{ backgroundColor: 'white', borderRadius: 6, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>
                        Run ID
                      </th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>
                        Connector
                      </th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>
                        Start Time
                      </th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>
                        Duration
                      </th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>
                        Status
                      </th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>
                        Records
                      </th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>
                        Success
                      </th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>
                        Trigger
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {executionRuns.map((run) => (
                      <tr
                        key={run.id}
                        className="hover:bg-slate-50"
                        style={{
                          borderBottom: '1px solid #F1F5F9',
                          cursor: 'pointer',
                        }}
                      >
                        <td style={{ padding: '8px 10px', color: '#374151', fontFamily: 'monospace', fontSize: 10 }}>
                          {run.id}
                        </td>
                        <td style={{ padding: '8px 10px', color: '#374151', fontSize: 11, fontWeight: 500 }}>
                          {run.connectorName}
                        </td>
                        <td style={{ padding: '8px 10px', color: '#64748B', fontSize: 11 }}>
                          {new Date(run.startTime).toLocaleString('en-SG', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td style={{ padding: '8px 10px', fontSize: 11 }}>
                          {run.status === 'running' ? (
                            <span style={{ color: '#3B82F6', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span
                                style={{
                                  width: 5,
                                  height: 5,
                                  borderRadius: '50%',
                                  backgroundColor: '#3B82F6',
                                  animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                                }}
                              />
                              Running
                            </span>
                          ) : (
                            <span style={{ color: '#64748B' }}>{formatDuration(run.duration)}</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              color: getExecutionStatusColor(run.status),
                            }}
                          >
                            {getExecutionStatusLabel(run.status)}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 11 }}>
                          {run.status === 'running' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                              <span style={{ color: '#374151', fontWeight: 500 }}>
                                {run.stats.successfulRecords.toLocaleString()} / {run.stats.totalRecords.toLocaleString()}
                              </span>
                              <div style={{ width: 60, height: 3, backgroundColor: '#E2E8F0', borderRadius: 2, overflow: 'hidden' }}>
                                <div
                                  style={{
                                    width: `${(run.stats.successfulRecords / run.stats.totalRecords) * 100}%`,
                                    height: '100%',
                                    backgroundColor: '#3B82F6',
                                  }}
                                />
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: '#374151', fontWeight: 500 }}>
                              {run.stats.totalRecords.toLocaleString()}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 11 }}>
                          <span
                            style={{
                              color:
                                run.stats.totalRecords > 0
                                  ? (run.stats.successfulRecords / run.stats.totalRecords) * 100 >= 95
                                    ? '#10B981'
                                    : (run.stats.successfulRecords / run.stats.totalRecords) * 100 >= 80
                                    ? '#F59E0B'
                                    : '#EF4444'
                                  : '#64748B',
                              fontWeight: 500,
                            }}
                          >
                            {run.stats.totalRecords > 0
                              ? `${((run.stats.successfulRecords / run.stats.totalRecords) * 100).toFixed(1)}%`
                              : '—'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', color: '#64748B', textTransform: 'capitalize', fontSize: 11 }}>
                          {run.trigger.type}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Formats Tab Content */}
      {activeTab === 'formats' && (
        <>
          {/* Format Actions */}
          <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
            <button
              onClick={() => {
                setAddBankError(null)
                setNewBankForm({ bankName: '', bankCode: '', country: 'Singapore', currency: 'SGD', accountNumber: '', accountName: '', statementFormat: 'MT940' })
                setShowAddBankAccountModal(true)
              }}
              style={{
                padding: '6px 12px',
                backgroundColor: '#0066CC',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + Add Bank Account
            </button>
            <button
              onClick={() => setShowAddBankModal(true)}
              style={{
                padding: '6px 12px',
                backgroundColor: '#475569',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + Add Bank Format
            </button>
            <button
              onClick={() => setShowAddPSPModal(true)}
              style={{
                padding: '6px 12px',
                backgroundColor: '#059669',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + Add PSP Format
            </button>
          </div>

          {/* Registered Bank Accounts Table */}
          {manualBanks.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', marginBottom: 10 }}>Registered Bank Accounts</h3>
              <p style={{ fontSize: 10, color: '#64748B', marginBottom: 12 }}>Bank accounts manually registered in the system. These are available for statement uploads and reconciliation mapping.</p>
              <div style={{ borderRadius: 6, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#EFF6FF' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0' }}>Bank Name</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0' }}>SWIFT Code</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0' }}>Country</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0' }}>Currency</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0' }}>Account Name</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0' }}>Account No.</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0' }}>Format</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0' }}>Added</th>
                    </tr>
                  </thead>
                  <tbody>
                    {manualBanks.map((bank, idx) => (
                      <tr key={bank.id} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#FAFBFC', borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#0F172A' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 24, height: 24, borderRadius: 4, backgroundColor: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#1D4ED8' }}>{bank.bankName.substring(0, 2).toUpperCase()}</span>
                            </div>
                            {bank.bankName}
                          </div>
                        </td>
                        <td style={{ padding: '8px 10px', fontSize: 11, color: '#475569', fontFamily: 'monospace' }}>{bank.bankCode}</td>
                        <td style={{ padding: '8px 10px', fontSize: 11, color: '#475569' }}>{bank.country}</td>
                        <td style={{ padding: '8px 10px', fontSize: 11, color: '#475569' }}>
                          <span style={{ padding: '2px 6px', backgroundColor: '#F0FDF4', color: '#166534', borderRadius: 3, fontSize: 10, fontWeight: 600 }}>{bank.currency}</span>
                        </td>
                        <td style={{ padding: '8px 10px', fontSize: 11, color: '#475569' }}>{bank.accountName}</td>
                        <td style={{ padding: '8px 10px', fontSize: 11, color: '#475569', fontFamily: 'monospace' }}>****{bank.accountNumber.slice(-4)}</td>
                        <td style={{ padding: '8px 10px', fontSize: 11, color: '#475569' }}>
                          <span style={{ padding: '2px 6px', backgroundColor: '#F1F5F9', color: '#334155', borderRadius: 3, fontSize: 10, fontWeight: 500 }}>{bank.statementFormat}</span>
                        </td>
                        <td style={{ padding: '8px 10px', fontSize: 10, color: '#94A3B8' }}>
                          {new Date(bank.addedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Bank Statement Formats Table */}
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', marginBottom: 10 }}>Bank Statement Formats</h3>
            <p style={{ fontSize: 10, color: '#64748B', marginBottom: 12 }}>Configure parsing formats for manual bank statement uploads. Supports MT940, CAMT, CSV, and PDF extraction.</p>
            <div style={{ borderRadius: 6, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0' }}>Bank</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0' }}>Country</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0' }}>Format</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0' }}>Status</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0' }}>Last Parsed</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0' }}>Success Rate</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0' }}>Fields</th>
                  </tr>
                </thead>
                <tbody>
                  {bankStatementFormats.map((fmt, idx) => (
                    <tr key={fmt.id} style={{ borderBottom: idx < bankStatementFormats.length - 1 ? '1px solid #E2E8F0' : 'none' }}>
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#0F172A' }}>{fmt.bankName}</div>
                        <div style={{ fontSize: 9, color: '#64748B', fontFamily: 'monospace' }}>{fmt.bankCode}</div>
                      </td>
                      <td style={{ padding: '8px 10px', fontSize: 11, color: '#374151' }}>{fmt.country}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 6px',
                          backgroundColor: fmt.format === 'MT940' ? '#DBEAFE' : fmt.format === 'CAMT.053' ? '#D1FAE5' : fmt.format === 'CSV' ? '#FEF3C7' : '#F3E8FF',
                          color: fmt.format === 'MT940' ? '#1E40AF' : fmt.format === 'CAMT.053' ? '#065F46' : fmt.format === 'CSV' ? '#92400E' : '#6B21A8',
                          fontSize: 10,
                          fontWeight: 600,
                          borderRadius: 3,
                        }}>
                          {fmt.format}
                        </span>
                        {fmt.version && <span style={{ fontSize: 9, color: '#64748B', marginLeft: 4 }}>{fmt.version}</span>}
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 6px',
                          backgroundColor: fmt.status === 'active' ? '#D1FAE5' : fmt.status === 'testing' ? '#FEF3C7' : '#FEE2E2',
                          color: fmt.status === 'active' ? '#065F46' : fmt.status === 'testing' ? '#92400E' : '#991B1B',
                          fontSize: 9,
                          fontWeight: 600,
                          borderRadius: 10,
                          textTransform: 'uppercase',
                        }}>
                          {fmt.status}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', fontSize: 10, color: '#64748B' }}>
                        {fmt.lastParsed ? new Date(fmt.lastParsed).toLocaleString('en-SG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: fmt.parseSuccessRate >= 99 ? '#10B981' : fmt.parseSuccessRate >= 95 ? '#F59E0B' : '#EF4444',
                        }}>
                          {fmt.parseSuccessRate.toFixed(1)}%
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        <span style={{ fontSize: 10, color: '#64748B' }}>
                          {Object.values(fmt.fieldsMapping).filter(Boolean).length}/{Object.keys(fmt.fieldsMapping).length}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* PSP Report Formats Table */}
          <div>
            <h3 style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', marginBottom: 10 }}>PSP Report Formats</h3>
            <p style={{ fontSize: 10, color: '#64748B', marginBottom: 12 }}>Field mappings from PSP settlement reports to canonical reconciliation schema.</p>
            <div style={{ borderRadius: 6, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0' }}>PSP</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0' }}>Report Type</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0' }}>Input Format</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0' }}>Mapping Status</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0' }}>Status</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0' }}>Records</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0' }}>Fields</th>
                  </tr>
                </thead>
                <tbody>
                  {pspReportFormats.map((fmt, idx) => (
                    <tr key={fmt.id} style={{ borderBottom: idx < pspReportFormats.length - 1 ? '1px solid #E2E8F0' : 'none' }}>
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#0F172A' }}>{fmt.pspName}</div>
                      </td>
                      <td style={{ padding: '8px 10px', fontSize: 11, color: '#374151' }}>{fmt.reportType}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 6px',
                          backgroundColor: fmt.inputFormat === 'API' ? '#DBEAFE' : fmt.inputFormat === 'JSON' ? '#D1FAE5' : '#FEF3C7',
                          color: fmt.inputFormat === 'API' ? '#1E40AF' : fmt.inputFormat === 'JSON' ? '#065F46' : '#92400E',
                          fontSize: 10,
                          fontWeight: 600,
                          borderRadius: 3,
                        }}>
                          {fmt.inputFormat}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 6px',
                          backgroundColor: fmt.canonicalMapping === 'complete' ? '#D1FAE5' : fmt.canonicalMapping === 'partial' ? '#FEF3C7' : '#FEE2E2',
                          color: fmt.canonicalMapping === 'complete' ? '#065F46' : fmt.canonicalMapping === 'partial' ? '#92400E' : '#991B1B',
                          fontSize: 9,
                          fontWeight: 600,
                          borderRadius: 10,
                          textTransform: 'uppercase',
                        }}>
                          {fmt.canonicalMapping}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 6px',
                          backgroundColor: fmt.status === 'active' ? '#D1FAE5' : fmt.status === 'testing' ? '#FEF3C7' : '#FEE2E2',
                          color: fmt.status === 'active' ? '#065F46' : fmt.status === 'testing' ? '#92400E' : '#991B1B',
                          fontSize: 9,
                          fontWeight: 600,
                          borderRadius: 10,
                          textTransform: 'uppercase',
                        }}>
                          {fmt.status}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 11, color: '#374151', fontWeight: 500 }}>
                        {fmt.recordsProcessed.toLocaleString()}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        <span style={{
                          fontSize: 10,
                          color: fmt.mappedFields === fmt.totalFields ? '#10B981' : '#F59E0B',
                          fontWeight: 500,
                        }}>
                          {fmt.mappedFields}/{fmt.totalFields}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Selected Connector Modal Placeholder */}
      {selectedConnector && (
        <div
          className="bg-white/20 backdrop-blur-sm"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setSelectedConnector(null)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: 8,
              padding: 20,
              maxWidth: 400,
              width: '90%',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', marginBottom: 10 }}>
              Connector History
            </h3>
            <p style={{ fontSize: 11, color: '#64748B', marginBottom: 16 }}>
              Run history view will be implemented next.
            </p>
            <button
              onClick={() => setSelectedConnector(null)}
              style={{
                padding: '6px 14px',
                fontSize: 11,
                fontWeight: 600,
                color: 'white',
                backgroundColor: '#0066CC',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Add Bank Account Modal */}
      {showAddBankAccountModal && (
        <div
          className="bg-white/20 backdrop-blur-sm"
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowAddBankAccountModal(false)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: 8,
              maxWidth: 560,
              width: '95%',
              maxHeight: '85vh',
              overflow: 'auto',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', margin: 0 }}>Add Bank Account</h3>
                <p style={{ fontSize: 10, color: '#64748B', margin: '2px 0 0 0' }}>Register a bank account for statement uploads and reconciliation</p>
              </div>
              <button onClick={() => setShowAddBankAccountModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: 16 }}>×</button>
            </div>

            {/* Form */}
            <div style={{ padding: 16 }}>
              {/* Bank Details */}
              <div style={{ fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: 10 }}>Bank Details</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Bank Name <span style={{ color: '#DC2626' }}>*</span></label>
                  <input
                    type="text"
                    placeholder="e.g., DBS Bank"
                    value={newBankForm.bankName}
                    onChange={(e) => { setNewBankForm({ ...newBankForm, bankName: e.target.value }); setAddBankError(null) }}
                    style={{ width: '100%', padding: '7px 8px', fontSize: 11, border: '1px solid #CBD5E1', borderRadius: 4, boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>SWIFT/BIC Code</label>
                  <input
                    type="text"
                    placeholder="e.g., DBSSSGSG"
                    value={newBankForm.bankCode}
                    onChange={(e) => setNewBankForm({ ...newBankForm, bankCode: e.target.value.toUpperCase() })}
                    style={{ width: '100%', padding: '7px 8px', fontSize: 11, border: '1px solid #CBD5E1', borderRadius: 4, fontFamily: 'monospace', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Country <span style={{ color: '#DC2626' }}>*</span></label>
                  <select
                    value={newBankForm.country}
                    onChange={(e) => {
                      const country = e.target.value
                      const currencyMap: Record<string, string> = { 'Singapore': 'SGD', 'Indonesia': 'IDR', 'Malaysia': 'MYR', 'Thailand': 'THB', 'Vietnam': 'VND', 'Philippines': 'PHP', 'India': 'INR' }
                      setNewBankForm({ ...newBankForm, country, currency: currencyMap[country] || 'USD' })
                    }}
                    style={{ width: '100%', padding: '7px 8px', fontSize: 11, border: '1px solid #CBD5E1', borderRadius: 4, backgroundColor: 'white', boxSizing: 'border-box' }}
                  >
                    <option value="Singapore">Singapore</option>
                    <option value="Indonesia">Indonesia</option>
                    <option value="Malaysia">Malaysia</option>
                    <option value="Thailand">Thailand</option>
                    <option value="Vietnam">Vietnam</option>
                    <option value="Philippines">Philippines</option>
                    <option value="India">India</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Currency</label>
                  <input
                    type="text"
                    value={newBankForm.currency}
                    onChange={(e) => setNewBankForm({ ...newBankForm, currency: e.target.value.toUpperCase() })}
                    style={{ width: '100%', padding: '7px 8px', fontSize: 11, border: '1px solid #CBD5E1', borderRadius: 4, fontFamily: 'monospace', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* Account Details */}
              <div style={{ fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: 10 }}>Account Details</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Account Name <span style={{ color: '#DC2626' }}>*</span></label>
                  <input
                    type="text"
                    placeholder="e.g., Grab Singapore - Settlement"
                    value={newBankForm.accountName}
                    onChange={(e) => { setNewBankForm({ ...newBankForm, accountName: e.target.value }); setAddBankError(null) }}
                    style={{ width: '100%', padding: '7px 8px', fontSize: 11, border: '1px solid #CBD5E1', borderRadius: 4, boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Account Number <span style={{ color: '#DC2626' }}>*</span></label>
                  <input
                    type="text"
                    placeholder="e.g., 001-234567-890"
                    value={newBankForm.accountNumber}
                    onChange={(e) => { setNewBankForm({ ...newBankForm, accountNumber: e.target.value }); setAddBankError(null) }}
                    style={{ width: '100%', padding: '7px 8px', fontSize: 11, border: '1px solid #CBD5E1', borderRadius: 4, fontFamily: 'monospace', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* Statement Format */}
              <div style={{ fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: 10 }}>Statement Configuration</div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 10, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Expected Statement Format</label>
                <select
                  value={newBankForm.statementFormat}
                  onChange={(e) => setNewBankForm({ ...newBankForm, statementFormat: e.target.value as any })}
                  style={{ width: '100%', padding: '7px 8px', fontSize: 11, border: '1px solid #CBD5E1', borderRadius: 4, backgroundColor: 'white', boxSizing: 'border-box' }}
                >
                  <option value="MT940">MT940 (SWIFT)</option>
                  <option value="CAMT.053">CAMT.053 (ISO 20022)</option>
                  <option value="CAMT.052">CAMT.052 (ISO 20022)</option>
                  <option value="BAI2">BAI2</option>
                  <option value="CSV">CSV</option>
                  <option value="PDF">PDF</option>
                </select>
              </div>

              {/* Info Note */}
              <div style={{ backgroundColor: '#EFF6FF', borderRadius: 6, padding: 10, border: '1px solid #BFDBFE' }}>
                <p style={{ fontSize: 10, color: '#1E40AF', lineHeight: 1.5, margin: 0 }}>
                  This registers the bank account in the system for manual statement uploads and reconciliation. No automated bank integration is created.
                </p>
              </div>

              {/* Error */}
              {addBankError && (
                <div style={{ marginTop: 12, backgroundColor: '#FEF2F2', borderRadius: 4, padding: '8px 10px', border: '1px solid #FECACA' }}>
                  <p style={{ fontSize: 10, color: '#991B1B', margin: 0 }}>{addBankError}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 16px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                onClick={() => setShowAddBankAccountModal(false)}
                style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, color: '#64748B', backgroundColor: 'white', border: '1px solid #CBD5E1', borderRadius: 4, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddBankAccount}
                style={{ padding: '6px 16px', fontSize: 11, fontWeight: 600, color: 'white', backgroundColor: '#0066CC', border: 'none', borderRadius: 4, cursor: 'pointer' }}
              >
                Add Bank Account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Bank Format Modal */}
      {showAddBankModal && (
        <div
          className="bg-white/20 backdrop-blur-sm"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowAddBankModal(false)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: 8,
              maxWidth: 720,
              width: '95%',
              maxHeight: '85vh',
              overflow: 'auto',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', margin: 0 }}>Add Bank Statement Format</h3>
                <p style={{ fontSize: 10, color: '#64748B', margin: '2px 0 0 0' }}>Configure parsing and field mappings for a new bank statement format</p>
              </div>
              <button onClick={() => setShowAddBankModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: 16 }}>×</button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: 16 }}>
              {/* Step 1: Bank Details */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: 10 }}>Step 1: Bank Details</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Bank Name *</label>
                    <input
                      type="text"
                      placeholder="e.g., DBS Bank"
                      value={bankForm.bankName}
                      onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })}
                      style={{ width: '100%', padding: '6px 8px', fontSize: 11, border: '1px solid #CBD5E1', borderRadius: 4, boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>SWIFT/BIC Code *</label>
                    <input
                      type="text"
                      placeholder="e.g., DBSSSGSG"
                      value={bankForm.bankCode}
                      onChange={(e) => setBankForm({ ...bankForm, bankCode: e.target.value.toUpperCase() })}
                      style={{ width: '100%', padding: '6px 8px', fontSize: 11, border: '1px solid #CBD5E1', borderRadius: 4, fontFamily: 'monospace', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Country *</label>
                    <select
                      value={bankForm.country}
                      onChange={(e) => setBankForm({ ...bankForm, country: e.target.value })}
                      style={{ width: '100%', padding: '6px 8px', fontSize: 11, border: '1px solid #CBD5E1', borderRadius: 4, backgroundColor: 'white', boxSizing: 'border-box' }}
                    >
                      <option value="Singapore">Singapore</option>
                      <option value="Indonesia">Indonesia</option>
                      <option value="Malaysia">Malaysia</option>
                      <option value="Thailand">Thailand</option>
                      <option value="Vietnam">Vietnam</option>
                      <option value="Philippines">Philippines</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Statement Format *</label>
                    <select
                      value={bankForm.format}
                      onChange={(e) => setBankForm({ ...bankForm, format: e.target.value as any })}
                      style={{ width: '100%', padding: '6px 8px', fontSize: 11, border: '1px solid #CBD5E1', borderRadius: 4, backgroundColor: 'white', boxSizing: 'border-box' }}
                    >
                      <option value="MT940">MT940 (SWIFT)</option>
                      <option value="CAMT.053">CAMT.053 (ISO 20022)</option>
                      <option value="CAMT.052">CAMT.052 (ISO 20022)</option>
                      <option value="BAI2">BAI2</option>
                      <option value="CSV">CSV (Custom)</option>
                      <option value="PDF">PDF (OCR Required)</option>
                    </select>
                  </div>
                </div>
                {bankForm.format && (
                  <div style={{ marginTop: 10 }}>
                    <label style={{ fontSize: 10, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Format Version (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g., SRG 2020, ISO 20022"
                      value={bankForm.version}
                      onChange={(e) => setBankForm({ ...bankForm, version: e.target.value })}
                      style={{ width: '100%', padding: '6px 8px', fontSize: 11, border: '1px solid #CBD5E1', borderRadius: 4, boxSizing: 'border-box' }}
                    />
                  </div>
                )}
              </div>

              {/* Step 2: Upload Sample */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: 10 }}>Step 2: Upload Sample Statement</div>
                <div
                  style={{
                    border: '2px dashed #CBD5E1',
                    borderRadius: 6,
                    padding: 20,
                    textAlign: 'center',
                    backgroundColor: '#F8FAFC',
                    cursor: 'pointer',
                  }}
                  onClick={() => document.getElementById('bank-file-input')?.click()}
                >
                  <input
                    id="bank-file-input"
                    type="file"
                    accept={bankForm.format === 'CSV' ? '.csv' : bankForm.format === 'PDF' ? '.pdf' : '.txt,.sta,.940'}
                    style={{ display: 'none' }}
                    onChange={(e) => setBankForm({ ...bankForm, sampleFile: e.target.files?.[0] || null })}
                  />
                  {bankForm.sampleFile ? (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 500, color: '#10B981', marginBottom: 4 }}>File Selected</div>
                      <div style={{ fontSize: 10, color: '#374151', fontFamily: 'monospace' }}>{bankForm.sampleFile.name}</div>
                      <div style={{ fontSize: 9, color: '#64748B', marginTop: 4 }}>{(bankForm.sampleFile.size / 1024).toFixed(1)} KB</div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>Drop a sample statement file here or click to browse</div>
                      <div style={{ fontSize: 10, color: '#94A3B8' }}>
                        {bankForm.format === 'MT940' && 'Accepts .txt, .sta, .940 files'}
                        {bankForm.format === 'CAMT.053' && 'Accepts .xml files'}
                        {bankForm.format === 'CSV' && 'Accepts .csv files'}
                        {bankForm.format === 'PDF' && 'Accepts .pdf files'}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Step 3: Field Mapping Preview */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: 10 }}>Step 3: Field Mapping</div>
                <div style={{ backgroundColor: '#F8FAFC', borderRadius: 6, padding: 12, border: '1px solid #E2E8F0' }}>
                  {/* Header Row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 40px 1fr', gap: 8, marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#0369A1', textTransform: 'uppercase' }}>
                      {bankForm.format || 'Bank'} Fields
                    </div>
                    <div></div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#059669', textTransform: 'uppercase' }}>
                      Neoflo Fields
                    </div>
                  </div>

                  {/* Field Mapping Rows */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {/* Mapping based on format */}
                    {(bankForm.format === 'MT940' ? [
                      { source: ':20: Transaction Ref', target: 'transaction_reference', mapped: true },
                      { source: ':25: Account ID', target: 'bank_account_id', mapped: true },
                      { source: ':60F: Opening Balance', target: 'opening_balance', mapped: true },
                      { source: ':61: Statement Line', target: 'transaction_amount', mapped: true },
                      { source: ':61: Value Date (YYMMDD)', target: 'value_date', mapped: true },
                      { source: ':61: Entry Date (MMDD)', target: 'booking_date', mapped: true },
                      { source: ':61: Debit/Credit Mark', target: 'transaction_type', mapped: true },
                      { source: ':61: Reference', target: 'bank_reference', mapped: true },
                      { source: ':86: Description', target: 'narrative', mapped: true },
                      { source: ':62F: Closing Balance', target: 'closing_balance', mapped: true },
                    ] : bankForm.format === 'CAMT.053' ? [
                      { source: 'Stmt/Id', target: 'statement_id', mapped: true },
                      { source: 'Stmt/Acct/Id/IBAN', target: 'bank_account_id', mapped: true },
                      { source: 'Stmt/Bal/Amt (OPBD)', target: 'opening_balance', mapped: true },
                      { source: 'Ntry/Amt', target: 'transaction_amount', mapped: true },
                      { source: 'Ntry/ValDt/Dt', target: 'value_date', mapped: true },
                      { source: 'Ntry/BookgDt/Dt', target: 'booking_date', mapped: true },
                      { source: 'Ntry/CdtDbtInd', target: 'transaction_type', mapped: true },
                      { source: 'Ntry/NtryRef', target: 'bank_reference', mapped: true },
                      { source: 'Ntry/NtryDtls/TxDtls/Refs/EndToEndId', target: 'end_to_end_id', mapped: true },
                      { source: 'Ntry/NtryDtls/RmtInf/Ustrd', target: 'narrative', mapped: true },
                      { source: 'Stmt/Bal/Amt (CLBD)', target: 'closing_balance', mapped: true },
                    ] : bankForm.format === 'CSV' ? [
                      { source: 'Column A (Date)', target: 'value_date', mapped: false },
                      { source: 'Column B (Reference)', target: 'transaction_reference', mapped: false },
                      { source: 'Column C (Description)', target: 'narrative', mapped: false },
                      { source: 'Column D (Debit)', target: 'debit_amount', mapped: false },
                      { source: 'Column E (Credit)', target: 'credit_amount', mapped: false },
                      { source: 'Column F (Balance)', target: 'running_balance', mapped: false },
                      { source: 'Column G (Currency)', target: 'currency', mapped: false },
                    ] : [
                      { source: 'Transaction Reference', target: 'transaction_reference', mapped: true },
                      { source: 'Value Date', target: 'value_date', mapped: true },
                      { source: 'Booking Date', target: 'booking_date', mapped: true },
                      { source: 'Amount', target: 'transaction_amount', mapped: true },
                      { source: 'Currency', target: 'currency', mapped: true },
                      { source: 'Description', target: 'narrative', mapped: true },
                      { source: 'Bank Reference', target: 'bank_reference', mapped: true },
                      { source: 'Customer Reference', target: 'customer_reference', mapped: true },
                    ]).map((mapping, index) => (
                      <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 40px 1fr', gap: 8, alignItems: 'center' }}>
                        {/* Source Field (Bank) */}
                        <div style={{
                          padding: '6px 8px',
                          backgroundColor: '#DBEAFE',
                          borderRadius: 4,
                          border: '1px solid #93C5FD',
                          fontSize: 10,
                          fontFamily: 'monospace',
                          color: '#1E40AF',
                        }}>
                          {mapping.source}
                        </div>

                        {/* Arrow/Connector */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <div style={{
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            backgroundColor: mapping.mapped ? '#D1FAE5' : '#FEF3C7',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 10,
                            cursor: 'pointer',
                          }}>
                            {mapping.mapped ? '→' : '?'}
                          </div>
                        </div>

                        {/* Target Field (Neoflo) - Dropdown */}
                        <select
                          defaultValue={mapping.target}
                          style={{
                            padding: '6px 8px',
                            backgroundColor: mapping.mapped ? '#D1FAE5' : '#FEF9C3',
                            borderRadius: 4,
                            border: `1px solid ${mapping.mapped ? '#6EE7B7' : '#FCD34D'}`,
                            fontSize: 10,
                            fontFamily: 'monospace',
                            color: mapping.mapped ? '#065F46' : '#92400E',
                            cursor: 'pointer',
                          }}
                        >
                          <option value="">-- Select Field --</option>
                          <option value="transaction_reference">transaction_reference</option>
                          <option value="bank_account_id">bank_account_id</option>
                          <option value="value_date">value_date</option>
                          <option value="booking_date">booking_date</option>
                          <option value="transaction_amount">transaction_amount</option>
                          <option value="debit_amount">debit_amount</option>
                          <option value="credit_amount">credit_amount</option>
                          <option value="currency">currency</option>
                          <option value="transaction_type">transaction_type</option>
                          <option value="bank_reference">bank_reference</option>
                          <option value="customer_reference">customer_reference</option>
                          <option value="end_to_end_id">end_to_end_id</option>
                          <option value="narrative">narrative</option>
                          <option value="opening_balance">opening_balance</option>
                          <option value="closing_balance">closing_balance</option>
                          <option value="running_balance">running_balance</option>
                          <option value="statement_id">statement_id</option>
                          <option value="--ignore--">-- Ignore Field --</option>
                        </select>
                      </div>
                    ))}
                  </div>

                  {/* Legend */}
                  <div style={{ display: 'flex', gap: 16, marginTop: 12, paddingTop: 10, borderTop: '1px solid #E2E8F0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#D1FAE5', border: '1px solid #6EE7B7' }}></div>
                      <span style={{ fontSize: 9, color: '#64748B' }}>Auto-mapped</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#FEF9C3', border: '1px solid #FCD34D' }}></div>
                      <span style={{ fontSize: 9, color: '#64748B' }}>Needs mapping</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#DBEAFE', border: '1px solid #93C5FD' }}></div>
                      <span style={{ fontSize: 9, color: '#64748B' }}>Source field</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Info Box */}
              <div style={{ backgroundColor: '#EFF6FF', borderRadius: 6, padding: 10, border: '1px solid #BFDBFE', marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#1E40AF', marginBottom: 4 }}>What happens next?</div>
                <div style={{ fontSize: 10, color: '#1E40AF' }}>
                  1. Upload a sample file to auto-detect field positions<br />
                  2. Review and adjust field mappings<br />
                  3. Test parsing with sample data<br />
                  4. Activate the format for production use
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '12px 16px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                onClick={() => setShowAddBankModal(false)}
                style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, color: '#64748B', backgroundColor: 'white', border: '1px solid #CBD5E1', borderRadius: 4, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, color: '#334155', backgroundColor: 'white', border: '1px solid #CBD5E1', borderRadius: 4, cursor: 'pointer' }}
                >
                  Save as Draft
                </button>
                <button
                  disabled={!bankForm.bankName || !bankForm.bankCode}
                  style={{
                    padding: '6px 12px',
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'white',
                    backgroundColor: !bankForm.bankName || !bankForm.bankCode ? '#94A3B8' : '#0066CC',
                    border: 'none',
                    borderRadius: 4,
                    cursor: !bankForm.bankName || !bankForm.bankCode ? 'not-allowed' : 'pointer',
                  }}
                >
                  Parse Sample & Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Connector Modal */}
      {showNewConnectorModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowNewConnectorModal(false)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: 8,
              maxWidth: 720,
              width: '95%',
              maxHeight: '85vh',
              overflow: 'auto',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#0F172A', margin: 0 }}>
                  {newConnectorStep === 'select-type' ? 'Add New Connector' : `Configure ${selectedConnectorType === 'bank' ? 'Bank' : selectedConnectorType === 'psp' ? 'PSP' : selectedConnectorType === 'erp' ? 'ERP' : 'Internal'} Connector`}
                </h3>
                <p style={{ fontSize: 11, color: '#64748B', margin: '4px 0 0 0' }}>
                  {newConnectorStep === 'select-type' ? 'Select a connector type to get started' : 'Enter connection details and test connectivity'}
                </p>
              </div>
              <button
                onClick={() => setShowNewConnectorModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: 20, lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {/* Step 1: Select Connector Type */}
            {newConnectorStep === 'select-type' && (
              <div style={{ padding: 20 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                  {/* PSP Connector */}
                  <div
                    onClick={() => {
                      setSelectedConnectorType('psp')
                      setNewConnectorStep('configure')
                    }}
                    style={{
                      border: '1px solid #E2E8F0',
                      borderRadius: 8,
                      padding: 16,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#0066CC'; e.currentTarget.style.backgroundColor = '#F8FAFC' }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.backgroundColor = 'white' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 18 }}>💳</span>
                      </div>
                      <div>
                        <h4 style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', margin: 0 }}>PSP Integration</h4>
                        <p style={{ fontSize: 10, color: '#64748B', margin: '2px 0 0 0' }}>API, SFTP, or Portal Download</p>
                      </div>
                    </div>
                    <p style={{ fontSize: 11, color: '#64748B', lineHeight: 1.5, margin: 0 }}>
                      Connect to payment service providers to retrieve settlement reports, transaction data, and payout details.
                    </p>
                    <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 9, padding: '2px 6px', backgroundColor: '#F1F5F9', borderRadius: 3, color: '#64748B' }}>GrabPay</span>
                      <span style={{ fontSize: 9, padding: '2px 6px', backgroundColor: '#F1F5F9', borderRadius: 3, color: '#64748B' }}>Stripe</span>
                      <span style={{ fontSize: 9, padding: '2px 6px', backgroundColor: '#F1F5F9', borderRadius: 3, color: '#64748B' }}>Adyen</span>
                      <span style={{ fontSize: 9, padding: '2px 6px', backgroundColor: '#F1F5F9', borderRadius: 3, color: '#64748B' }}>OVO</span>
                      <span style={{ fontSize: 9, padding: '2px 6px', backgroundColor: '#F1F5F9', borderRadius: 3, color: '#64748B' }}>GoPay</span>
                      <span style={{ fontSize: 9, padding: '2px 6px', backgroundColor: '#F1F5F9', borderRadius: 3, color: '#64748B' }}>+20 more</span>
                    </div>
                  </div>

                  {/* Internal System Connector */}
                  <div
                    onClick={() => {
                      setSelectedConnectorType('internal')
                      setNewConnectorStep('configure')
                    }}
                    style={{
                      border: '1px solid #E2E8F0',
                      borderRadius: 8,
                      padding: 16,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#0066CC'; e.currentTarget.style.backgroundColor = '#F8FAFC' }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.backgroundColor = 'white' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 18 }}>🔗</span>
                      </div>
                      <div>
                        <h4 style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', margin: 0 }}>Internal System</h4>
                        <p style={{ fontSize: 10, color: '#64748B', margin: '2px 0 0 0' }}>Database, API, or Message Queue</p>
                      </div>
                    </div>
                    <p style={{ fontSize: 11, color: '#64748B', lineHeight: 1.5, margin: 0 }}>
                      Connect to your internal order management, inventory, or transaction systems for source data.
                    </p>
                    <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 9, padding: '2px 6px', backgroundColor: '#F1F5F9', borderRadius: 3, color: '#64748B' }}>OMS</span>
                      <span style={{ fontSize: 9, padding: '2px 6px', backgroundColor: '#F1F5F9', borderRadius: 3, color: '#64748B' }}>POS</span>
                      <span style={{ fontSize: 9, padding: '2px 6px', backgroundColor: '#F1F5F9', borderRadius: 3, color: '#64748B' }}>Warehouse</span>
                      <span style={{ fontSize: 9, padding: '2px 6px', backgroundColor: '#F1F5F9', borderRadius: 3, color: '#64748B' }}>CRM</span>
                      <span style={{ fontSize: 9, padding: '2px 6px', backgroundColor: '#F1F5F9', borderRadius: 3, color: '#64748B' }}>Custom API</span>
                    </div>
                  </div>

                  {/* ERP Connector */}
                  <div
                    onClick={() => {
                      setSelectedConnectorType('erp')
                      setNewConnectorStep('configure')
                    }}
                    style={{
                      border: '1px solid #E2E8F0',
                      borderRadius: 8,
                      padding: 16,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#0066CC'; e.currentTarget.style.backgroundColor = '#F8FAFC' }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.backgroundColor = 'white' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 18 }}>📊</span>
                      </div>
                      <div>
                        <h4 style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', margin: 0 }}>ERP System</h4>
                        <p style={{ fontSize: 10, color: '#64748B', margin: '2px 0 0 0' }}>SAP, Oracle, NetSuite, Workday</p>
                      </div>
                    </div>
                    <p style={{ fontSize: 11, color: '#64748B', lineHeight: 1.5, margin: 0 }}>
                      Connect to ERP systems to push journal entries, reconciled data, and financial reports.
                    </p>
                    <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 9, padding: '2px 6px', backgroundColor: '#F1F5F9', borderRadius: 3, color: '#64748B' }}>SAP S/4HANA</span>
                      <span style={{ fontSize: 9, padding: '2px 6px', backgroundColor: '#F1F5F9', borderRadius: 3, color: '#64748B' }}>Oracle EBS</span>
                      <span style={{ fontSize: 9, padding: '2px 6px', backgroundColor: '#F1F5F9', borderRadius: 3, color: '#64748B' }}>NetSuite</span>
                      <span style={{ fontSize: 9, padding: '2px 6px', backgroundColor: '#F1F5F9', borderRadius: 3, color: '#64748B' }}>Workday</span>
                    </div>
                  </div>

                  {/* Add Bank Account */}
                  <div
                    onClick={() => {
                      setShowNewConnectorModal(false)
                      setAddBankError(null)
                      setNewBankForm({
                        bankName: '', bankCode: '', country: 'Singapore', currency: 'SGD',
                        accountNumber: '', accountName: '', statementFormat: 'MT940',
                      })
                      setShowAddBankAccountModal(true)
                    }}
                    style={{
                      border: '1px solid #E2E8F0',
                      borderRadius: 8,
                      padding: 16,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#0066CC'; e.currentTarget.style.backgroundColor = '#F8FAFC' }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.backgroundColor = 'white' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 18 }}>🏦</span>
                      </div>
                      <div>
                        <h4 style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', margin: 0 }}>Add Bank Account</h4>
                        <p style={{ fontSize: 10, color: '#64748B', margin: '2px 0 0 0' }}>Register a bank in the system</p>
                      </div>
                    </div>
                    <p style={{ fontSize: 11, color: '#64748B', lineHeight: 1.5, margin: 0 }}>
                      Manually add bank account details. No integration required — just register the bank for statement uploads and reconciliation.
                    </p>
                    <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 9, padding: '2px 6px', backgroundColor: '#F1F5F9', borderRadius: 3, color: '#64748B' }}>{manualBanks.length} banks added</span>
                    </div>
                  </div>

                  {/* Manual Bank Statement Upload */}
                  <div
                    onClick={() => {
                      setShowNewConnectorModal(false)
                      setUploadConnector(null)
                      setUploadFile(null)
                      setUploadStep('select')
                      setParsedRecords([])
                      setUploadProgress(0)
                      setSelectedBankFormatId(null)
                      setUploadParseError(null)
                      setShowUploadModal(true)
                    }}
                    style={{
                      border: '1px solid #E2E8F0',
                      borderRadius: 8,
                      padding: 16,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#0066CC'; e.currentTarget.style.backgroundColor = '#F8FAFC' }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.backgroundColor = 'white' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 18 }}>📄</span>
                      </div>
                      <div>
                        <h4 style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', margin: 0 }}>Manual Bank Statement Upload</h4>
                        <p style={{ fontSize: 10, color: '#64748B', margin: '2px 0 0 0' }}>Upload & Extract Transactions</p>
                      </div>
                    </div>
                    <p style={{ fontSize: 11, color: '#64748B', lineHeight: 1.5, margin: 0 }}>
                      Upload bank statement files manually. Supports MT940, CAMT.053, and CSV formats with automatic field extraction.
                    </p>
                    <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 9, padding: '2px 6px', backgroundColor: '#DBEAFE', borderRadius: 3, color: '#1E40AF', fontWeight: 600 }}>MT940</span>
                      <span style={{ fontSize: 9, padding: '2px 6px', backgroundColor: '#D1FAE5', borderRadius: 3, color: '#065F46', fontWeight: 600 }}>CAMT.053</span>
                      <span style={{ fontSize: 9, padding: '2px 6px', backgroundColor: '#FEF3C7', borderRadius: 3, color: '#92400E', fontWeight: 600 }}>CSV</span>
                      <span style={{ fontSize: 9, padding: '2px 6px', backgroundColor: '#F1F5F9', borderRadius: 3, color: '#64748B' }}>PDF (OCR)</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Configure Connector */}
            {newConnectorStep === 'configure' && selectedConnectorType && (
              <div style={{ padding: 20 }}>
                {/* Connector Type Specific Configuration */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: 12 }}>Connection Details</div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Connector Name *</label>
                      <input
                        type="text"
                        placeholder={selectedConnectorType === 'bank' ? 'e.g., DBS Singapore' : selectedConnectorType === 'psp' ? 'e.g., GrabPay SG' : selectedConnectorType === 'erp' ? 'e.g., SAP Production' : 'e.g., Order Management System'}
                        style={{ width: '100%', padding: '8px 10px', fontSize: 11, border: '1px solid #CBD5E1', borderRadius: 4, boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>
                        {selectedConnectorType === 'bank' ? 'Bank' : selectedConnectorType === 'psp' ? 'PSP Provider' : selectedConnectorType === 'erp' ? 'ERP System' : 'System Type'} *
                      </label>
                      <select style={{ width: '100%', padding: '8px 10px', fontSize: 11, border: '1px solid #CBD5E1', borderRadius: 4, backgroundColor: 'white', boxSizing: 'border-box' }}>
                        {selectedConnectorType === 'bank' && (
                          <>
                            <option value="">Select Bank...</option>
                            <option value="dbs">DBS Bank</option>
                            <option value="ocbc">OCBC Bank</option>
                            <option value="uob">UOB</option>
                            <option value="bca">BCA</option>
                            <option value="mandiri">Bank Mandiri</option>
                            <option value="maybank">Maybank</option>
                            <option value="cimb">CIMB Bank</option>
                            <option value="other">Other...</option>
                          </>
                        )}
                        {selectedConnectorType === 'psp' && (
                          <>
                            <option value="">Select PSP...</option>
                            <option value="grabpay">GrabPay</option>
                            <option value="stripe">Stripe</option>
                            <option value="adyen">Adyen</option>
                            <option value="ovo">OVO</option>
                            <option value="gopay">GoPay</option>
                            <option value="doku">DOKU</option>
                            <option value="paypal">PayPal</option>
                            <option value="tng">Touch 'n Go</option>
                            <option value="other">Other...</option>
                          </>
                        )}
                        {selectedConnectorType === 'erp' && (
                          <>
                            <option value="">Select ERP...</option>
                            <option value="sap">SAP S/4HANA</option>
                            <option value="oracle">Oracle EBS</option>
                            <option value="netsuite">NetSuite</option>
                            <option value="workday">Workday</option>
                            <option value="dynamics">Microsoft Dynamics</option>
                            <option value="other">Other...</option>
                          </>
                        )}
                        {selectedConnectorType === 'internal' && (
                          <>
                            <option value="">Select System Type...</option>
                            <option value="oms">Order Management System</option>
                            <option value="pos">Point of Sale</option>
                            <option value="wms">Warehouse System</option>
                            <option value="crm">CRM</option>
                            <option value="database">Direct Database</option>
                            <option value="api">Custom API</option>
                            <option value="other">Other...</option>
                          </>
                        )}
                      </select>
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <label style={{ fontSize: 10, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Protocol *</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {selectedConnectorType === 'bank' && ['SFTP', 'API', 'H2H'].map((p) => (
                        <button
                          key={p}
                          style={{
                            padding: '6px 14px',
                            fontSize: 10,
                            fontWeight: 600,
                            color: '#64748B',
                            backgroundColor: 'white',
                            border: '1px solid #CBD5E1',
                            borderRadius: 4,
                            cursor: 'pointer',
                          }}
                        >
                          {p}
                        </button>
                      ))}
                      {selectedConnectorType === 'psp' && ['API', 'SFTP', 'Webhook'].map((p) => (
                        <button
                          key={p}
                          style={{
                            padding: '6px 14px',
                            fontSize: 10,
                            fontWeight: 600,
                            color: '#64748B',
                            backgroundColor: 'white',
                            border: '1px solid #CBD5E1',
                            borderRadius: 4,
                            cursor: 'pointer',
                          }}
                        >
                          {p}
                        </button>
                      ))}
                      {selectedConnectorType === 'erp' && ['API', 'BAPI', 'RFC', 'File'].map((p) => (
                        <button
                          key={p}
                          style={{
                            padding: '6px 14px',
                            fontSize: 10,
                            fontWeight: 600,
                            color: '#64748B',
                            backgroundColor: 'white',
                            border: '1px solid #CBD5E1',
                            borderRadius: 4,
                            cursor: 'pointer',
                          }}
                        >
                          {p}
                        </button>
                      ))}
                      {selectedConnectorType === 'internal' && ['API', 'Database', 'Kafka', 'File'].map((p) => (
                        <button
                          key={p}
                          style={{
                            padding: '6px 14px',
                            fontSize: 10,
                            fontWeight: 600,
                            color: '#64748B',
                            backgroundColor: 'white',
                            border: '1px solid #CBD5E1',
                            borderRadius: 4,
                            cursor: 'pointer',
                          }}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Connection Settings */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: 12 }}>Connection Settings</div>

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Host / Endpoint URL *</label>
                      <input
                        type="text"
                        placeholder="e.g., sftp.bank.com or https://api.psp.com/v1"
                        style={{ width: '100%', padding: '8px 10px', fontSize: 11, border: '1px solid #CBD5E1', borderRadius: 4, fontFamily: 'monospace', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Port</label>
                      <input
                        type="text"
                        placeholder="e.g., 22, 443"
                        style={{ width: '100%', padding: '8px 10px', fontSize: 11, border: '1px solid #CBD5E1', borderRadius: 4, fontFamily: 'monospace', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Username / API Key *</label>
                      <input
                        type="text"
                        placeholder="Enter username or API key"
                        style={{ width: '100%', padding: '8px 10px', fontSize: 11, border: '1px solid #CBD5E1', borderRadius: 4, boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Password / Secret *</label>
                      <input
                        type="password"
                        placeholder="Enter password or API secret"
                        style={{ width: '100%', padding: '8px 10px', fontSize: 11, border: '1px solid #CBD5E1', borderRadius: 4, boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>

                  {selectedConnectorType === 'bank' && (
                    <div style={{ marginTop: 12 }}>
                      <label style={{ fontSize: 10, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Remote Directory Path</label>
                      <input
                        type="text"
                        placeholder="e.g., /outgoing/statements/"
                        style={{ width: '100%', padding: '8px 10px', fontSize: 11, border: '1px solid #CBD5E1', borderRadius: 4, fontFamily: 'monospace', boxSizing: 'border-box' }}
                      />
                    </div>
                  )}
                </div>

                {/* Schedule Settings */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: 12 }}>Schedule</div>

                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    {['Scheduled', 'Real-time', 'Manual'].map((mode) => (
                      <button
                        key={mode}
                        style={{
                          padding: '6px 14px',
                          fontSize: 10,
                          fontWeight: 600,
                          color: mode === 'Scheduled' ? '#0066CC' : '#64748B',
                          backgroundColor: mode === 'Scheduled' ? '#EBF5FF' : 'white',
                          border: mode === 'Scheduled' ? '1px solid #0066CC' : '1px solid #CBD5E1',
                          borderRadius: 4,
                          cursor: 'pointer',
                        }}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Frequency</label>
                      <select style={{ width: '100%', padding: '8px 10px', fontSize: 11, border: '1px solid #CBD5E1', borderRadius: 4, backgroundColor: 'white', boxSizing: 'border-box' }}>
                        <option value="daily">Daily</option>
                        <option value="hourly">Hourly</option>
                        <option value="every_6h">Every 6 hours</option>
                        <option value="every_12h">Every 12 hours</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Run Time (SGT)</label>
                      <input
                        type="text"
                        placeholder="e.g., 06:00, 18:00"
                        style={{ width: '100%', padding: '8px 10px', fontSize: 11, border: '1px solid #CBD5E1', borderRadius: 4, boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Test Connection */}
                <div style={{ backgroundColor: '#F8FAFC', borderRadius: 6, padding: 12, border: '1px solid #E2E8F0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>Test Connection</div>
                      <div style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>Verify connectivity before saving</div>
                    </div>
                    <button
                      style={{
                        padding: '6px 14px',
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#0066CC',
                        backgroundColor: 'white',
                        border: '1px solid #0066CC',
                        borderRadius: 4,
                        cursor: 'pointer',
                      }}
                    >
                      Test Connection
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Modal Footer */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                onClick={() => {
                  if (newConnectorStep === 'configure') {
                    setNewConnectorStep('select-type')
                    setSelectedConnectorType(null)
                  } else {
                    setShowNewConnectorModal(false)
                  }
                }}
                style={{ padding: '8px 14px', fontSize: 11, fontWeight: 600, color: '#64748B', backgroundColor: 'white', border: '1px solid #CBD5E1', borderRadius: 4, cursor: 'pointer' }}
              >
                {newConnectorStep === 'configure' ? '← Back' : 'Cancel'}
              </button>
              {newConnectorStep === 'configure' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    style={{ padding: '8px 14px', fontSize: 11, fontWeight: 600, color: '#334155', backgroundColor: 'white', border: '1px solid #CBD5E1', borderRadius: 4, cursor: 'pointer' }}
                  >
                    Save as Draft
                  </button>
                  <button
                    style={{
                      padding: '8px 14px',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'white',
                      backgroundColor: '#0066CC',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    Create Connector
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add PSP Format Modal */}
      {showAddPSPModal && (
        <div
          className="bg-white/20 backdrop-blur-sm"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowAddPSPModal(false)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: 8,
              maxWidth: 600,
              width: '95%',
              maxHeight: '85vh',
              overflow: 'auto',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', margin: 0 }}>Add PSP Report Format</h3>
                <p style={{ fontSize: 10, color: '#64748B', margin: '2px 0 0 0' }}>Map PSP settlement report fields to canonical format</p>
              </div>
              <button onClick={() => setShowAddPSPModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: 16 }}>×</button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: 16 }}>
              {/* Step 1: PSP Details */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: 10 }}>Step 1: PSP Details</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>PSP Name *</label>
                    <input
                      type="text"
                      placeholder="e.g., GrabPay, Stripe, OVO"
                      value={pspForm.pspName}
                      onChange={(e) => setPspForm({ ...pspForm, pspName: e.target.value })}
                      style={{ width: '100%', padding: '6px 8px', fontSize: 11, border: '1px solid #CBD5E1', borderRadius: 4, boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Report Type *</label>
                    <input
                      type="text"
                      placeholder="e.g., Settlement Report, Payout Detail"
                      value={pspForm.reportType}
                      onChange={(e) => setPspForm({ ...pspForm, reportType: e.target.value })}
                      style={{ width: '100%', padding: '6px 8px', fontSize: 11, border: '1px solid #CBD5E1', borderRadius: 4, boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ fontSize: 10, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Input Format *</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {(['CSV', 'XLSX', 'JSON', 'XML', 'API'] as const).map((fmt) => (
                        <button
                          key={fmt}
                          onClick={() => setPspForm({ ...pspForm, inputFormat: fmt })}
                          style={{
                            padding: '6px 14px',
                            fontSize: 10,
                            fontWeight: 600,
                            color: pspForm.inputFormat === fmt ? '#0066CC' : '#64748B',
                            backgroundColor: pspForm.inputFormat === fmt ? '#EBF5FF' : 'white',
                            border: pspForm.inputFormat === fmt ? '1px solid #0066CC' : '1px solid #CBD5E1',
                            borderRadius: 4,
                            cursor: 'pointer',
                          }}
                        >
                          {fmt}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 2: Upload Sample */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: 10 }}>Step 2: Upload Sample Report</div>
                <div
                  style={{
                    border: '2px dashed #CBD5E1',
                    borderRadius: 6,
                    padding: 20,
                    textAlign: 'center',
                    backgroundColor: '#F8FAFC',
                    cursor: 'pointer',
                  }}
                  onClick={() => document.getElementById('psp-file-input')?.click()}
                >
                  <input
                    id="psp-file-input"
                    type="file"
                    accept={pspForm.inputFormat === 'CSV' ? '.csv' : pspForm.inputFormat === 'XLSX' ? '.xlsx,.xls' : pspForm.inputFormat === 'JSON' ? '.json' : pspForm.inputFormat === 'XML' ? '.xml' : '*'}
                    style={{ display: 'none' }}
                    onChange={(e) => setPspForm({ ...pspForm, sampleFile: e.target.files?.[0] || null })}
                  />
                  {pspForm.sampleFile ? (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 500, color: '#10B981', marginBottom: 4 }}>File Selected</div>
                      <div style={{ fontSize: 10, color: '#374151', fontFamily: 'monospace' }}>{pspForm.sampleFile.name}</div>
                      <div style={{ fontSize: 9, color: '#64748B', marginTop: 4 }}>{(pspForm.sampleFile.size / 1024).toFixed(1)} KB</div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>Drop a sample {pspForm.inputFormat} report here or click to browse</div>
                      <div style={{ fontSize: 10, color: '#94A3B8' }}>We'll auto-detect column headers and suggest field mappings</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Step 3: Field Mapping */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: 10 }}>Step 3: Map to Canonical Format</div>
                <div style={{ backgroundColor: 'white', borderRadius: 6, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 9, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Canonical Field</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 9, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Source Column</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 9, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Transform</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: 9, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', width: 60 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { canonical: 'transaction_id', source: '', transform: '', required: true },
                        { canonical: 'order_id', source: '', transform: '', required: true },
                        { canonical: 'gross_amount', source: '', transform: '', required: true },
                        { canonical: 'mdr_fee', source: '', transform: '', required: true },
                        { canonical: 'tax_on_mdr', source: '', transform: '', required: false },
                        { canonical: 'fx_margin', source: '', transform: '', required: false },
                        { canonical: 'net_amount', source: '', transform: '', required: true },
                        { canonical: 'currency', source: '', transform: '', required: true },
                        { canonical: 'transaction_date', source: '', transform: '', required: true },
                      ].map((mapping, idx) => (
                        <tr key={mapping.canonical} style={{ borderBottom: idx < 8 ? '1px solid #F1F5F9' : 'none' }}>
                          <td style={{ padding: '6px 10px' }}>
                            <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#374151' }}>{mapping.canonical}</span>
                            {mapping.required && <span style={{ color: '#EF4444', marginLeft: 2 }}>*</span>}
                          </td>
                          <td style={{ padding: '6px 10px' }}>
                            <input
                              type="text"
                              placeholder="Select or type column name"
                              style={{ width: '100%', padding: '4px 6px', fontSize: 10, border: '1px solid #E2E8F0', borderRadius: 3, boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '6px 10px' }}>
                            <input
                              type="text"
                              placeholder="e.g., divide by 100"
                              style={{ width: '100%', padding: '4px 6px', fontSize: 10, border: '1px solid #E2E8F0', borderRadius: 3, boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                            <span style={{ fontSize: 9, color: '#94A3B8' }}>Pending</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: 8, fontSize: 10, color: '#64748B' }}>
                  <span style={{ color: '#EF4444' }}>*</span> Required fields for reconciliation
                </div>
              </div>

              {/* Info Box */}
              <div style={{ backgroundColor: '#F0FDF4', borderRadius: 6, padding: 10, border: '1px solid #BBF7D0' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#166534', marginBottom: 4 }}>Canonical Format Benefits</div>
                <div style={{ fontSize: 10, color: '#166534' }}>
                  Mapping PSP reports to a canonical format enables:<br />
                  • Unified reconciliation across all PSPs<br />
                  • Consistent variance calculations<br />
                  • Automated exception detection
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '12px 16px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                onClick={() => setShowAddPSPModal(false)}
                style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, color: '#64748B', backgroundColor: 'white', border: '1px solid #CBD5E1', borderRadius: 4, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, color: '#334155', backgroundColor: 'white', border: '1px solid #CBD5E1', borderRadius: 4, cursor: 'pointer' }}
                >
                  Save as Draft
                </button>
                <button
                  disabled={!pspForm.pspName || !pspForm.reportType}
                  style={{
                    padding: '6px 12px',
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'white',
                    backgroundColor: !pspForm.pspName || !pspForm.reportType ? '#94A3B8' : '#0066CC',
                    border: 'none',
                    borderRadius: 4,
                    cursor: !pspForm.pspName || !pspForm.reportType ? 'not-allowed' : 'pointer',
                  }}
                >
                  Detect Fields & Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Upload Modal */}
      {showUploadModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowUploadModal(false)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: 8,
              maxWidth: 640,
              width: '95%',
              maxHeight: '85vh',
              overflow: 'auto',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', margin: 0 }}>
                  Manual Upload {uploadConnector ? `- ${uploadConnector.name}` : '- Bank Statement'}
                </h3>
                <p style={{ fontSize: 10, color: '#64748B', margin: '2px 0 0 0' }}>
                  Upload a bank statement file for manual processing
                </p>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: 18, lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: 16 }}>
              {/* Step Indicator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                {[
                  { key: 'select', label: '1. Select File' },
                  { key: 'preview', label: '2. Preview' },
                  { key: 'processing', label: '3. Processing' },
                ].map((step, idx) => (
                  <React.Fragment key={step.key}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '4px 10px',
                        borderRadius: 16,
                        backgroundColor:
                          uploadStep === step.key ? '#DBEAFE' :
                          (uploadStep === 'success' || uploadStep === 'error') && idx < 3 ? '#D1FAE5' :
                          uploadStep === 'preview' && idx === 0 ? '#D1FAE5' :
                          uploadStep === 'processing' && idx < 2 ? '#D1FAE5' :
                          '#F1F5F9',
                        color:
                          uploadStep === step.key ? '#1D4ED8' :
                          (uploadStep === 'success' || uploadStep === 'error') && idx < 3 ? '#059669' :
                          uploadStep === 'preview' && idx === 0 ? '#059669' :
                          uploadStep === 'processing' && idx < 2 ? '#059669' :
                          '#64748B',
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    >
                      {((uploadStep === 'preview' && idx === 0) ||
                        (uploadStep === 'processing' && idx < 2) ||
                        ((uploadStep === 'success' || uploadStep === 'error') && idx < 3)) ? '✓' : ''} {step.label}
                    </div>
                    {idx < 2 && <div style={{ width: 20, height: 1, backgroundColor: '#CBD5E1' }} />}
                  </React.Fragment>
                ))}
              </div>

              {/* Step 1: Select File */}
              {uploadStep === 'select' && (
                <div>
                  {/* Bank Format Selector */}
                  {!selectedBankFormat && (
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ fontSize: 10, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Select Bank Statement Format *</label>
                      <select
                        onChange={(e) => {
                          setSelectedBankFormatId(e.target.value || null)
                          setUploadParseError(null)
                        }}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          fontSize: 12,
                          border: '1px solid #CBD5E1',
                          borderRadius: 6,
                          backgroundColor: 'white',
                          cursor: 'pointer',
                        }}
                        defaultValue=""
                      >
                        <option value="" disabled>-- Select a bank format --</option>
                        {bankStatementFormats.map(fmt => (
                          <option key={fmt.id} value={fmt.id}>
                            {fmt.bankName} — {fmt.format}{fmt.version ? ` (${fmt.version})` : ''} — {fmt.country}
                          </option>
                        ))}
                        <option value="auto">Auto-Detect (unknown bank)</option>
                      </select>
                    </div>
                  )}

                  {/* Selected Bank Format Info */}
                  {selectedBankFormat && (
                  <div style={{ backgroundColor: '#F8FAFC', borderRadius: 6, padding: 12, border: '1px solid #E2E8F0', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Selected Bank Format</span>
                      <button
                        onClick={() => { setSelectedBankFormatId(null); setUploadParseError(null) }}
                        style={{ fontSize: 10, color: '#0066CC', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        Change
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                      <div>
                        <p style={{ fontSize: 9, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: 2 }}>Bank</p>
                        <p style={{ fontSize: 11, fontWeight: 600, color: '#0F172A' }}>{selectedBankFormat.bankName}</p>
                        <p style={{ fontSize: 9, color: '#64748B', fontFamily: 'monospace' }}>{selectedBankFormat.bankCode}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: 9, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: 2 }}>Format</p>
                        <p style={{ fontSize: 11, fontWeight: 600, color: '#0F172A' }}>{selectedBankFormat.format}</p>
                        {selectedBankFormat.version && <p style={{ fontSize: 9, color: '#64748B' }}>{selectedBankFormat.version}</p>}
                      </div>
                      <div>
                        <p style={{ fontSize: 9, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: 2 }}>Country</p>
                        <p style={{ fontSize: 11, fontWeight: 600, color: '#0F172A' }}>{selectedBankFormat.country}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: 9, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: 2 }}>Parse Rate</p>
                        <p style={{ fontSize: 11, fontWeight: 600, color: selectedBankFormat.parseSuccessRate >= 99 ? '#10B981' : '#F59E0B' }}>{selectedBankFormat.parseSuccessRate}%</p>
                      </div>
                    </div>
                  </div>
                  )}

                  {/* Auto-detect mode info */}
                  {selectedBankFormatId === 'auto' && (
                  <div style={{ backgroundColor: '#EFF6FF', borderRadius: 6, padding: 12, border: '1px solid #BFDBFE', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: '#1E40AF' }}>Auto-Detect Mode</span>
                      <button
                        onClick={() => { setSelectedBankFormatId(null); setUploadParseError(null) }}
                        style={{ fontSize: 10, color: '#0066CC', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        Change
                      </button>
                    </div>
                    <p style={{ fontSize: 10, color: '#1E40AF', lineHeight: 1.5 }}>
                      Format will be detected from file extension and content. Supports MT940 (.txt, .sta, .940), CAMT.053 (.xml), and CSV (.csv) files.
                    </p>
                  </div>
                  )}

                  {/* File Upload Area */}
                  <div
                    style={{
                      border: uploadFile ? '2px solid #10B981' : '2px dashed #CBD5E1',
                      borderRadius: 8,
                      padding: 32,
                      textAlign: 'center',
                      backgroundColor: uploadFile ? '#F0FDF4' : '#FAFAFA',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onClick={() => document.getElementById('upload-file-input')?.click()}
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = '#0066CC'; e.currentTarget.style.backgroundColor = '#EFF6FF' }}
                    onDragLeave={(e) => { e.currentTarget.style.borderColor = uploadFile ? '#10B981' : '#CBD5E1'; e.currentTarget.style.backgroundColor = uploadFile ? '#F0FDF4' : '#FAFAFA' }}
                    onDrop={(e) => {
                      e.preventDefault()
                      e.currentTarget.style.borderColor = '#10B981'
                      e.currentTarget.style.backgroundColor = '#F0FDF4'
                      const file = e.dataTransfer.files?.[0]
                      if (file) setUploadFile(file)
                    }}
                  >
                    <input
                      id="upload-file-input"
                      type="file"
                      accept=".txt,.sta,.940,.xml,.csv,.xlsx,.pdf"
                      style={{ display: 'none' }}
                      onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    />
                    {uploadFile ? (
                      <div>
                        <div style={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                          <span style={{ fontSize: 24, color: '#059669' }}>✓</span>
                        </div>
                        <p style={{ fontSize: 12, fontWeight: 600, color: '#059669', marginBottom: 4 }}>File Selected</p>
                        <p style={{ fontSize: 11, color: '#374151', fontFamily: 'monospace' }}>{uploadFile.name}</p>
                        <p style={{ fontSize: 10, color: '#64748B', marginTop: 4 }}>{(uploadFile.size / 1024).toFixed(1)} KB</p>
                        <button
                          onClick={(e) => { e.stopPropagation(); setUploadFile(null) }}
                          style={{ marginTop: 8, padding: '4px 12px', fontSize: 10, color: '#DC2626', backgroundColor: 'white', border: '1px solid #FECACA', borderRadius: 4, cursor: 'pointer' }}
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div>
                        <div style={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                          <span style={{ fontSize: 20, color: '#64748B' }}>📄</span>
                        </div>
                        <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Drop your bank statement file here</p>
                        <p style={{ fontSize: 11, color: '#64748B', marginBottom: 8 }}>or click to browse</p>
                        <p style={{ fontSize: 10, color: '#94A3B8' }}>Supports MT940 (.txt, .sta, .940), CAMT.053 (.xml), CSV (.csv), PDF (.pdf)</p>
                      </div>
                    )}
                  </div>

                  {/* Statement Date Selection */}
                  <div style={{ marginTop: 16 }}>
                    <label style={{ fontSize: 10, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Statement Date *</label>
                    <input
                      type="date"
                      defaultValue={new Date().toISOString().split('T')[0]}
                      style={{ padding: '8px 12px', fontSize: 11, border: '1px solid #CBD5E1', borderRadius: 4, width: 180 }}
                    />
                    <span style={{ fontSize: 10, color: '#64748B', marginLeft: 8 }}>Will be used if not detected from file</span>
                  </div>

                  {/* Parse Error Display */}
                  {uploadParseError && (
                    <div style={{ marginTop: 16, backgroundColor: '#FEF2F2', borderRadius: 6, padding: 12, border: '1px solid #FECACA' }}>
                      <p style={{ fontSize: 10, fontWeight: 600, color: '#991B1B', marginBottom: 4 }}>Parsing Error</p>
                      <p style={{ fontSize: 10, color: '#991B1B', fontFamily: 'monospace', lineHeight: 1.5 }}>{uploadParseError}</p>
                      <p style={{ fontSize: 9, color: '#B91C1C', marginTop: 6 }}>
                        Check that the file matches the selected format, or try &quot;Auto-Detect&quot; mode.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Preview */}
              {uploadStep === 'preview' && (
                <div>
                  {/* Parse Summary */}
                  <div style={{ backgroundColor: '#F0FDF4', borderRadius: 6, padding: 12, border: '1px solid #BBF7D0', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 16 }}>✓</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#166534' }}>File Parsed Successfully</span>
                      {uploadFile && (
                        <span style={{ fontSize: 10, color: '#64748B', marginLeft: 'auto' }}>
                          {uploadFile.name} ({(uploadFile.size / 1024).toFixed(1)} KB)
                        </span>
                      )}
                    </div>
                    {selectedBankFormat && (
                      <p style={{ fontSize: 9, color: '#166534', marginBottom: 8, marginLeft: 24 }}>
                        Parsed using {selectedBankFormat.bankName} — {selectedBankFormat.format} format
                      </p>
                    )}
                    {selectedBankFormatId === 'auto' && (
                      <p style={{ fontSize: 9, color: '#166534', marginBottom: 8, marginLeft: 24 }}>
                        Format auto-detected from file content
                      </p>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                      <div>
                        <p style={{ fontSize: 9, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Transactions</p>
                        <p style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{parsedRecords.length}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: 9, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Credits ({parsedRecords.filter(r => r.type === 'CR').length})</p>
                        <p style={{ fontSize: 14, fontWeight: 700, color: '#059669' }}>
                          {(() => {
                            const total = parsedRecords.filter(r => r.type === 'CR').reduce((sum, r) => {
                              const num = parseFloat(r.amount.replace(/[^0-9.\-]/g, ''))
                              return sum + (isNaN(num) ? 0 : num)
                            }, 0)
                            return total > 0 ? total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'
                          })()}
                        </p>
                      </div>
                      <div>
                        <p style={{ fontSize: 9, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Debits ({parsedRecords.filter(r => r.type === 'DR').length})</p>
                        <p style={{ fontSize: 14, fontWeight: 700, color: '#DC2626' }}>
                          {(() => {
                            const total = parsedRecords.filter(r => r.type === 'DR').reduce((sum, r) => {
                              const num = parseFloat(r.amount.replace(/[^0-9.\-]/g, ''))
                              return sum + (isNaN(num) ? 0 : num)
                            }, 0)
                            return total > 0 ? total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'
                          })()}
                        </p>
                      </div>
                      <div>
                        <p style={{ fontSize: 9, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Date Range</p>
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>
                          {(() => {
                            const dates = parsedRecords.map(r => r.date).filter(d => d && d !== 'N/A').sort()
                            if (dates.length === 0) return 'N/A'
                            return dates[0] === dates[dates.length - 1] ? dates[0] : `${dates[0]} — ${dates[dates.length - 1]}`
                          })()}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Transaction Preview Table */}
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: 8 }}>Extracted Transactions (First 20)</div>
                  <div style={{ border: '1px solid #E2E8F0', borderRadius: 6, overflow: 'hidden', maxHeight: 340, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                      <thead>
                        <tr style={{ backgroundColor: '#F8FAFC' }}>
                          <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '1px solid #E2E8F0' }}>Date</th>
                          <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '1px solid #E2E8F0' }}>Reference</th>
                          <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '1px solid #E2E8F0' }}>Description</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#475569', borderBottom: '1px solid #E2E8F0' }}>Amount</th>
                          <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600, color: '#475569', borderBottom: '1px solid #E2E8F0' }}>Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedRecords.slice(0, 20).map((record, idx) => (
                          <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? 'white' : '#FAFAFA' }}>
                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #F1F5F9', fontFamily: 'monospace' }}>{record.date}</td>
                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #F1F5F9', fontFamily: 'monospace' }}>{record.ref}</td>
                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #F1F5F9', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{record.desc}</td>
                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #F1F5F9', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: record.type === 'CR' ? '#059669' : '#DC2626' }}>{record.amount}</td>
                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #F1F5F9', textAlign: 'center' }}>
                              <span style={{ padding: '2px 6px', borderRadius: 3, fontSize: 9, fontWeight: 600, backgroundColor: record.type === 'CR' ? '#D1FAE5' : '#FEE2E2', color: record.type === 'CR' ? '#059669' : '#DC2626' }}>
                                {record.type}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {parsedRecords.length > 20 && (
                    <p style={{ fontSize: 10, color: '#64748B', marginTop: 8, textAlign: 'center' }}>
                      ...and {parsedRecords.length - 20} more transactions
                    </p>
                  )}
                </div>
              )}

              {/* Step 3: Processing */}
              {uploadStep === 'processing' && (
                <div style={{ textAlign: 'center', padding: 32 }}>
                  <div style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                    <div style={{ width: 32, height: 32, border: '3px solid #3B82F6', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', marginBottom: 8 }}>Processing Bank Statement...</p>
                  <p style={{ fontSize: 11, color: '#64748B', marginBottom: 16 }}>
                    {uploadProgress < 30 ? 'Validating file format...' :
                     uploadProgress < 60 ? 'Extracting transactions...' :
                     uploadProgress < 90 ? 'Running reconciliation...' :
                     'Finalizing...'}
                  </p>
                  {/* Progress Bar */}
                  <div style={{ width: '80%', height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, margin: '0 auto', overflow: 'hidden' }}>
                    <div style={{ width: `${uploadProgress}%`, height: '100%', backgroundColor: '#3B82F6', borderRadius: 3, transition: 'width 0.3s' }} />
                  </div>
                  <p style={{ fontSize: 10, color: '#64748B', marginTop: 8 }}>{uploadProgress}% complete</p>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              )}

              {/* Success State */}
              {uploadStep === 'success' && (
                <div style={{ textAlign: 'center', padding: 32 }}>
                  <div style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                    <span style={{ fontSize: 32, color: '#059669' }}>✓</span>
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#059669', marginBottom: 8 }}>Upload Successful!</p>
                  <p style={{ fontSize: 11, color: '#64748B', marginBottom: 20 }}>
                    {parsedRecords.length} transactions have been imported and are ready for reconciliation.
                  </p>
                  <div style={{ backgroundColor: '#F8FAFC', borderRadius: 6, padding: 16, display: 'inline-block', textAlign: 'left' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                      <div>
                        <p style={{ fontSize: 9, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Transactions Imported</p>
                        <p style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>{parsedRecords.length}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: 9, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Auto-Matched</p>
                        <p style={{ fontSize: 16, fontWeight: 700, color: '#059669' }}>{Math.floor(parsedRecords.length * 0.85)}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: 9, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Pending Review</p>
                        <p style={{ fontSize: 16, fontWeight: 700, color: '#F59E0B' }}>{Math.ceil(parsedRecords.length * 0.15)}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: 9, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Exceptions Created</p>
                        <p style={{ fontSize: 16, fontWeight: 700, color: '#DC2626' }}>{Math.ceil(parsedRecords.length * 0.02)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Error State */}
              {uploadStep === 'error' && (
                <div style={{ textAlign: 'center', padding: 32 }}>
                  <div style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                    <span style={{ fontSize: 32, color: '#DC2626' }}>!</span>
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#DC2626', marginBottom: 8 }}>Upload Failed</p>
                  <p style={{ fontSize: 11, color: '#64748B', marginBottom: 20 }}>
                    There was an error processing your file. Please check the format and try again.
                  </p>
                  <div style={{ backgroundColor: '#FEF2F2', borderRadius: 6, padding: 12, border: '1px solid #FECACA', textAlign: 'left' }}>
                    <p style={{ fontSize: 10, fontWeight: 600, color: '#991B1B', marginBottom: 4 }}>Error Details:</p>
                    <p style={{ fontSize: 10, color: '#991B1B', fontFamily: 'monospace' }}>Invalid MT940 format: Missing :20: tag at line 1</p>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '12px 16px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                onClick={() => {
                  if (uploadStep === 'preview') {
                    setUploadStep('select')
                  } else {
                    setShowUploadModal(false)
                  }
                }}
                style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, color: '#64748B', backgroundColor: 'white', border: '1px solid #CBD5E1', borderRadius: 4, cursor: 'pointer' }}
              >
                {uploadStep === 'preview' ? 'Back' : uploadStep === 'success' || uploadStep === 'error' ? 'Close' : 'Cancel'}
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                {uploadStep === 'select' && (
                  <button
                    disabled={!uploadFile || (!selectedBankFormatId && !uploadConnector) || isParsing}
                    onClick={handleParseFile}
                    style={{
                      padding: '6px 16px',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'white',
                      backgroundColor: (!uploadFile || (!selectedBankFormatId && !uploadConnector) || isParsing) ? '#94A3B8' : '#0066CC',
                      border: 'none',
                      borderRadius: 4,
                      cursor: (!uploadFile || (!selectedBankFormatId && !uploadConnector) || isParsing) ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {isParsing ? (
                      <>
                        <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid white', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                        Parsing...
                      </>
                    ) : (
                      'Parse & Extract'
                    )}
                  </button>
                )}
                {uploadStep === 'preview' && (
                  <button
                    onClick={() => {
                      setUploadStep('processing')
                      setUploadProgress(0)
                      // Simulate processing
                      const interval = setInterval(() => {
                        setUploadProgress(prev => {
                          if (prev >= 100) {
                            clearInterval(interval)
                            setTimeout(() => setUploadStep('success'), 300)
                            return 100
                          }
                          return prev + Math.random() * 15 + 5
                        })
                      }, 400)
                    }}
                    style={{
                      padding: '6px 16px',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'white',
                      backgroundColor: '#059669',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    Import {parsedRecords.length} Transactions
                  </button>
                )}
                {uploadStep === 'success' && (
                  <button
                    onClick={() => setShowUploadModal(false)}
                    style={{
                      padding: '6px 16px',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'white',
                      backgroundColor: '#0066CC',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    Go to Settlement Explorer
                  </button>
                )}
                {uploadStep === 'error' && (
                  <button
                    onClick={() => {
                      setUploadStep('select')
                      setUploadFile(null)
                    }}
                    style={{
                      padding: '6px 16px',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'white',
                      backgroundColor: '#0066CC',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    Try Again
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ConnectorStudio
