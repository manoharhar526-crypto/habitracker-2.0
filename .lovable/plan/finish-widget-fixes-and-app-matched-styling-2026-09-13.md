# Finish widget fixes and app-matched styling

## Outcome
Android home-screen widgets will use the app’s monochrome dark styling, fit safely at supported sizes, and never show a habit day as both completed and skipped.

## Changes
- Route every completion and skip action through one mutually exclusive state helper, including the Widgets screen and queued Android actions.
- Repair previously saved overlaps before calculating percentages or sending data to Android widgets.
- Make Android’s instant tap feedback clear the opposite state and use one consistent display priority.
- Reduce rigid calendar sizing and unnecessary footer/header space so widgets do not overlap or clip on phone launchers.
- Align widget surfaces, borders, text hierarchy, and status colors with the app’s dark neutral design.
- Mirror Android resource changes in the reusable widget template.
- Add focused tests for done/skip exclusivity and percentage safety, then run the existing checks and inspect the web preview.

## Technical details
- Completion wins when repairing old contradictory data; the newest user action wins for new taps.
- Widget export will remove skipped dates from completed dates before writing cached JSON.
- No account, storage, or sign-in behavior will change.
