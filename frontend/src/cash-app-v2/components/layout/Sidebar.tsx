/**
 * Sidebar Component
 * Fixed left navigation sidebar with menu items
 */

import React from 'react'
import {
  Home,
  AlertCircle,
  Layers,
  Plug,
  Settings,
  User,
  ClipboardList,
} from 'lucide-react'

interface SidebarProps {
  activePath?: string
  onNavigate?: (path: string) => void
  currentUser?: {
    name: string
    avatar: string
  }
}

interface MenuItem {
  id: string
  label: string
  path: string
  icon: React.ReactNode
  section?: string
}

const menuItems: MenuItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    path: '/dashboard',
    icon: <Home size={20} />,
  },
  {
    id: 'exceptions',
    label: 'Exception Workspace',
    path: '/exceptions',
    icon: <AlertCircle size={20} />,
    section: 'RECONCILIATION',
  },
  {
    id: 'settlements',
    label: 'Settlement Explorer',
    path: '/settlements',
    icon: <Layers size={20} />,
  },
  {
    id: 'connectors',
    label: 'Connector Studio',
    path: '/connector-studio',
    icon: <Plug size={20} />,
    section: 'CONFIGURATION',
  },
  {
    id: 'audit',
    label: 'Audit Trail',
    path: '/audit-trail',
    icon: <ClipboardList size={20} />,
    section: 'COMPLIANCE',
  },
]

const bottomMenuItems: MenuItem[] = [
  {
    id: 'settings',
    label: 'Settings',
    path: '/settings',
    icon: <Settings size={20} />,
  },
]

export const Sidebar: React.FC<SidebarProps> = ({
  activePath = '/dashboard',
  onNavigate,
  currentUser = { name: 'KaustavRay', avatar: 'KR' },
}) => {
  const handleItemClick = (path: string) => {
    if (onNavigate) {
      onNavigate(path)
    }
  }

  const renderMenuItem = (item: MenuItem, isActive: boolean) => (
    <button
      key={item.id}
      onClick={() => handleItemClick(item.path)}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors
        ${
          isActive
            ? 'text-white bg-blue-950 border-l-4 border-blue-500'
            : 'text-gray-400 hover:text-white hover:bg-gray-800'
        }
      `}
    >
      {item.icon}
      <span>{item.label}</span>
    </button>
  )

  let currentSection: string | undefined

  return (
    <div className="fixed left-0 top-0 h-full w-60 bg-gray-900 flex flex-col">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-gray-800">
        <h1 className="text-xl font-bold text-white">NEOFLO</h1>
      </div>

      {/* Main Menu */}
      <nav className="flex-1 overflow-y-auto py-4">
        {menuItems.map((item) => {
          const isActive = activePath === item.path
          const showSectionHeader = item.section && item.section !== currentSection

          if (item.section) {
            currentSection = item.section
          }

          return (
            <React.Fragment key={item.id}>
              {showSectionHeader && (
                <div className="px-4 py-2 mt-4">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {item.section}
                  </span>
                </div>
              )}
              {renderMenuItem(item, isActive)}
            </React.Fragment>
          )
        })}
      </nav>

      {/* Bottom Menu */}
      <div className="border-t border-gray-800">
        {bottomMenuItems.map((item) => {
          const isActive = activePath === item.path
          return renderMenuItem(item, isActive)
        })}

        {/* User Info */}
        <div className="px-4 py-3 flex items-center gap-3 text-gray-400 hover:text-white hover:bg-gray-800 cursor-pointer transition-colors">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold">
            {currentUser.avatar}
          </div>
          <span className="text-sm font-medium">{currentUser.name}</span>
        </div>
      </div>
    </div>
  )
}
