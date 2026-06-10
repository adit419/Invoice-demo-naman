/**
 * Layout Component
 * Main application layout with sidebar and top bar
 */

import React from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import type { Entity } from '../../types/domain'

interface LayoutProps {
  children: React.ReactNode
  activePath?: string
  onNavigate?: (path: string) => void
  currentEntity?: Entity
  entities?: Entity[]
  onEntityChange?: (entityId: string) => void
  currentUser?: {
    name: string
    avatar: string
  }
}

export const Layout: React.FC<LayoutProps> = ({
  children,
  activePath,
  onNavigate,
  currentEntity,
  entities,
  onEntityChange,
  currentUser,
}) => {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar activePath={activePath} onNavigate={onNavigate} currentUser={currentUser} />

      {/* Top Bar */}
      <TopBar
        currentEntity={currentEntity}
        entities={entities}
        onEntityChange={onEntityChange}
        currentUser={currentUser}
      />

      {/* Main Content Area */}
      <div className="ml-60 mt-16 p-6">
        <div className="max-w-[1400px]">{children}</div>
      </div>
    </div>
  )
}
