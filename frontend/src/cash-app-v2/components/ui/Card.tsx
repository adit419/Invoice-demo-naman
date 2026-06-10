/**
 * Card Component
 * White card with border and shadow
 */

import React from 'react'

interface CardProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
  hover?: boolean
  style?: React.CSSProperties
}

export const Card: React.FC<CardProps> = ({ children, className = '', onClick, hover = false, style }) => {
  const hoverClass = hover || onClick ? 'hover:shadow-lg hover:border-gray-300 transition-all cursor-pointer' : ''

  return (
    <div
      className={`bg-white border border-gray-200 rounded-xl shadow-sm ${hoverClass} ${className}`}
      onClick={onClick}
      style={style}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps {
  children: React.ReactNode
  className?: string
}

export const CardHeader: React.FC<CardHeaderProps> = ({ children, className = '' }) => {
  return <div className={`px-6 py-4 border-b border-gray-200 ${className}`}>{children}</div>
}

interface CardBodyProps {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

export const CardBody: React.FC<CardBodyProps> = ({ children, className = '', style }) => {
  return <div className={`px-6 py-5 ${className}`} style={style}>{children}</div>
}

interface CardTitleProps {
  children: React.ReactNode
  className?: string
}

export const CardTitle: React.FC<CardTitleProps> = ({ children, className = '' }) => {
  return <h3 className={`text-lg font-semibold text-gray-900 ${className}`}>{children}</h3>
}

interface CardSubtitleProps {
  children: React.ReactNode
  className?: string
}

export const CardSubtitle: React.FC<CardSubtitleProps> = ({ children, className = '' }) => {
  return <p className={`text-sm text-gray-500 ${className}`}>{children}</p>
}
