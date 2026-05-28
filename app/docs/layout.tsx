import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { RootProvider } from 'fumadocs-ui/provider/next'
import { source } from '@/lib/source'
import { baseOptions } from '../layout.config'
import './docs.css'

export default function DocsRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="fd-shell">
      <RootProvider>
        <DocsLayout tree={source.pageTree} {...baseOptions}>
          {children}
        </DocsLayout>
      </RootProvider>
    </div>
  )
}
