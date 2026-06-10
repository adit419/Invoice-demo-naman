/**
 * Badge Component
 * Status badges with variants
 */

import React from 'react'

export type BadgeVariant =
  | 'matched'
  | 'pending'
  | 'exception'
  | 'in_transit'
  | 'posted'
  | 'aging'
  | 'reversed'
  | 'high'
  | 'medium'
  | 'low'
  | 'healthy'
  | 'attention'
  | 'warning'

interface BadgeProps {
  variant: BadgeVariant
  children: React.ReactNode
  className?: string
}

const variantStyles: Record<BadgeVariant, string> = {
  matched: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  pending: 'bg-amber-50 text-amber-700 border border-amber-200',
  exception: 'bg-red-50 text-red-700 border border-red-200',
  in_transit: 'bg-sky-50 text-sky-700 border border-sky-200',
  posted: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  aging: 'bg-orange-50 text-orange-700 border border-orange-200',
  reversed: 'bg-slate-50 text-slate-600 border border-slate-200',
  high: 'bg-red-50 text-red-700 border border-red-200',
  medium: 'bg-amber-50 text-amber-700 border border-amber-200',
  low: 'bg-slate-50 text-slate-600 border border-slate-200',
  healthy: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  attention: 'bg-amber-50 text-amber-700 border border-amber-200',
  warning: 'bg-red-50 text-red-700 border border-red-200',
}

export const Badge: React.FC<BadgeProps> = ({ variant, children, className = '' }) => {
  return (
    <span
      style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.02em' }}
      className={`inline-flex items-center px-2 py-0.5 rounded ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  )
}
