import { Button } from '@mui/material';
import { Download, RefreshCw, RotateCcw } from 'lucide-react';

export function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outlined" startIcon={<RotateCcw size={17} />} onClick={onClick}>
      Reset
    </Button>
  );
}

export function RefreshButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outlined" startIcon={<RefreshCw size={17} />} onClick={onClick}>
      Refresh
    </Button>
  );
}

export function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outlined" startIcon={<Download size={17} />} onClick={onClick}>
      Export
    </Button>
  );
}
