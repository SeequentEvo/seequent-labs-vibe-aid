// Replace this page with your app content.
// The header bar above is provided by Layout.tsx and can stay as-is.
//
// Context available via Redux:
//   - auth:      selectAccessToken (src/store/authSlice)
//   - instance:  selectSelectedInstance (src/store/instanceSlice)
//   - workspace: loadWorkspaceSummaries / selectWorkspaceSummaries (src/store/workspacesSlice)

export default function Home() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center max-w-lg">
        <p className="text-lg font-semibold text-gray-500">Your app content goes here</p>
        <p className="mt-2 text-sm text-gray-400">
          Replace <code className="font-mono bg-gray-100 px-1 rounded">src/pages/Home.tsx</code> with
          your application's main view.
        </p>
      </div>
    </div>
  );
}

