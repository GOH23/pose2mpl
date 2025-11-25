// ui/Card.tsx
import { ReactNode } from "react"

interface CardProps {
  children: ReactNode
  className?: string
  onClick?: () => void
}

export function Card({ children, className = "", onClick }: CardProps) {
  return (
    <div 
      className={`bg-white rounded-xl border border-gray-200 shadow-sm ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className = "" }: { children: ReactNode, className?: string }) {
  return (
    <div className={`p-6 pb-4 ${className}`}>
      {children}
    </div>
  )
}

export function CardTitle({ children, className = "" }: { children: ReactNode, className?: string }) {
  return (
    <h3 className={`font-semibold text-gray-900 ${className}`}>
      {children}
    </h3>
  )
}

export function CardDescription({ children, className = "" }: { children: ReactNode, className?: string }) {
  return (
    <p className={`text-gray-600 ${className}`}>
      {children}
    </p>
  )
}

export function CardContent({ children, className = "" }: { children: ReactNode, className?: string }) {
  return (
    <div className={` pt-0 ${className}`}>
      {children}
    </div>
  )
}