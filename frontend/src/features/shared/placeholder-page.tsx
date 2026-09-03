import { Card, CardContent } from '@/components/ui/card'
import { Construction } from 'lucide-react'

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center px-6 py-20 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Construction className="h-6 w-6 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Este módulo está planeado no roadmap. A próxima fase de desenvolvimento irá implementar esta funcionalidade.
        </p>
      </CardContent>
    </Card>
  )
}
