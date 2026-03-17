# Product Tour Debugging Guide

Remediate v1.9.0 introduces a robust, multi-page product tour using `shepherd.js`. To facilitate development and support, a built-in debug mode is available.

## How to Trigger Debug Mode

You can force the product tour to trigger on any supported page by appending the `debugTour=true` query parameter to the URL.

### Supported Pages
- **Dashboard**: `http://localhost:3000/dashboard?debugTour=true`
- **Buckets (Sites)**: `http://localhost:3000/sites?debugTour=true`
- **Security Tools**: `http://localhost:3000/tools?debugTour=true`

## Behavior in Debug Mode

1.  **Skip Persistence Check**: The tour will manifest even if the user has already completed it (i.e., it ignores the `completedTours` field in the database).
2.  **Manifestation**: The tour starts automatically after a short delay (500ms) to ensure the DOM is fully hydrated.
3.  **Completion**: Completing or canceling the tour in debug mode will still attempt to send a completion request to the API, but it won't prevent the tour from appearing again the next time you use the debug parameter.

## Troubleshooting

### Tour Not Appearing
1.  **Query Parameter**: Ensure there is a `?` if it's the first parameter, or an `&` if it's additional (e.g., `/dashboard?foo=bar&debugTour=true`).
2.  **DOM Selectors**: The tour relies on specific CSS selectors to attach. If the UI structure changes, the tour might not find its anchor.
    - Check for "Target not mounted" warnings in the browser console.
3.  **CSP Violations**: If the tour appears but looks broken or is non-interactive, check the console for "Content Security Policy" errors. In v1.9.0, we use a strict nonce-based policy.

## Technical Implementation
The debug logic is controlled in `components/ProductTour.tsx`:
```tsx
const searchParams = useSearchParams();
const isDebug = searchParams.get("debugTour") === "true";
// ...
if (currentSteps && (isDebug || !completedTours.includes(tourId))) {
  tour.start();
}
```
