import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Card, EmptyState } from '@/components/ui/primitives';

export function NotFound() {
  return (
    <Card className="mx-auto max-w-lg">
      <EmptyState
        icon={<Compass className="h-6 w-6" />}
        title="Page not found"
        body="That screen doesn’t exist."
        action={
          <Link to="/" className="font-semibold text-accent hover:underline">
            Go home
          </Link>
        }
      />
    </Card>
  );
}
