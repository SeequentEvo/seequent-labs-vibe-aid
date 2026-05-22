import { useEffect } from "react";
import { useParams, Navigate, Outlet } from "react-router-dom";
import { useAppSelector, useAppDispatch } from "@/hooks/useStore";
import {
  selectInstances,
  selectSelectedInstance,
  selectInstance,
} from "@/store/instanceSlice";
import { clearWorkspaces } from "@/store/workspacesSlice";
import { tryParseOrgId } from "@/types/ids";

/**
 * Resolves the :instanceId URL param against discovered instances.
 * Selects the instance in Redux if it matches; redirects to "/" if not found
 * or if the param is not a valid UUID.
 */
export default function InstanceGuard() {
  const dispatch = useAppDispatch();
  const { instanceId } = useParams<{ instanceId: string }>();
  const instances = useAppSelector(selectInstances);
  const selected = useAppSelector(selectSelectedInstance);

  const parsedId = tryParseOrgId(instanceId);
  const matched = parsedId ? instances.find((i) => i.id === parsedId) : undefined;

  useEffect(() => {
    if (matched && matched.id !== selected?.id) {
      dispatch(clearWorkspaces());
      dispatch(selectInstance(matched));
    }
  }, [matched, selected?.id, dispatch]);

  if (!matched) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
