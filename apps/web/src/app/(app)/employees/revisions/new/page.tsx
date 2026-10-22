import { Suspense } from 'react';
import { BulkRevisionPage } from '@/features/bulk-revision/bulk-revision-page';

export default function Page() {
  // useSearchParams needs a Suspense boundary above it.
  return (
    <Suspense>
      <BulkRevisionPage />
    </Suspense>
  );
}
