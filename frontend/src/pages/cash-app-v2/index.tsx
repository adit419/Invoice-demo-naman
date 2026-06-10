/**
 * Cash Application V2 - Page Entry Point
 * Neoflo Cash Application & Settlement Reconciliation Platform
 */

import React, { useState, useEffect } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { Dashboard } from '@/cash-app-v2/screens/Dashboard'
import { ExceptionWorkspace } from '@/cash-app-v2/screens/ExceptionWorkspace'
import { SettlementExplorer } from '@/cash-app-v2/screens/SettlementExplorer'
import { CashAppLayout } from '@/cash-app-v2/components/layout/CashAppLayout'

const CashApplicationV2Page: React.FC = () => {
  const router = useRouter()

  // Determine current view from URL path
  const getCurrentView = () => {
    if (router.pathname === '/cash-app-v2/exceptions') return 'exceptions'
    if (router.pathname === '/cash-app-v2/settlements') return 'settlements'
    return 'dashboard'
  }

  const currentView = getCurrentView()

  useEffect(() => {
    console.log('=== Router changed ===')
    console.log('pathname:', router.pathname)
    console.log('currentView:', currentView)
  }, [router.pathname, currentView])

  const handleNavigation = (path: string) => {
    console.log('=== handleNavigation called ===')
    console.log('Path:', path)

    const routeMap: { [key: string]: string } = {
      '/dashboard': '/cash-app-v2',
      '/exceptions': '/cash-app-v2/exceptions',
      '/settlements': '/cash-app-v2/settlements',
    }
    const newRoute = routeMap[path] || '/cash-app-v2'
    console.log('Navigating to route:', newRoute)

    router.push(newRoute, undefined, { shallow: true })
  }

  const getPageTitleAndSubtitle = () => {
    switch (currentView) {
      case 'exceptions':
        return {
          title: 'Exception Workspace',
          subtitle: 'Review and resolve reconciliation exceptions'
        }
      case 'settlements':
        return {
          title: 'Settlement Explorer',
          subtitle: 'Bank credits, PSP settlements, and transaction details'
        }
      case 'dashboard':
      default:
        return {
          title: 'Cash Application Dashboard',
          subtitle: 'Real-time reconciliation and settlement overview'
        }
    }
  }

  const renderView = () => {
    switch (currentView) {
      case 'exceptions':
        return <ExceptionWorkspace />
      case 'settlements':
        return <SettlementExplorer />
      case 'dashboard':
      default:
        return <Dashboard onNavigate={handleNavigation} />
    }
  }

  const { title, subtitle } = getPageTitleAndSubtitle()

  return (
    <>
      <Head>
        <title>Cash Application & Settlement Reconciliation | Neoflo</title>
        <meta
          name="description"
          content="Neoflo Cash Application - AI-powered reconciliation and settlement matching for marketplaces"
        />
      </Head>
      <CashAppLayout
        pageTitle={title}
        pageSubtitle={subtitle}
      >
        {renderView()}
      </CashAppLayout>
    </>
  )
}

export default CashApplicationV2Page
