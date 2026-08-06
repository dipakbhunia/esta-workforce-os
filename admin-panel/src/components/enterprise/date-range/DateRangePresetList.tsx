import { List, ListItemButton, ListItemText } from '@mui/material';
import { dateRangePresetLabels, dateRangePresets, type DateRangePreset } from './date-range-utils';

interface DateRangePresetListProps {
  selectedPreset: DateRangePreset;
  onSelect: (preset: DateRangePreset) => void;
}

export function DateRangePresetList({ selectedPreset, onSelect }: DateRangePresetListProps) {
  return (
    <List dense aria-label="Date range presets" sx={{ width: { xs: '100%', md: 190 }, borderRight: { xs: 0, md: 1 }, borderColor: 'divider', pr: { xs: 0, md: 1 }, display: { xs: 'grid', sm: 'grid', md: 'block' }, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', md: 'none' }, gap: { xs: 0.5, md: 0 } }}>
      {dateRangePresets.map((preset) => (
        <ListItemButton key={preset} selected={selectedPreset === preset} onClick={() => onSelect(preset)} sx={{ borderRadius: 2, mb: { xs: 0, md: 0.25 } }}>
          <ListItemText primary={dateRangePresetLabels[preset]} primaryTypographyProps={{ variant: 'body2', fontWeight: selectedPreset === preset ? 700 : 500 }} />
        </ListItemButton>
      ))}
    </List>
  );
}