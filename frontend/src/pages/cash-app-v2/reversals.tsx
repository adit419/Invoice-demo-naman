/**
 * Cash App V2 - Reversals Tracker
 */

import React from 'react'
import Head from 'next/head'
import { CashAppLayout } from '@/cash-app-v2/components/layout/CashAppLayout'

const ReversalsTrackerPage: React.FC = () => {
  return (
    <>
      <Head>
        <title>Reversals Tracker | Cash Application | Neoflo</title>
      </Head>
      <CashAppLayout
        pageTitle="Reversals Tracker"
        pageSubtitle="Track refunds and chargebacks"
      >
        <div>
          <p style={{ fontSize: 13, color: '#64748b' }}>Coming soon...</p>
        </div>
      </CashAppLayout>
    </>
  )
}

export default ReversalsTrackerPage
