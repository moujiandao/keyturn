'use client'

import { use } from 'react'
import { notFound } from 'next/navigation'
import { RentIncreaseManager } from '@/components/rent-increase-manager'
import { useLandlordPageProps } from '@/components/route-props'
import { findProperty } from '@/lib/routes'

export default function Page({ params }) {
  const { propertyId } = use(params)
  const { data, lang, t } = useLandlordPageProps()
  const property = findProperty(data, propertyId)
  if (!property) notFound()

  const units = data.units.filter(unit => unit.propertyId === property.id)
  return <RentIncreaseManager key={property.id} property={property} units={units} lang={lang} t={t} />
}
