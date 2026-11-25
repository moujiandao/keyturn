'use client'
import { LearningsPage } from '@/learnings-components'
import { useLandlordPageProps } from '@/components/route-props'

export default function Page() {
  return <LearningsPage {...useLandlordPageProps()} />
}
