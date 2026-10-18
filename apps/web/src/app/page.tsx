import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HealthStatus } from '@/features/health/health-status';

export default function HomePage() {
  return (
    <main className="px-4 py-6 md:px-8">
      <Card className="max-w-sm">
        <CardHeader>
          <CardTitle>API health</CardTitle>
        </CardHeader>
        <CardContent>
          <HealthStatus />
        </CardContent>
      </Card>
    </main>
  );
}
