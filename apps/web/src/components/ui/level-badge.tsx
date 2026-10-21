import { Badge } from './badge';

export function LevelBadge({ code }: { code: string }) {
  return (
    <Badge variant="outline" className="tabular-nums">
      {code}
    </Badge>
  );
}
