import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import EntityFormPage from './EntityFormPage';

export default function CreatePage() {
  const location = useLocation();
  const title = useMemo(() => titleFromPath(location.pathname, 'Create'), [location.pathname]);
  return <EntityFormPage title={title} description="Create workflow placeholder with validation-ready form sections." />;
}

function titleFromPath(path: string, prefix: string) {
  const parts = path.split('/').filter(Boolean).filter((part) => part !== 'create');
  const label = parts.at(-1)?.replaceAll('-', ' ') ?? 'record';
  return `${prefix} ${label.replace(/\b\w/g, (match) => match.toUpperCase())}`;
}
