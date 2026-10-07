import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App.tsx'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error("Lord's Ledger root element is missing.")

// Local previews have no Vercel Insights endpoint; keep hosted Analytics intact.
const hostname = window.location.hostname
const localPreview = ['localhost', '0.0.0.0', '[::1]', '::1'].includes(hostname)
  || hostname.endsWith('.localhost') || /^127(?:\.\d{1,3}){3}$/.test(hostname)

createRoot(rootElement).render(
  <StrictMode>
    <App />
    {!localPreview && <Analytics />}
  </StrictMode>,
)
