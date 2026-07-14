/**
 * Cash App V2 - Audit Trail
 */

import React from 'react'
import Head from 'next/head'
import { withAuthGuard } from '@/components/AuthGuard'
import { CashAppLayout } from '@/cash-app-v2/components/layout/CashAppLayout'
import { AuditTrail } from '@/cash-app-v2/screens/AuditTrail'

const AuditTrailPage: React.FC = () => {
  return (
    <>
      <Head>
        <title>Audit Trail | Cash Application | Neoflo</title>
      </Head>
      <CashAppLayout
        pageTitle="Audit Trail"
        pageSubtitle="SOX-compliant activity log"
      >
        <AuditTrail />
      </CashAppLayout>
    </>
  )
}

export default withAuthGuard(AuditTrailPage)
