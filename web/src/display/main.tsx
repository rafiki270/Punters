import React from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import '../i18n'
import DisplayApp from './DisplayApp'

const el = document.getElementById('root')!

createRoot(el).render(
  <React.StrictMode>
    <DisplayApp />
  </React.StrictMode>
)
