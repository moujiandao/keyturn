import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 112,
          background: '#ad343e',
          color: '#ffffff',
          fontSize: 280,
          fontWeight: 800,
          letterSpacing: '-0.05em',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        K
      </div>
    ),
    { ...size }
  )
}
