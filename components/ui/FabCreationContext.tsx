"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { LazyFab } from "@/components/ui/LazyFab";
import type { FabEditTarget } from "@/components/ui/Fab";
import { hapticPress } from "@/lib/haptics/creatorHaptics";

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
  goalId?: string | null;
  campaignId?: string | null;
  projectId?: string | null;
  routineId?: string | null;
  skillId?: string | null;
  originRect?: FabCreationOriginRect | null;
  preserveDrawer?: FabCreationPreservedDrawer | null;
};

export type FabCreationPreservedDrawer = {
  type: "campaign" | "goal" | "routine";
  id: string;
  parentId?: string | null;
};

type FabCreationRequestOptions = {
  monumentId?: string | null;
  skillId?: string | null;
  preserveDrawer?: FabCreationPreservedDrawer | null;
};

type FabOfferChooserType = "PRODUCT" | "SERVICE";

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
const FAB_OFFER_CHOOSER_Z_INDEX = 2147483680;

function FabOfferChooserPortal({
  isOpen,
  onClose,
  onSelect,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (type: FabOfferChooserType) => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!mounted || typeof document === "undefined") {
    return null;
  }

  const stopPropagation = (event: SyntheticEvent) => {
    event.stopPropagation();
  };

  return createPortal(
    <AnimatePresence initial={false}>
      {isOpen ? (
        <motion.div
          className="fixed inset-0 flex items-center justify-center px-4 py-6"
          style={{ zIndex: FAB_OFFER_CHOOSER_Z_INDEX }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          onPointerDown={stopPropagation}
          onMouseDown={stopPropagation}
          onTouchStart={stopPropagation}
        >
          <button
            type="button"
            aria-label="Close offer chooser"
            className="absolute inset-0 cursor-default bg-black/48 backdrop-blur-[3px]"
            onClick={onClose}
            onPointerDown={stopPropagation}
            onMouseDown={stopPropagation}
            onTouchStart={stopPropagation}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Choose offer type"
            className="relative w-full max-w-[288px] overflow-hidden rounded-[24px] border border-white/[0.12] bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.09),transparent_52%),linear-gradient(145deg,rgba(16,16,18,0.96)_0%,rgba(8,8,10,0.98)_58%,rgba(3,3,5,0.99)_100%)] p-3 shadow-[0_24px_70px_rgba(0,0,0,0.62),inset_0_1px_0_rgba(255,255,255,0.10)] backdrop-blur-2xl"
            onClick={stopPropagation}
            onPointerDown={stopPropagation}
            onMouseDown={stopPropagation}
            onTouchStart={stopPropagation}
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", stiffness: 520, damping: 36 }}
          >
            <div className="grid grid-cols-2 gap-3">
              {(["PRODUCT", "SERVICE"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => onSelect(type)}
                  className="group flex aspect-square min-h-[118px] items-center justify-center rounded-[18px] border border-white/[0.10] bg-white/[0.045] px-3 text-center text-[11px] font-semibold tracking-[0.18em] text-zinc-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_14px_30px_rgba(0,0,0,0.28)] transition hover:border-white/20 hover:bg-white/[0.075] hover:text-white active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
                >
                  <span className="leading-tight">add {type}</span>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

export function FabCreationProvider({ children }: { children: ReactNode }) {
  const [creationRequest, setCreationRequest] =
    useState<FabCreationRequest | null>(null);
  const [editRequest, setEditRequest] = useState<FabEditTarget | null>(null);
  const [offerChooserOpen, setOfferChooserOpen] = useState(false);
  const nextRequestIdRef = useRef(0);
  const router = useRouter();

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
        goalId: null,
        campaignId: campaignId ?? null,
        originRect: originRect ?? null,
        preserveDrawer: options?.preserveDrawer ?? null,
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
      });
    },
    [],
  );

  const requestTaskCreation = useCallback(
    (
      projectId?: string | null,
      goalId?: string | null,
      originRect?: FabCreationOriginRect | null,
    ) => {
      nextRequestIdRef.current += 1;
      setCreationRequest({
        id: nextRequestIdRef.current,
        type: "TASK",
        goalId: goalId ?? null,
        projectId: projectId ?? null,
        originRect: originRect ?? null,
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
    setOfferChooserOpen(true);
  }, []);

  const closeOfferChooser = useCallback(() => {
    setOfferChooserOpen(false);
  }, []);

  const handleOfferChooserSelect = useCallback(
    (type: FabOfferChooserType) => {
      void hapticPress();
      setOfferChooserOpen(false);
      router.push(`/source?create=${type.toLowerCase()}`);
    },
    [router],
  );

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
      <FabOfferChooserPortal
        isOpen={offerChooserOpen}
        onClose={closeOfferChooser}
        onSelect={handleOfferChooserSelect}
      />
    </FabCreationContext.Provider>
  );
}

export function useFabCreation() {
  return useContext(FabCreationContext);
}
