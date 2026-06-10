/**
 * Cash App V2 Layout Wrapper
 * Includes TopBar for all Cash App V2 pages
 */

import React from 'react'
import { TopBar } from './TopBar'
import { mockEntities, mockCurrentUser } from '@/cash-app-v2/data/mockData'

interface CashAppLayoutProps {
  children: React.ReactNode
  pageTitle?: string
  pageSubtitle?: string
}

export const CashAppLayout: React.FC<CashAppLayoutProps> = ({
  children,
  pageTitle,
  pageSubtitle
}) => {
  const currentDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  return (
    <>
      <TopBar
        key={pageTitle} // Force re-render when title changes
        currentEntity={mockEntities[0]}
        entities={mockEntities}
        currentDate={currentDate}
        notificationCount={3}
        currentUser={mockCurrentUser}
        pageTitle={pageTitle}
        pageSubtitle={pageSubtitle}
      />
      <div className="mt-16 p-8 min-h-screen bg-slate-50">
        {children}
      </div>
    </>
  )
}
