import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAppSelector, useAppDispatch } from "@/hooks/useStore";
import { selectEvoUser } from "@/store/authSlice";
import {
  selectInstances,
  selectSelectedInstance,
  selectInstance,
} from "@/store/instanceSlice";
import { clearWorkspaces } from "@/store/workspacesSlice";
import type { EvoInstance } from "@/types/evo";

/** Combined user/instance menu button for the app header. */
export default function UserMenu() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector(selectEvoUser);
  const instances = useAppSelector(selectInstances);
  const selected = useAppSelector(selectSelectedInstance);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const displayName = user ? user.name : null;

  const initials = user
    ? user.name
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word.charAt(0).toUpperCase())
        .join("")
    : "?";

  // Deterministic colour from user ID
  const colours = [
    "bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-amber-500",
    "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-teal-500",
  ];
  const colourIndex = user?.id
    ? user.id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % colours.length
    : 0;
  const roundelColour = colours[colourIndex];

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function handleSelect(instance: EvoInstance) {
    dispatch(clearWorkspaces());
    dispatch(selectInstance(instance));
    setOpen(false);
    navigate(`/${instance.id}`);
  }

  const hasMultipleInstances = instances.length > 1;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => hasMultipleInstances && setOpen(!open)}
        className={`flex items-center gap-3 bg-transparent border-none p-2 rounded-lg transition-colors ${
          hasMultipleInstances ? "cursor-pointer hover:bg-gray-100" : "cursor-default"
        }`}
      >
        <div className={`w-8 h-8 rounded-full ${roundelColour} flex items-center justify-center text-white text-xs font-semibold shrink-0`}>
          {initials}
        </div>
        <div className="text-left">
          {displayName && (
            <div className="text-sm font-medium text-gray-900">{displayName}</div>
          )}
          {selected && (
            <div className="text-xs text-gray-500">
              {selected.displayName}{hasMultipleInstances ? " ▾" : ""}
            </div>
          )}
        </div>
      </button>

      {open && hasMultipleInstances && (
        <div className="absolute right-0 mt-1 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
          <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Instances
          </div>
          {instances.map((instance: EvoInstance) => (
            <button
              key={instance.id}
              onClick={() => handleSelect(instance)}
              className={`w-full text-left px-3 py-2 text-sm cursor-pointer border-none ${
                instance.id === selected?.id
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              {instance.displayName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
