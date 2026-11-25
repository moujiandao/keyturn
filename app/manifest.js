import { APP_NAME } from '@/lib/brand'

export default function manifest() {
  return {
    name: `${APP_NAME} Property Management`,
    short_name: APP_NAME,
    description: 'Property management, Zelle reconciliation, rent tracking, and renewals.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#f6f5f3',
    theme_color: '#ad343e',
    icons: [
      {
        src: '/icon',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  }
}
