# Account Picker

`AccountPickerScreen.tsx` owns the shared searchable, reorderable account list
used by the public-home account switcher and Settings → Accounts. Its explicit
`select` mode delegates row activation to account switching; `manage` mode
delegates the same row activation to account settings and never changes the
active account. The parent owns navigation, add-account routing, and refreshed
account state.
