import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'sonner'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <Toaster
      position="bottom-right"
      theme="dark"
      toastOptions={{
        style: {
          background: '#1a1d2e',
          border: '1px solid #2d3148',
          color: '#e2e8f0',
          fontSize: '13px',
        },
      }}
    />
  </React.StrictMode>,
)
