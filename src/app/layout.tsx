import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Go Rabbit",
  description: "Agentic AI contributor assistant for open-source Go projects.",
}

type RootLayoutProps = {
  children: React.ReactNode
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
