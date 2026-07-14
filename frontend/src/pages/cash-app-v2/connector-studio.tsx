/**
 * Cash App V2 - Connector Studio
 */

import React from 'react'
import Head from 'next/head'
import { withAuthGuard } from '@/components/AuthGuard'
import { CashAppLayout } from '@/cash-app-v2/components/layout/CashAppLayout'
import ConnectorStudio from '@/cash-app-v2/screens/ConnectorStudio'

const ConnectorStudioPage: React.FC = () => {
  return (
    <>
      <Head>
        <title>Connector Studio | Cash Application | Neoflo</title>
      </Head>
      <CashAppLayout
        pageTitle="Connector Studio"
        pageSubtitle="Manage integrations with banks, PSPs, internal systems, and ERPs"
      >
        <ConnectorStudio />
      </CashAppLayout>
    </>
  )
}

export default withAuthGuard(ConnectorStudioPage)
