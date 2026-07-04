import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './ui/ui.css'
import { DisplayApp } from './display/DisplayApp'
import { AdminApp } from './admin/AdminApp'

// '/' is the display surface (what TVs open); '/admin' is the console.
const isAdmin = window.location.pathname.startsWith('/admin')

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isAdmin ? <AdminApp /> : <DisplayApp />}</StrictMode>,
)
