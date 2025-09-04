import SharedLayoutBridge from '@/app/components/transition/SharedLayoutBridge';
import { MonumentHeader } from './MonumentHeader';
import { MonumentGoals } from './MonumentGoals';

interface PageProps {
  params: { id: string };
}

export default function MonumentPage({ params }: PageProps) {
  const { id } = params;
  return (
    <SharedLayoutBridge>
      <MonumentHeader id={id} />
      <MonumentGoals id={id} />
    </SharedLayoutBridge>
  );
}

