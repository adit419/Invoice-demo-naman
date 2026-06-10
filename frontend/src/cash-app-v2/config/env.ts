/**
 * Environment Configuration
 */

export const USE_MOCK_DATA = process.env.NEXT_PUBLIC_USE_MOCK_DATA !== 'false'
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api'

// For demo purposes, always use mock data
export const IS_DEMO_MODE = true
