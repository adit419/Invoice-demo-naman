/**
 * Cash App V2 - Reports & Close
 */

import React from 'react'
import Head from 'next/head'
import { CashAppLayout } from '@/cash-app-v2/components/layout/CashAppLayout'

const ReportsAndClosePage: React.FC = () => {
  return (
    <>
      <Head>
        <title>Reports & Close | Cash Application | Neoflo</title>
      </Head>
      <CashAppLayout
        pageTitle="Reports & Close"
        pageSubtitle="End-of-cycle outputs and JE approval"
      >
        <div>
          <p style={{ fontSize: 13, color: '#64748b' }}>Coming soon...</p>
        </div>
      </CashAppLayout>
    </>
  )
}

export default ReportsAndClosePage
