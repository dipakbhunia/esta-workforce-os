import { TextField } from '@mui/material';

interface DateRangeFilterProps {
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
}

export function DateRangeFilter({ dateFrom, dateTo, onDateFromChange, onDateToChange }: DateRangeFilterProps) {
  return (
    <>
      <TextField
        label="Date From"
        type="date"
        size="small"
        value={dateFrom}
        onChange={(event) => onDateFromChange(event.target.value)}
        InputLabelProps={{ shrink: true }}
      />
      <TextField
        label="Date To"
        type="date"
        size="small"
        value={dateTo}
        onChange={(event) => onDateToChange(event.target.value)}
        InputLabelProps={{ shrink: true }}
      />
    </>
  );
}
