import { Suspense } from 'react';
import { BulkRevisionSheet } from '@/features/bulk-revision/bulk-revision-sheet';

export default function BulkRevisionDrawerPage() {
  // useSearchParams needs a Suspense boundary above it.
  return (
    <Suspense>
      <BulkRevisionSheet />
    </Suspense>
  );
}
