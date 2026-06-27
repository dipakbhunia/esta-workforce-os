# Admin Panel Foundation Notes

- The current Vite build may warn about large chunks because dummy data and MUI DataGrid are included in the foundation bundle.
- This is acceptable for the UI foundation phase.
- When real modules are implemented, split large dummy/data-grid surfaces per feature route.
