'use client'
import { PaymentsPage } from '@/property-management-app'
import { ZelleInboxPanel } from '@/zelle-components'
import { useLandlordPageProps } from '@/components/route-props'

export default function Page() {
  const props = useLandlordPageProps()
  return <PaymentsPage {...props} zelleInbox={<ZelleInboxPanel {...props} />} />
}
