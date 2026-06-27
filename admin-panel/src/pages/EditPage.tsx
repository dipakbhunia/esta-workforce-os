import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import EntityFormPage from './EntityFormPage';

export default function EditPage() {
  const location = useLocation();
  const title = useMemo(() => titleFromPath(location.pathname, 'Edit'), [location.pathname]);
  return <EntityFormPage title={title} description="Edit workflow placeholder with sticky save actions and sectioned fields." />;
}

function titleFromPath(path: string, prefix: string) {
  const parts = path.split('/').filter(Boolean).filter((part) => part !== 'edit');
  const label = parts.at(-2)?.replaceAll('-', ' ') ?? parts.at(-1)?.replaceAll('-', ' ') ?? 'record';
  return `${prefix} ${label.replace(/\b\w/g, (match) => match.toUpperCase())}`;
}
