/**
 * Cash App V2 - Main Application Component
 */

import React, { useState } from 'react'
import { Layout } from './components/layout/Layout'
import { Dashboard } from './screens/Dashboard'
import { SettlementExplorer } from './screens/SettlementExplorer'
import { ExceptionWorkspace } from './screens/ExceptionWorkspace'
import ConnectorStudio from './screens/ConnectorStudio'
import { AuditTrail } from './screens/AuditTrail'
import { mockEntities, mockCurrentUser } from './data/mockData'
import type { Entity } from './types/domain'

export const CashAppV2: React.FC = () => {
  const [currentPath, setCurrentPath] = useState('/dashboard')
  const [currentEntity, setCurrentEntity] = useState<Entity>(mockEntities[0])

  const handleNavigation = (path: string) => {
    console.log('Navigation triggered to:', path)
    setCurrentPath(path)
  }

  const handleEntityChange = (entityId: string) => {
    const entity = mockEntities.find((e) => e.id === entityId)
    if (entity) {
      setCurrentEntity(entity)
    }
  }

  // Render the current screen based on path
  const renderScreen = () => {
    switch (currentPath) {
      case '/dashboard':
        return <Dashboard onNavigate={handleNavigation} />
      case '/exceptions':
        return <ExceptionWorkspace />
      case '/settlements':
        return <SettlementExplorer />
      case '/connector-studio':
        return <ConnectorStudio />
      case '/audit-trail':
        return <AuditTrail />
      case '/settings':
        return (
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
            <p className="text-gray-500 mt-2">Coming soon...</p>
          </div>
        )
      default:
        return <Dashboard onNavigate={handleNavigation} />
    }
  }

  return (
    <Layout
      activePath={currentPath}
      onNavigate={handleNavigation}
      currentEntity={currentEntity}
      entities={mockEntities}
      onEntityChange={handleEntityChange}
      currentUser={mockCurrentUser}
    >
      {renderScreen()}
    </Layout>
  )
}

export default CashAppV2
