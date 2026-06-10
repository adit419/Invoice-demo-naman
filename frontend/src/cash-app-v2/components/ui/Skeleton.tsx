/**
 * Skeleton Loader Component
 * Animated loading placeholders
 */

import React from 'react'

interface SkeletonProps {
  className?: string
  width?: string
  height?: string
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', width, height }) => {
  const style: React.CSSProperties = {}
  if (width) style.width = width
  if (height) style.height = height

  return (
    <div
      className={`animate-pulse bg-gray-200 rounded ${className}`}
      style={style}
    />
  )
}

export const SkeletonCard: React.FC = () => {
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
      <Skeleton height="24px" className="mb-4" width="60%" />
      <Skeleton height="32px" className="mb-2" width="40%" />
      <Skeleton height="16px" width="80%" />
    </div>
  )
}

export const SkeletonTable: React.FC<{ rows?: number }> = ({ rows = 5 }) => {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <Skeleton height="20px" width="30%" />
      </div>
      <div className="divide-y divide-gray-200">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-6 py-4 flex gap-4">
            <Skeleton height="16px" width="20%" />
            <Skeleton height="16px" width="30%" />
            <Skeleton height="16px" width="15%" />
            <Skeleton height="16px" width="25%" />
          </div>
        ))}
      </div>
    </div>
  )
}
