/**
 * TopBar Component
 * Global top bar with entity selector, date, notifications
 */

import React, { useState } from 'react'
import { ChevronDown, Bell } from 'lucide-react'
import type { Entity } from '../../types/domain'

interface TopBarProps {
  currentEntity?: Entity
  entities?: Entity[]
  currentDate?: string
  notificationCount?: number
  onEntityChange?: (entityId: string) => void
  onDateChange?: (date: string) => void
  currentUser?: {
    name: string
    avatar: string
  }
  pageTitle?: string
  pageSubtitle?: string
}

export const TopBar: React.FC<TopBarProps> = ({
  currentEntity,
  entities = [],
  currentDate = '06 Jun 2026',
  notificationCount = 3,
  onEntityChange,
  onDateChange,
  currentUser = { name: 'KaustavRay', avatar: 'KR' },
  pageTitle,
  pageSubtitle,
}) => {
  const [showEntityDropdown, setShowEntityDropdown] = useState(false)
  const [showDateDropdown, setShowDateDropdown] = useState(false)

  console.log('=== TopBar rendering ===')
  console.log('pageTitle:', pageTitle)
  console.log('pageSubtitle:', pageSubtitle)

  return (
    <div
      className="fixed top-0 right-0 h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8 z-10 shadow-sm"
      style={{
        left: 'var(--sidebar-width, 240px)',
        transition: 'left 0.2s ease'
      }}
    >
      {/* Left side - Page title */}
      <div>
        {pageTitle && (
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 600, color: '#101828', margin: 0 }}>{pageTitle}</h1>
            {pageSubtitle && <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{pageSubtitle}</p>}
          </div>
        )}
      </div>

      {/* Right side - Entity selector, Date, Notifications, User */}
      <div className="flex items-center gap-3">
        {/* Entity Selector */}
        <div className="relative">
          <button
            onClick={() => setShowEntityDropdown(!showEntityDropdown)}
            style={{ fontSize: 13, fontWeight: 600 }}
            className="flex items-center gap-2 px-3 py-1.5 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <span>{currentEntity?.name || 'Grab Financial Services Pte. Ltd.'}</span>
            <ChevronDown size={14} className="text-gray-500" />
          </button>
          {showEntityDropdown && entities.length > 0 && (
            <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20">
              {entities.map((entity) => (
                <button
                  key={entity.id}
                  onClick={() => {
                    onEntityChange?.(entity.id)
                    setShowEntityDropdown(false)
                  }}
                  style={{ fontSize: 13 }}
                  className="w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {entity.name} ({entity.currency})
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Date Selector */}
        <div className="relative">
          <button
            onClick={() => setShowDateDropdown(!showDateDropdown)}
            style={{ fontSize: 13, fontWeight: 600 }}
            className="flex items-center gap-2 px-3 py-1.5 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <span>Today: {currentDate}</span>
            <ChevronDown size={14} className="text-gray-500" />
          </button>
          {showDateDropdown && (
            <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20">
              <button
                onClick={() => {
                  setShowDateDropdown(false)
                }}
                style={{ fontSize: 13 }}
                className="w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-50"
              >
                Today
              </button>
              <button
                onClick={() => {
                  setShowDateDropdown(false)
                }}
                style={{ fontSize: 13 }}
                className="w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-50"
              >
                Yesterday
              </button>
              <button
                onClick={() => {
                  setShowDateDropdown(false)
                }}
                style={{ fontSize: 13 }}
                className="w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-50"
              >
                Last 7 days
              </button>
              <button
                onClick={() => {
                  setShowDateDropdown(false)
                }}
                style={{ fontSize: 13 }}
                className="w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-50"
              >
                Custom range...
              </button>
            </div>
          )}
        </div>

        {/* Notifications */}
        <button className="relative p-2.5 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
          <Bell size={20} strokeWidth={2} />
          {notificationCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[18px] h-[18px] bg-red-600 text-white text-[10px] rounded-full flex items-center justify-center font-bold px-1">
              {notificationCount}
            </span>
          )}
        </button>

        {/* User Avatar */}
        <div className="flex items-center gap-2 cursor-pointer border-l border-gray-200 pl-3 ml-1">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-600 to-emerald-700 flex items-center justify-center text-white text-sm font-bold shadow-sm">
            {currentUser.avatar}
          </div>
        </div>
      </div>
    </div>
  )
}
