"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { LazyFab } from "@/components/ui/LazyFab";
import FabOfferSheet from "@/components/ui/FabOfferSheet";
import type { FabEditTarget } from "@/components/ui/Fab";

export type FabCreationOriginRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type FabCreationRequest = {
  id: number;
  type: "GOAL" | "PROJECT" | "TASK" | "HABIT";
  monumentId?: string | null;
  circleId?: string | null;
  areaId?: string | null;
  goalId?: string | null;
  campaignId?: string | null;
  projectId?: string | null;
  routineId?: string | null;
  skillId?: string | null;
  originRect?: FabCreationOriginRect | null;
  preserveDrawer?: FabCreationPreservedDrawer | null;
  courseContext?: FabCourseAuthoringContext | null;
};

export type FabCreationPreservedDrawer = {
  type: "campaign" | "goal" | "routine";
  id: string;
  parentId?: string | null;
};

export type FabCourseAuthoringContext = {
  courseId: string;
  parentNodeId?: string | null;
  parentNodeType?: "GOAL" | "PROJECT" | "TASK" | "HABIT" | null;
  position?: number | null;
};

type FabCreationRequestOptions = {
  monumentId?: string | null;
  circleId?: string | null;
  areaId?: string | null;
  skillId?: string | null;
  preserveDrawer?: FabCreationPreservedDrawer | null;
  courseContext?: FabCourseAuthoringContext | null;
};

type FabCreationContextValue = {
  creationRequest: FabCreationRequest | null;
  editRequest: FabEditTarget | null;
  openOfferChooser: () => void;
  requestGoalCreation: (
    originRect?: FabCreationOriginRect | null,
    campaignId?: string | null,
    options?: FabCreationRequestOptions,
  ) => void;
  requestProjectCreation: (
    goalId?: string | null,
    originRect?: FabCreationOriginRect | null,
    options?: FabCreationRequestOptions,
  ) => void;
  requestTaskCreation: (
    projectId?: string | null,
    goalId?: string | null,
    originRect?: FabCreationOriginRect | null,
    options?: FabCreationRequestOptions,
  ) => void;
  requestHabitCreation: (
    originRect?: FabCreationOriginRect | null,
    defaults?: {
      routineId?: string | null;
      skillId?: string | null;
    } | null,
    options?: FabCreationRequestOptions,
  ) => void;
  requestEntityEdit: (target: FabEditTarget) => void;
};

const FabCreationContext = createContext<FabCreationContextValue | null>(null);
export function FabCreationProvider({ children }: { children: ReactNode }) {
  const [creationRequest, setCreationRequest] =
    useState<FabCreationRequest | null>(null);
  const [editRequest, setEditRequest] = useState<FabEditTarget | null>(null);
  const [offerSheetOpen, setOfferSheetOpen] = useState(false);
  const nextRequestIdRef = useRef(0);

  const requestGoalCreation = useCallback(
    (
      originRect?: FabCreationOriginRect | null,
      campaignId?: string | null,
      options?: FabCreationRequestOptions,
    ) => {
      nextRequestIdRef.current += 1;
      setCreationRequest({
        id: nextRequestIdRef.current,
        type: "GOAL",
        monumentId: options?.monumentId ?? null,
        circleId: options?.circleId ?? null,
        areaId: options?.areaId ?? null,
        goalId: null,
        campaignId: campaignId ?? null,
        originRect: originRect ?? null,
        preserveDrawer: options?.preserveDrawer ?? null,
        courseContext: options?.courseContext ?? null,
      });
    },
    [],
  );

  const requestProjectCreation = useCallback(
    (
      goalId?: string | null,
      originRect?: FabCreationOriginRect | null,
      options?: FabCreationRequestOptions,
    ) => {
      nextRequestIdRef.current += 1;
      setCreationRequest({
        id: nextRequestIdRef.current,
        type: "PROJECT",
        goalId: goalId ?? null,
        skillId: options?.skillId ?? null,
        originRect: originRect ?? null,
        preserveDrawer: options?.preserveDrawer ?? null,
        courseContext: options?.courseContext ?? null,
      });
    },
    [],
  );

  const requestTaskCreation = useCallback(
    (
      projectId?: string | null,
      goalId?: string | null,
      originRect?: FabCreationOriginRect | null,
      options?: FabCreationRequestOptions,
    ) => {
      nextRequestIdRef.current += 1;
      setCreationRequest({
        id: nextRequestIdRef.current,
        type: "TASK",
        goalId: goalId ?? null,
        projectId: projectId ?? null,
        originRect: originRect ?? null,
        courseContext: options?.courseContext ?? null,
      });
    },
    [],
  );

  const requestHabitCreation = useCallback(
    (
      originRect?: FabCreationOriginRect | null,
      defaults?: {
        routineId?: string | null;
        skillId?: string | null;
      } | null,
      options?: FabCreationRequestOptions,
    ) => {
      nextRequestIdRef.current += 1;
      setCreationRequest({
        id: nextRequestIdRef.current,
        type: "HABIT",
        routineId: defaults?.routineId ?? null,
        skillId: defaults?.skillId ?? null,
        originRect: originRect ?? null,
        preserveDrawer: options?.preserveDrawer ?? null,
        courseContext: options?.courseContext ?? null,
      });
    },
    [],
  );

  const requestEntityEdit = useCallback((target: FabEditTarget) => {
    setEditRequest({ ...target });
  }, []);

  const clearEditRequest = useCallback(() => {
    setEditRequest(null);
  }, []);

  const openOfferChooser = useCallback(() => {
    setOfferSheetOpen(true);
  }, []);

  const value = useMemo(
    () => ({
      creationRequest,
      editRequest,
      openOfferChooser,
      requestGoalCreation,
      requestProjectCreation,
      requestTaskCreation,
      requestHabitCreation,
      requestEntityEdit,
    }),
    [
      creationRequest,
      editRequest,
      openOfferChooser,
      requestGoalCreation,
      requestProjectCreation,
      requestTaskCreation,
      requestHabitCreation,
      requestEntityEdit,
    ],
  );

  return (
    <FabCreationContext.Provider value={value}>
      {children}
      <LazyFab
        creationRequest={creationRequest}
        editTarget={editRequest}
        onEditClose={clearEditRequest}
        onEditSaved={clearEditRequest}
        hideLauncher
        portalToBody
        prewarm
      />
      <FabOfferSheet
        open={offerSheetOpen}
        onOpenChange={setOfferSheetOpen}
      />
    </FabCreationContext.Provider>
  );
}

export function useFabCreation() {
  return useContext(FabCreationContext);
}
