import React from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import '../i18n'
import AdminApp from './AdminApp'

const el = document.getElementById('root')!

createRoot(el).render(
  <React.StrictMode>
    <AdminApp />
  </React.StrictMode>
)
