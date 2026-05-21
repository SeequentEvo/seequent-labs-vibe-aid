import { useAppSelector, useAppDispatch } from "@/hooks/useStore";
import { Navigate, useNavigate } from "react-router-dom";
import {
  selectInstances,
  selectInstance,
} from "@/store/instanceSlice";
import {
  INSTANCE_SESSION_KEY,
  INSTANCE_LOCAL_KEY,
} from "@/store/instanceSlice";
import type { EvoInstance } from "@/types/evo";
import { useState } from "react";
import { tryParseOrgId } from "@/types/ids";

/**
 * Landing page at `/`.
 * - If a persisted instance ID matches a discovered instance, redirect to it.
 * - If only one instance, auto-select and redirect.
 * - Otherwise, show the instance picker.
 */
export default function InstancePicker() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const instances = useAppSelector(selectInstances);

  // Check for persisted instance (validate UUID so corrupted storage is ignored)
  const rawPersisted =
    sessionStorage.getItem(INSTANCE_SESSION_KEY) ??
    localStorage.getItem(INSTANCE_LOCAL_KEY);
  const persistedId = tryParseOrgId(rawPersisted);
  const persisted = persistedId
    ? instances.find((i) => i.id === persistedId)
    : undefined;

  // Auto-redirect for persisted or single instance
  if (persisted) {
    return <Navigate to={`/instances/${persisted.id}`} replace />;
  }
  if (instances.length === 1 && instances[0]) {
    return <Navigate to={`/instances/${instances[0].id}`} replace />;
  }

  return <Picker instances={instances} onSelect={(instance) => {
    dispatch(selectInstance(instance));
    navigate(`/instances/${instance.id}`);
  }} />;
}

function Picker({ instances, onSelect }: { instances: EvoInstance[]; onSelect: (i: EvoInstance) => void }) {
  const [selectedId, setSelectedId] = useState<string>(instances[0]?.id ?? "");

  function handleContinue() {
    const instance = instances.find((i) => i.id === selectedId);
    if (instance) onSelect(instance);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow p-8 max-w-md w-full">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Select an Evo instance
        </h2>
        <div className="space-y-2 mb-6">
          {instances.map((instance) => (
            <label
              key={instance.id}
              className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${
                selectedId === instance.id
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name="instance"
                value={instance.id}
                checked={selectedId === instance.id}
                onChange={() => setSelectedId(instance.id)}
                className="mr-3"
              />
              <span className="text-gray-900">{instance.displayName}</span>
            </label>
          ))}
        </div>
        <button
          onClick={handleContinue}
          disabled={!selectedId}
          className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
