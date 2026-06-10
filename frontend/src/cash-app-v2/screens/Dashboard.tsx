/**
 * Dashboard Screen
 * Main landing page with reconciliation health overview
 */

import React, { useState, useEffect } from 'react'
import {
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  AlertCircle,
  FileText,
  DollarSign,
  Landmark,
  ArrowUp,
  ArrowDown,
  Loader2,
} from 'lucide-react'
import { SkeletonCard, SkeletonTable } from '../components/ui/Skeleton'
import { ExceptionAgingChart } from '../components/ui/ExceptionAgingChart'
import { OpenARDetailModal } from '../components/modals/OpenARDetailModal'
import { BankCreditHistoryModal } from '../components/modals/BankCreditHistoryModal'
import { dashboardService } from '../services'
import { mockOpenARSummary, mockBankCreditHistory } from '../data/mockData'
import type {
  DashboardKPIs,
  ExceptionSummary,
  PSPReconciliationStatus,
  ExceptionAgingData,
  UnsettledAgingBucket,
} from '../types/domain'

// Helper function to format currency
const formatCurrency = (amount: number, currency: string): string => {
  if (currency === 'IDR') {
    return `${currency} ${(amount / 1000000000).toFixed(1)}B`
  } else if (currency === 'SGD' || currency === 'MYR') {
    if (amount >= 1000000) {
      // Use 2 decimal places for millions to show exact values (4.25M not 4.3M)
      const millions = amount / 1000000
      const formatted = millions.toFixed(2)
      // Remove trailing .00 if whole number (e.g., 4.00M -> 4M)
      return `${currency} ${formatted.replace(/\.00$/, '')}M`
    } else if (amount >= 1000) {
      return `${currency} ${(amount / 1000).toFixed(0)}K`
    }
    return `${currency} ${amount.toLocaleString()}`
  }
  return `${currency} ${amount.toLocaleString()}`
}

// Helper function to get yesterday's date
const getYesterdayDate = (): string => {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  return yesterday.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
}

interface KPITileProps {
  title: string
  value: string
  subtitle: string
  icon: React.ReactNode
  colorClass: string
  onClick?: () => void
  progress?: number
  trend?: number // e.g., +2.1 or -8
  lastUpdated?: string
}

const KPITile: React.FC<KPITileProps> = ({
  title,
  value,
  subtitle,
  icon,
  colorClass,
  onClick,
  progress,
  trend,
  lastUpdated,
}) => {
  const getBorderColor = () => {
    if (colorClass.includes('emerald')) return '#059669'
    if (colorClass.includes('blue') || colorClass.includes('sky')) return '#0369a1'
    if (colorClass.includes('red')) return '#dc2626'
    if (colorClass.includes('amber')) return '#d97706'
    if (colorClass.includes('purple')) return '#9333ea'
    return '#64748b'
  }

  return (
    <div
      onClick={onClick}
      style={{
        backgroundColor: 'white',
        borderRadius: 6,
        border: '1px solid #E2E8F0',
        borderLeft: `3px solid ${getBorderColor()}`,
        padding: '10px 12px',
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative',
        transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={(e) => { if (onClick) e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)' }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none' }}
    >
      {/* Live indicator - top right corner */}
      {lastUpdated && (
        <div style={{ position: 'absolute', top: 8, right: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#10b981' }} />
          <span style={{ fontSize: 8, color: '#94a3b8', whiteSpace: 'nowrap' }}>Yesterday</span>
        </div>
      )}

      {/* Header */}
      <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{title}</p>

      {/* Value with trend indicator */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
        <p style={{ fontSize: 18, fontWeight: 700, color: '#101828', margin: 0 }}>{value}</p>
        {trend !== undefined && trend !== 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, fontWeight: 600, color: trend > 0 ? '#10b981' : '#ef4444' }}>
            {trend > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            <span>{Math.abs(trend).toFixed(1)}{title.includes('%') ? '%' : ''}</span>
          </div>
        )}
      </div>

      <p style={{ fontSize: 10, color: '#64748b', margin: 0 }}>{subtitle}</p>

      {progress !== undefined && (
        <div style={{ marginTop: 8, width: '100%', backgroundColor: '#f1f5f9', borderRadius: 4, height: 4 }}>
          <div
            style={{
              width: `${progress}%`,
              height: '100%',
              borderRadius: 4,
              backgroundColor: colorClass.includes('emerald') ? '#059669' : '#64748b',
              transition: 'width 0.3s',
            }}
          />
        </div>
      )}
    </div>
  )
}

interface DashboardProps {
  onNavigate?: (path: string) => void
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null)
  const [exceptionSummary, setExceptionSummary] = useState<ExceptionSummary[]>([])
  const [pspStatus, setPspStatus] = useState<PSPReconciliationStatus[]>([])
  const [exceptionAging, setExceptionAging] = useState<ExceptionAgingData[]>([])
  const [unsettledAging, setUnsettledAging] = useState<UnsettledAgingBucket[]>([])
  const [loading, setLoading] = useState(true)
  const [isOpenARModalOpen, setIsOpenARModalOpen] = useState(false)
  const [isBankCreditHistoryOpen, setIsBankCreditHistoryOpen] = useState(false)
  const [bankCreditHistoryLoading, setBankCreditHistoryLoading] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [kpisData, exSummary, pspData, exAging, unsAging] = await Promise.all([
          dashboardService.getKPIs(),
          dashboardService.getExceptionSummary(),
          dashboardService.getPSPReconciliationStatus(),
          dashboardService.getExceptionAgingData(),
          dashboardService.getUnsettledAgingBuckets(),
        ])

        setKpis(kpisData)
        setExceptionSummary(exSummary)
        setPspStatus(pspData)
        setExceptionAging(exAging)
        setUnsettledAging(unsAging)
      } catch (error) {
        console.error('Error fetching dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        {/* KPI Tiles Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        {/* Table Skeleton */}
        <SkeletonTable />
      </div>
    )
  }

  if (!kpis) return null

  const getTouchlessColor = (pct: number): string => {
    return pct >= 90 ? 'text-emerald-600' : 'text-amber-600'
  }

  const yesterdayDate = getYesterdayDate()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* KPI Tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
        {/* Touchless Rate - Quarter on Quarter with improvement indicator */}
        <div
          style={{
            backgroundColor: 'white',
            borderRadius: 6,
            border: '1px solid #E2E8F0',
            borderLeft: `3px solid ${kpis.touchlessRateCurrentQtr >= 90 ? '#059669' : '#d97706'}`,
            padding: '10px 12px',
            position: 'relative',
          }}
        >
          {/* Quarter label - top right */}
          <div style={{ position: 'absolute', top: 8, right: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 8, color: '#94a3b8', fontWeight: 600 }}>{kpis.touchlessRateCurrentQtrLabel}</span>
          </div>

          {/* Title */}
          <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            Touchless Rate
          </p>

          {/* Main Value with QoQ Change */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
            <p style={{ fontSize: 18, fontWeight: 700, color: '#101828', margin: 0 }}>
              {kpis.touchlessRateCurrentQtr}%
            </p>
            {/* QoQ Change Badge with Arrow */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                padding: '2px 6px',
                borderRadius: 4,
                backgroundColor: kpis.touchlessRateQoQChange >= 0 ? '#d1fae5' : '#fee2e2',
              }}
            >
              {kpis.touchlessRateQoQChange >= 0 ? (
                <ArrowUp size={10} style={{ color: '#059669' }} />
              ) : (
                <ArrowDown size={10} style={{ color: '#dc2626' }} />
              )}
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: kpis.touchlessRateQoQChange >= 0 ? '#059669' : '#dc2626',
                }}
              >
                {Math.abs(kpis.touchlessRateQoQChange).toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Subtitle - QoQ comparison */}
          <p style={{ fontSize: 9, color: '#64748b', margin: 0 }}>
            vs {kpis.touchlessRatePrevQtr}% ({kpis.touchlessRatePrevQtrLabel})
          </p>

          {/* Description */}
          <p style={{ fontSize: 8, color: '#94a3b8', margin: '4px 0 0 0', fontStyle: 'italic' }}>
            L1/L2 reconciled without human intervention
          </p>
        </div>
        {/* Total Bank Credit - Clickable to view history */}
        <div
          onClick={() => {
            if (bankCreditHistoryLoading) return
            setBankCreditHistoryLoading(true)
            setTimeout(() => {
              setBankCreditHistoryLoading(false)
              setIsBankCreditHistoryOpen(true)
            }, 2500)
          }}
          style={{
            backgroundColor: 'white',
            borderRadius: 6,
            border: '1px solid #E2E8F0',
            borderLeft: '3px solid #0369a1',
            padding: '10px 12px',
            cursor: 'pointer',
            position: 'relative',
            transition: 'box-shadow 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)' }}
          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none' }}
        >
          {/* Live indicator - top right corner */}
          <div style={{ position: 'absolute', top: 8, right: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
            {bankCreditHistoryLoading ? (
              <Loader2 size={12} className="animate-spin" style={{ color: '#0369a1' }} />
            ) : (
              <>
                <div style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#10b981' }} />
                <span style={{ fontSize: 8, color: '#94a3b8', whiteSpace: 'nowrap' }}>Yesterday</span>
              </>
            )}
          </div>

          {/* Header */}
          <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            Total Bank Credit
          </p>

          {/* Value with trend indicator */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
            <p style={{ fontSize: 18, fontWeight: 700, color: '#101828', margin: 0 }}>
              {formatCurrency(kpis.totalBankCreditSGD, 'SGD')}
            </p>
            {kpis.totalBankCreditTrend !== undefined && kpis.totalBankCreditTrend !== 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, fontWeight: 600, color: kpis.totalBankCreditTrend > 0 ? '#10b981' : '#ef4444' }}>
                {kpis.totalBankCreditTrend > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                <span>{Math.abs(kpis.totalBankCreditTrend).toFixed(1)}</span>
              </div>
            )}
          </div>

          <p style={{ fontSize: 10, color: '#64748b', margin: 0 }}>{`1 Day (${yesterdayDate})`}</p>

          {/* Click hint */}
          <p style={{ fontSize: 8, color: '#94a3b8', margin: '4px 0 0 0', fontStyle: 'italic' }}>
            Click to view historical data
          </p>
        </div>
        <KPITile
          title="Open Exceptions"
          value={formatCurrency(kpis.exceptionAmountSGD, 'SGD')}
          subtitle={`${kpis.openExceptions} open · ${kpis.pastSLAExceptions} past SLA · All time`}
          icon={<AlertCircle size={32} />}
          colorClass={kpis.pastSLAExceptions > 0 ? 'text-red-600' : 'text-amber-600'}
          onClick={() => {
            console.log('Exception card clicked, navigating to /exceptions')
            onNavigate?.('/exceptions')
          }}
          trend={kpis.openExceptionsTrend}
        />
        <KPITile
          title="Open AR"
          value={formatCurrency(mockOpenARSummary.totalAmount, mockOpenARSummary.currency)}
          subtitle={`${mockOpenARSummary.totalCount} open items · All time`}
          icon={<DollarSign size={32} />}
          colorClass="text-purple-600"
          onClick={() => setIsOpenARModalOpen(true)}
        />
        <KPITile
          title="Pending Posting"
          value={`${kpis.pendingJEs} JEs`}
          subtitle="Awaiting approval · All time"
          icon={<FileText size={32} />}
          colorClass="text-amber-600"
          trend={kpis.pendingJEsTrend}
        />
      </div>

      {/* Exception Summary Bar */}
      {exceptionSummary.length > 0 && (
        <div style={{ backgroundColor: 'white', borderRadius: 6, border: '1px solid #E2E8F0', padding: '10px 12px' }}>
          <h3 style={{ fontSize: 10, fontWeight: 600, color: '#475569', marginBottom: 8 }}>Exception Breakdown by Type (Currently Open)</h3>
          <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', height: 20 }}>
            {exceptionSummary.map((ex, idx) => {
              const width = (ex.count / kpis.openExceptions) * 100
              return (
                <div
                  key={idx}
                  style={{
                    width: `${width}%`,
                    backgroundColor: ex.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 9,
                    fontWeight: 600,
                    color: '#fff',
                    cursor: 'pointer',
                    transition: 'opacity 0.2s'
                  }}
                  title={`${ex.type}: ${ex.count}`}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                >
                  {ex.count}
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
            {exceptionSummary.map((ex, idx) => {
              return (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: ex.color }}></div>
                  <span style={{ fontSize: 10, color: '#475569', fontWeight: 500 }}>
                    <span style={{ textTransform: 'capitalize' }}>{ex.type.replace('_', ' ')}</span>: <span style={{ fontWeight: 600 }}>{ex.count}</span>
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Two-Column Layout: PSP Table (60%) + Charts (40%) */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 10 }}>
        {/* Left Column - PSP Reconciliation Status Table */}
        <div style={{ backgroundColor: 'white', borderRadius: 6, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #E2E8F0' }}>
            <h3 style={{ fontSize: 10, fontWeight: 600, color: '#475569', margin: 0 }}>
              Reconciliation Status by PSP (Yesterday)
            </h3>
          </div>
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '240px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f8fafc' }}>
                  <th style={{ padding: '6px 10px', fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'left' }}>PSP</th>
                  <th style={{ padding: '6px 10px', fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'right' }}>Unmatched</th>
                  <th style={{ padding: '6px 10px', fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'right' }}>Exceptions</th>
                  <th style={{ padding: '6px 10px', fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'right' }}>Coverage</th>
                  <th style={{ padding: '6px 10px', fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'left' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {pspStatus.map((psp) => {
                  const unmatched = psp.todayCredits - psp.matched
                  return (
                    <tr key={psp.pspId} className="hover:bg-slate-50" style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
                      <td style={{ padding: '6px 10px', fontSize: 11, fontWeight: 600, color: '#101828' }}>{psp.pspName}</td>
                      <td style={{ padding: '6px 10px', fontSize: 10, fontFamily: 'monospace', textAlign: 'right' }}>
                        <span style={{ color: unmatched > 0 ? '#dc2626' : '#059669' }}>
                          {formatCurrency(unmatched, psp.currency)}
                        </span>
                      </td>
                      <td style={{ padding: '6px 10px', fontSize: 10, color: '#475569', textAlign: 'right' }}>{psp.exceptions}</td>
                      <td style={{ padding: '6px 10px', fontSize: 11, fontWeight: 700, textAlign: 'right' }}>
                        <span style={{ color: psp.coveragePct >= 95 ? '#059669' : psp.coveragePct >= 90 ? '#d97706' : '#dc2626' }}>
                          {psp.coveragePct.toFixed(1)}%
                        </span>
                      </td>
                      <td style={{ padding: '6px 10px' }}>
                        <span style={{
                          fontSize: 9,
                          fontWeight: 600,
                          color: psp.status === 'healthy' ? '#059669' : psp.status === 'attention' ? '#d97706' : '#dc2626'
                        }}>
                          {psp.status === 'healthy' && 'Healthy'}
                          {psp.status === 'attention' && 'Attention'}
                          {psp.status === 'warning' && 'Warning'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column - Charts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Exception Aging - Bar Chart */}
          {exceptionAging.length > 0 && (
            <div style={{ backgroundColor: 'white', borderRadius: 6, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
              <div style={{ padding: '10px 12px', borderBottom: '1px solid #E2E8F0' }}>
                <h3 style={{ fontSize: 10, fontWeight: 600, color: '#475569', margin: 0 }}>
                  Open Exceptions by PSP & Age
                </h3>
              </div>
              <div style={{ padding: '8px 12px', height: '220px' }}>
                <ExceptionAgingChart data={exceptionAging} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Unsettled Aging Table */}
      <div style={{ backgroundColor: 'white', borderRadius: 6, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #E2E8F0' }}>
          <h3 style={{ fontSize: 10, fontWeight: 600, color: '#475569', margin: 0 }}>
            In-Transit Cash by PSP & Age Bucket (Current State)
          </h3>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '6px 10px', fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'left' }}>PSP</th>
                <th style={{ padding: '6px 10px', fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'right' }}>0–1 day</th>
                <th style={{ padding: '6px 10px', fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'right' }}>2–3 days</th>
                <th style={{ padding: '6px 10px', fontSize: 9, fontWeight: 600, color: '#d97706', textTransform: 'uppercase', textAlign: 'right' }}>4–7 days</th>
                <th style={{ padding: '6px 10px', fontSize: 9, fontWeight: 600, color: '#dc2626', textTransform: 'uppercase', textAlign: 'right' }}>8+ days</th>
                <th style={{ padding: '6px 10px', fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {unsettledAging.map((bucket) => (
                <tr key={bucket.pspId} className="hover:bg-slate-50" style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
                  <td style={{ padding: '6px 10px', fontSize: 11, fontWeight: 600, color: '#101828' }}>{bucket.pspName}</td>
                  <td style={{ padding: '6px 10px', fontSize: 10, fontFamily: 'monospace', color: '#475569', textAlign: 'right' }}>
                    {formatCurrency(bucket.bucket0to1, bucket.currency)}
                  </td>
                  <td style={{ padding: '6px 10px', fontSize: 10, fontFamily: 'monospace', color: '#475569', textAlign: 'right' }}>
                    {formatCurrency(bucket.bucket2to3, bucket.currency)}
                  </td>
                  <td style={{ padding: '6px 10px', fontSize: 10, fontFamily: 'monospace', color: '#d97706', fontWeight: 600, textAlign: 'right' }}>
                    {bucket.bucket4to7 > 0 ? formatCurrency(bucket.bucket4to7, bucket.currency) : '—'}
                  </td>
                  <td style={{ padding: '6px 10px', fontSize: 10, fontFamily: 'monospace', color: '#dc2626', fontWeight: 700, textAlign: 'right' }}>
                    {bucket.bucket8plus > 0 ? formatCurrency(bucket.bucket8plus, bucket.currency) : '—'}
                  </td>
                  <td style={{ padding: '6px 10px', fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: '#101828', textAlign: 'right' }}>
                    {formatCurrency(bucket.total, bucket.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Open AR Detail Modal */}
      <OpenARDetailModal
        data={mockOpenARSummary}
        isOpen={isOpenARModalOpen}
        onClose={() => setIsOpenARModalOpen(false)}
        onViewDetails={(category) => {
          console.log('View details for category:', category)
          // TODO: Navigate to detailed view for this category
        }}
      />

      {/* Bank Credit History Modal */}
      <BankCreditHistoryModal
        isOpen={isBankCreditHistoryOpen}
        onClose={() => setIsBankCreditHistoryOpen(false)}
        historicalData={mockBankCreditHistory}
        currency="SGD"
      />
    </div>
  )
}
