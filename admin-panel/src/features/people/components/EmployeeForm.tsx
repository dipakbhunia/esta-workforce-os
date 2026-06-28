import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, Button, CircularProgress, MenuItem, Stack, TextField } from '@mui/material';
import { RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, type Control, useForm } from 'react-hook-form';
import { FormActions } from '@/components/form-actions';
import { SectionCard } from '@/components/section-card';
import { useBranches, useDepartments, useDesignations, useShifts } from '@/features/organization/hooks';
import { useUsers } from '../hooks';
import type { Employee, EmployeeFormValues } from '../types/employee.types';
import { employeeCodeFromName, employeeDefaults, employeeFormSchema, employeeStatuses, employmentTypes, toEmployeeCreatePayload, toEmployeeUpdatePayload, workModes } from '../utils/employee-form';

interface EmployeeFormProps {
  employee?: Employee;
  loading?: boolean;
  submitLabel: string;
  onSubmit: (values: ReturnType<typeof toEmployeeCreatePayload> | ReturnType<typeof toEmployeeUpdatePayload>) => Promise<void>;
}

export function EmployeeForm({ employee, loading = false, submitLabel, onSubmit }: EmployeeFormProps) {
  const isEdit = Boolean(employee);
  const [manualCode, setManualCode] = useState(Boolean(employee));
  const initialValues = useRef(employeeDefaults(employee));
  const { control, handleSubmit, formState: { errors, isDirty }, reset, watch, setValue } = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: initialValues.current,
  });
  const userId = watch('userId');
  const firstName = watch('firstName');
  const lastName = watch('lastName');
  const usersQuery = useUsers();
  const branchesQuery = useBranches();
  const departmentsQuery = useDepartments();
  const designationsQuery = useDesignations();
  const shiftsQuery = useShifts();
  const users = (usersQuery.data?.data.data ?? []).filter((user) => !user.employee && !user._count?.employee && !user._count?.employees);
  const selectedUser = useMemo(() => users.find((user) => user.id === userId), [userId, users]);

  useEffect(() => {
    if (!selectedUser || isEdit) return;
    setValue('firstName', selectedUser.firstName, { shouldDirty: true });
    setValue('lastName', selectedUser.lastName, { shouldDirty: true });
    setValue('email', selectedUser.email, { shouldDirty: true });
  }, [isEdit, selectedUser, setValue]);

  useEffect(() => {
    if (!manualCode) {
      setValue('employeeCode', employeeCodeFromName(firstName, lastName), { shouldDirty: true, shouldValidate: true });
    }
  }, [firstName, lastName, manualCode, setValue]);

  useEffect(() => {
    // TODO: Add in-app route blocking once the router layer exposes a stable blocker API for data routers.
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isDirty]);

  const submit = handleSubmit(async (values) => {
    await onSubmit(isEdit ? toEmployeeUpdatePayload(values) : toEmployeeCreatePayload(values));
    reset(values);
  });

  return (
    <Stack component="form" gap={3} onSubmit={submit}>
      <SectionCard title="Personal" description="Personal identity is sourced from an existing user account.">
        <Stack gap={2}>
          <SelectorState query={usersQuery} label="Users" empty="No active users found. Create a user before creating an employee profile." />
          <Controller
            control={control}
            name="userId"
            render={({ field }) => (
              <TextField
                {...field}
                select
                label="User Account"
                disabled={isEdit}
                fullWidth
                error={Boolean(errors.userId)}
                helperText={errors.userId?.message ?? 'Select a user without an existing employee profile.'}
                InputProps={{ endAdornment: usersQuery.isLoading ? <CircularProgress size={18} sx={{ mr: 2 }} /> : undefined }}
              >
                <MenuItem value="">Select user</MenuItem>
                {users.map((user) => <MenuItem key={user.id} value={user.id}>{user.firstName} {user.lastName} ({user.email})</MenuItem>)}
              </TextField>
            )}
          />
          <Box sx={formGrid}>
            <Controller control={control} name="firstName" render={({ field }) => <TextField {...field} label="First Name" fullWidth disabled helperText="Managed in User Management." />} />
            <Controller control={control} name="lastName" render={({ field }) => <TextField {...field} label="Last Name" fullWidth disabled helperText="Managed in User Management." />} />
            <Controller control={control} name="email" render={({ field }) => <TextField {...field} label="Email" fullWidth disabled helperText="Managed in User Management." />} />
            <Controller control={control} name="mobile" render={({ field }) => <TextField {...field} label="Mobile" fullWidth error={Boolean(errors.mobile)} helperText={errors.mobile?.message ?? 'Saved as employee phone.'} />} />
          </Box>
        </Stack>
      </SectionCard>

      <SectionCard title="Organization" description="Assign employee to organization foundations.">
        <Stack gap={2}>
          <Box sx={formGrid}>
            <Controller
              control={control}
              name="employeeCode"
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Employee Code"
                  fullWidth
                  error={Boolean(errors.employeeCode)}
                  helperText={errors.employeeCode?.message ?? 'Auto-generated from selected user until manually edited.'}
                  onChange={(event) => {
                    setManualCode(true);
                    field.onChange(event);
                  }}
                />
              )}
            />
          </Box>
          <SelectorState query={branchesQuery} label="Branches" empty="No branches found. You can save without branch." />
          <SelectorState query={departmentsQuery} label="Departments" empty="No departments found. You can save without department." />
          <SelectorState query={designationsQuery} label="Designations" empty="No designations found. You can save without designation." />
          <SelectorState query={shiftsQuery} label="Shifts" empty="No shifts found. You can save without shift." />
          <Box sx={formGrid}>
            <SelectField control={control} name="branchId" label="Branch" items={branchesQuery.data?.data.data ?? []} loading={branchesQuery.isLoading} />
            <SelectField control={control} name="departmentId" label="Department" items={departmentsQuery.data?.data.data ?? []} loading={departmentsQuery.isLoading} />
            <SelectField control={control} name="designationId" label="Designation" items={designationsQuery.data?.data.data ?? []} loading={designationsQuery.isLoading} />
            <SelectField control={control} name="shiftId" label="Shift" items={shiftsQuery.data?.data.data ?? []} loading={shiftsQuery.isLoading} />
          </Box>
        </Stack>
      </SectionCard>

      <SectionCard title="Employment" description="Employment classification and current profile status.">
        <Box sx={formGrid}>
          <Controller control={control} name="employmentType" render={({ field }) => (
            <TextField {...field} select label="Employment Type" fullWidth>
              {employmentTypes.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
            </TextField>
          )} />
          <Controller control={control} name="workMode" render={({ field }) => (
            <TextField {...field} select label="Work Mode" fullWidth>
              {workModes.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
            </TextField>
          )} />
          <Controller control={control} name="joiningDate" render={({ field }) => <TextField {...field} type="date" label="Joining Date" fullWidth error={Boolean(errors.joiningDate)} helperText={errors.joiningDate?.message} InputLabelProps={{ shrink: true }} />} />
          <Controller control={control} name="status" render={({ field }) => (
            <TextField {...field} select label="Status" fullWidth>
              {employeeStatuses.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
            </TextField>
          )} />
        </Box>
      </SectionCard>

      <FormActions cancelTo="/people/employees" submitLabel={submitLabel} loading={loading} />
    </Stack>
  );
}

function SelectorState({ query, label, empty }: { query: { isError: boolean; isLoading: boolean; data?: { data: { data: unknown[] } }; refetch: () => unknown }; label: string; empty: string }) {
  const items = query.data?.data.data ?? [];
  if (query.isError) {
    return (
      <Alert severity="error" action={<Button color="inherit" size="small" startIcon={<RefreshCw size={16} />} onClick={() => void query.refetch()}>Retry</Button>}>
        {label} could not be loaded.
      </Alert>
    );
  }
  if (!query.isLoading && items.length === 0) return <Alert severity="info">{empty}</Alert>;
  return null;
}

function SelectField({ control, name, label, items, loading }: { control: Control<EmployeeFormValues, unknown, EmployeeFormValues>; name: 'branchId' | 'departmentId' | 'designationId' | 'shiftId'; label: string; items: Array<{ id: string; name: string; code: string }>; loading: boolean }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <TextField
          {...field}
          select
          label={label}
          fullWidth
          helperText="Optional"
          InputProps={{ endAdornment: loading ? <CircularProgress size={18} sx={{ mr: 2 }} /> : undefined }}
        >
          <MenuItem value="">No {label.toLowerCase()} assigned</MenuItem>
          {items.map((item) => <MenuItem key={item.id} value={item.id}>{item.name} ({item.code})</MenuItem>)}
        </TextField>
      )}
    />
  );
}

const formGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
  gap: 2,
};
